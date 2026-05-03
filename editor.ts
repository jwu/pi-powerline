/**
 * Custom Editor Extension
 *
 * Replaces the default editor with a bordered input area using a ❯ prompt prefix.
 * Switches to bash-mode coloring when the prompt starts with !.
 * Controlled by .pi/settings.json → customEditor (boolean, default true).
 * Toggle at runtime with /editor command.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type EditorTheme, truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ThemeColor,
} from '@mariozechner/pi-coding-agent';
/** Pure transform: add > prompt prefix and borders to rendered editor lines. */
function renderPromptPrefix(
  lines: string[],
  width: number,
  borderChar: string,
  prefixChar: string,
  indentChar: string,
): string[] {
  if (lines.length < 3) return lines;

  let bottomIdx = lines.length - 1;
  for (let i = lines.length - 1; i >= 1; i--) {
    const stripped = (lines[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      bottomIdx = i;
      break;
    }
  }

  const result: string[] = [];

  result.push(borderChar.repeat(width));

  for (let i = 1; i < bottomIdx; i++) {
    if (i === 1) {
      result.push(prefixChar + ' ' + (lines[i] ?? ''));
    } else {
      result.push(indentChar + ' ' + (lines[i] ?? ''));
    }
  }

  if (bottomIdx === 1) {
    result.push(prefixChar + ' ' + ' '.repeat(width - 2));
  }

  result.push(borderChar.repeat(width));

  for (let i = bottomIdx + 1; i < lines.length; i++) {
    result.push(lines[i] ?? '');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// nerd font detection & widget layout helpers (inline, mirrors widget.ts)
// ═══════════════════════════════════════════════════════════════════════════

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const NERD_ED = hasNerdFonts();
const ICON_MODEL = NERD_ED ? '\uF4BC' : '';
const ICON_FOLDER = NERD_ED ? '\uF115' : 'dir';
const SEP = NERD_ED ? '\uE0B1' : '|';

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

// hex → ANSI true color (model/folder use hex, match widget.ts colors)
function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

// widget info live state, updated by enable/model_select
let liveCtx: ExtensionContext | null = null;
let liveEditorTui: any = null;

let currentTheme: Theme | null = null;

/** Update a flag value in `cwd/.pi/settings.json` for persistence across restarts. */
function updateSettingsFlag(cwd: string, flagName: string, value: boolean): void {
  const settingsDir = join(cwd, '.pi');
  const settingsPath = join(settingsDir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content || '{}');
    } catch {
      settings = {};
    }
  } else if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  settings[flagName] = value;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/** Read a flag value from `cwd/.pi/settings.json`, falling back to `fallback`. */
function getSettingsFlag(cwd: string, flagName: string, fallback: boolean): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content || '{}');
      if (flagName in settings) return !!settings[flagName];
    } catch {
      // ignore parse errors
    }
  }
  return fallback;
}

/** Maps each editor element to a pi theme color token. @example PromptPrefixEditor.colorTokens.prefix = "success"; */
export interface PromptPrefixColorTokens {
  border?: ThemeColor;
  prefix?: ThemeColor;
  indent?: ThemeColor;
}

/** Custom editor with a > prompt prefix. Colors use `PromptPrefixColorTokens`. */
export class PromptPrefixEditor extends CustomEditor {
  static colorTokens: PromptPrefixColorTokens = {
    border: 'borderAccent',
    prefix: 'dim',
    indent: 'border',
  };

  render(width: number): string[] {
    const contentWidth = Math.max(1, width - 2);
    const lines = super.render(contentWidth);
    if (lines.length < 3) return lines;

    const theme = currentTheme;
    const color = (token: ThemeColor | undefined, text: string) =>
      !theme || !token ? text : theme.fg(token, text);

    // Bash mode: when text starts with !, switch to bashMode coloring
    const isBash = this.getText().trimStart().startsWith('!');
    const tokens = isBash
      ? {
          border: 'bashMode' as ThemeColor,
          prefix: 'bashMode' as ThemeColor,
          indent: 'bashMode' as ThemeColor,
        }
      : PromptPrefixEditor.colorTokens;

    const result = renderPromptPrefix(
      lines,
      width,
      color(tokens.border, '─'),
      color(tokens.prefix, '❯'),
      tokens.indent ? color(tokens.indent, ' ') : ' ',
    );

    // Embed widget info (model + folder) into the top border line
    // Format: '─ model sep folder ────────────────'
    const ctx = liveCtx;
    if (ctx && theme) {
      const cwd = ctx.cwd ?? process.cwd();
      const folder = basename(cwd) || cwd;
      const modelName = ctx.model?.name || ctx.model?.id || 'no-model';

      const modelText = withIcon(ICON_MODEL, modelName);
      const folderText = withIcon(ICON_FOLDER, folder);

      const infoPart =
        hexFg('#d787af', modelText) + theme.fg('dim', ` ${SEP} `) + hexFg('#00afaf', folderText);

      const infoWidth = visibleWidth(infoPart);
      // '─ ' (2) + info + ' ' (1) + dashes → total width
      let paddingLen = width - 3 - infoWidth;
      let displayInfo = infoPart;

      if (paddingLen < 2) {
        // info too wide or not enough dashes, truncate with ellipsis, keep at least 2 dashes
        const minDashes = 2;
        const availForInfo = width - 3 - minDashes;
        if (availForInfo > 0) {
          displayInfo = truncateToWidth(infoPart, availForInfo, '...');
          paddingLen = width - 3 - visibleWidth(displayInfo);
        }
      }

      if (paddingLen >= 0) {
        const borderColored = color(tokens.border, '─');
        result[0] =
          borderColored + ' ' + displayInfo + ' ' + color(tokens.border, '─'.repeat(paddingLen));
      }
    }

    return result;
  }
}

export function updateTheme(theme: Theme): void {
  currentTheme = theme;
}

/** Register the custom editor extension: flag and auto-enable on session start. */
export function registerEditor(pi: ExtensionAPI) {
  pi.registerFlag('customEditor', {
    description: 'Enable custom prompt-prefix editor',
    type: 'boolean',
    default: true,
  });

  let editorEnabled = true;

  function createEditorFactory() {
    return (tui: any, theme: EditorTheme, keybindings: any) => {
      liveEditorTui = tui;
      return new PromptPrefixEditor(tui, theme, keybindings);
    };
  }

  function enable(ctx: ExtensionContext) {
    editorEnabled = true;
    liveCtx = ctx;
    currentTheme = ctx.ui.theme;
    ctx.ui.setEditorComponent(createEditorFactory());
  }

  function disable(ctx: ExtensionContext) {
    editorEnabled = false;
    liveCtx = null;
    liveEditorTui = null;
    ctx.ui.setEditorComponent(undefined);
  }

  // auto-enable on session start if flag is set
  pi.on('session_start', (_event, ctx) => {
    if (getSettingsFlag(ctx.cwd, 'customEditor', true)) {
      enable(ctx);
    }
  });

  // keep widget info in top border in sync when model/cwd changes
  pi.on('model_select', (_event, ctx) => {
    if (!editorEnabled) return;
    liveCtx = ctx;
    liveEditorTui?.requestRender();
  });

  /** Toggle the custom editor on/off and persist to settings.json. */
  return {
    toggle(ctx: ExtensionContext): string {
      if (editorEnabled) {
        disable(ctx);
        updateSettingsFlag(ctx.cwd, 'customEditor', false);
        return 'powerline input-editor disabled';
      } else {
        enable(ctx);
        updateSettingsFlag(ctx.cwd, 'customEditor', true);
        return 'powerline input-editor enabled';
      }
    },
    /** Whether the editor is currently enabled. */
    get enabled(): boolean {
      return editorEnabled;
    },
  };
}

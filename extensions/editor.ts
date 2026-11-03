/**
 * Custom Editor Extension
 *
 * Replaces the default editor with a bordered input area using a ❯ prompt prefix.
 * Switches to bash-mode coloring when the prompt starts with !.
 * Editor is always enabled; breadcrumb mode controls whether widget info is embedded.
 */
import { type EditorTheme, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
  type ThemeColor,
} from '@earendil-works/pi-coding-agent';
import { getBreadcrumbData, renderBreadcrumbInfo } from './breadcrumb.ts';
import { readPowerlineSettings } from './settings.ts';

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

// live state, updated on enable / model_select
let liveCtx: ExtensionContext | null = null;
let liveEditorTui: any = null;
let breadcrumbMode: string = 'inner';

let currentTheme: Theme | null = null;

/** Maps each editor element to a pi theme color token. @example PromptPrefixEditor.colorTokens.prefix = "success"; */
export interface PromptPrefixColorTokens {
  border?: ThemeColor;
  prefix?: ThemeColor;
  indent?: ThemeColor;
}

/** Custom editor with a ❯ prompt prefix. Colors use `PromptPrefixColorTokens`. */
export class PromptPrefixEditor extends CustomEditor {
  private readonly tuiRef: any;

  private truncateCacheWidth: number | undefined;
  private readonly truncateCache = new Map<string, string>();

  static colorTokens: PromptPrefixColorTokens = {
    border: 'borderAccent',
    prefix: 'dim',
    indent: 'border',
  };

  constructor(tui: any, theme: EditorTheme, keybindings: any) {
    super(tui, theme, keybindings);
    this.tuiRef = tui;
  }

  render(width: number): string[] {
    const terminalColumns = Number(this.tuiRef?.terminal?.columns);
    const renderWidth = Math.max(
      1,
      Math.floor(
        Number.isFinite(terminalColumns) && terminalColumns > 0
          ? Math.min(width, terminalColumns)
          : width,
      ),
    );
    const contentWidth = Math.max(1, renderWidth - 2);
    const lines = super.render(contentWidth);
    if (lines.length < 3) {
      return lines.map((line) => truncateToWidth(line, renderWidth, ''));
    }

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
      renderWidth,
      color(tokens.border, '─'),
      color(tokens.prefix, '❯'),
      tokens.indent ? color(tokens.indent, ' ') : ' ',
    );

    // Embed widget info (model + folder) into the top border when mode is "inner"
    if (breadcrumbMode === 'inner') {
      const ctx = liveCtx;
      if (ctx && theme) {
        const data = getBreadcrumbData(ctx);
        const infoPart = renderBreadcrumbInfo(data, theme, false);

        const infoWidth = visibleWidth(infoPart);
        // '─ ' (2) + info + ' ' (1) + dashes → total width
        let paddingLen = renderWidth - 3 - infoWidth;
        let displayInfo = infoPart;

        if (paddingLen < 2) {
          // info too wide or not enough dashes, truncate with ellipsis, keep at least 2 dashes
          const minDashes = 2;
          const availForInfo = renderWidth - 3 - minDashes;
          if (availForInfo > 0) {
            displayInfo = truncateToWidth(infoPart, availForInfo, '...');
            paddingLen = renderWidth - 3 - visibleWidth(displayInfo);
          }
        }

        if (paddingLen >= 0) {
          const borderColored = color(tokens.border, '─');
          result[0] =
            borderColored + ' ' + displayInfo + ' ' + color(tokens.border, '─'.repeat(paddingLen));
        }
      }
    }

    if (this.truncateCacheWidth !== renderWidth) {
      this.truncateCache.clear();
      this.truncateCacheWidth = renderWidth;
    }
    return result.map((line) => {
      const cached = this.truncateCache.get(line);
      if (cached !== undefined) return cached;
      const truncated: string = truncateToWidth(line, renderWidth, '');
      if (this.truncateCache.size >= 128) this.truncateCache.clear();
      this.truncateCache.set(line, truncated);
      return truncated;
    });
  }
}

export function updateTheme(theme: Theme): void {
  currentTheme = theme;
}

/** Register the custom editor extension. Controlled by powerline master switch + breadcrumb mode. */
export function registerEditor(pi: ExtensionAPI) {
  let editorEnabled = false;

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
    breadcrumbMode = readPowerlineSettings(ctx.cwd).breadcrumb;
    ctx.ui.setEditorComponent(createEditorFactory());
  }

  function disable(ctx: ExtensionContext) {
    editorEnabled = false;
    liveEditorTui = null;
    ctx.ui.setEditorComponent(undefined);
  }

  // enable on session start if powerline master switch is on
  pi.on('session_start', (_event, ctx) => {
    if (readPowerlineSettings(ctx.cwd).powerline) {
      enable(ctx);
    }
  });

  // keep widget info in sync when model/cwd changes
  pi.on('model_select', (_event, ctx) => {
    liveCtx = ctx;
    breadcrumbMode = readPowerlineSettings(ctx.cwd).breadcrumb;
    liveEditorTui?.requestRender();
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    breadcrumbMode = s.breadcrumb;
    liveCtx = c;
    if (s.powerline && !editorEnabled) {
      enable(c);
    } else if (!s.powerline && editorEnabled) {
      disable(c);
    } else if (editorEnabled) {
      liveEditorTui?.requestRender();
    }
  });
}

/**
 * Custom Widget Extension
 *
 * Powerline-style status widget displayed above the input editor.
 * Shows:  model → current folder.
 *
 * Controlled by .pi/settings.json → customWidget (boolean, default true).
 * Toggle at runtime with /powerline widget.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';
import { visibleWidth } from '@mariozechner/pi-tui';

// ═══════════════════════════════════════════════════════════════════════════
// settings helpers
// ═══════════════════════════════════════════════════════════════════════════

function updateSettingsFlag(cwd: string, flagName: string, value: boolean): void {
  const settingsDir = join(cwd, '.pi');
  const settingsPath = join(settingsDir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  } else {
    mkdirSync(settingsDir, { recursive: true });
  }

  settings[flagName] = value;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function getSettingsFlag(cwd: string, flagName: string, fallback: boolean): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (!existsSync(settingsPath)) return fallback;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    if (flagName in settings) return !!settings[flagName];
  } catch {
    // ignore parse errors
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// icons & colors
// ═══════════════════════════════════════════════════════════════════════════

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const NERD = hasNerdFonts();
const ICON_MODEL = NERD ? '\uEC19' : '';
const ICON_FOLDER = NERD ? '\uF115' : 'dir';
const SEP = NERD ? '\uE0B1' : '|';

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

// ═══════════════════════════════════════════════════════════════════════════
// live state
// ═══════════════════════════════════════════════════════════════════════════

let liveCtx: ExtensionContext | null = null;
let liveTui: any = null;

// ═══════════════════════════════════════════════════════════════════════════
// widget renderer
// ═══════════════════════════════════════════════════════════════════════════

// hex → ANSI true color (model/folder use hex, not pi theme tokens)
function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

function createWidgetRenderer() {
  return (_tui: any, theme: Theme) => {
    liveTui = _tui;
    return {
      dispose() {
        liveTui = null;
      },
      invalidate() {},
      render(width: number): string[] {
        const ctx = liveCtx;
        const cwd = ctx?.cwd ?? process.cwd();
        const modelName = ctx?.model?.name || ctx?.model?.id || 'no-model';
        const folder = basename(cwd) || cwd;

        const modelText = withIcon(ICON_MODEL, modelName);
        const folderText = withIcon(ICON_FOLDER, folder);

        const line =
          hexFg('#d787af', modelText) +
          theme.fg('dim', ` ${SEP} `) +
          hexFg('#00afaf', folderText) +
          '\x1b[0m';

        const visLen = visibleWidth(line);
        const pad = Math.max(0, width - visLen);
        return [line + ' '.repeat(pad)];
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// module registration
// ═══════════════════════════════════════════════════════════════════════════

export function registerWidget(pi: ExtensionAPI) {
  pi.registerFlag('customWidget', {
    description: 'Enable powerline status widget above editor',
    type: 'boolean',
    default: true,
  });

  let widgetEnabled = true;

  function enable(ctx: ExtensionContext) {
    widgetEnabled = true;
    liveCtx = ctx;
    ctx.ui.setWidget('powerline-status', createWidgetRenderer(), {
      placement: 'aboveEditor',
    });
  }

  function disable(ctx: ExtensionContext) {
    widgetEnabled = false;
    liveCtx = null;
    ctx.ui.setWidget('powerline-status', undefined);
  }

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (getSettingsFlag(ctx.cwd, 'customWidget', true)) {
      enable(ctx);
    }
  });

  pi.on('model_select', (_event, ctx) => {
    if (!widgetEnabled) return;
    liveCtx = ctx;
    liveTui?.requestRender();
  });

  return {
    toggle(ctx: ExtensionContext): string {
      if (widgetEnabled) {
        disable(ctx);
        updateSettingsFlag(ctx.cwd, 'customWidget', false);
        return 'powerline widget disabled';
      } else {
        enable(ctx);
        updateSettingsFlag(ctx.cwd, 'customWidget', true);
        return 'powerline widget enabled';
      }
    },
    get enabled(): boolean {
      return widgetEnabled;
    },
  };
}

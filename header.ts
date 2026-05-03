/**
 * Custom Header Extension
 *
 * Toggles between the built-in header and a gradient-colored PI logo.
 * Controlled by .pi/settings.json → customHeader (boolean, default true).
 * Toggle at runtime with /header command.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';
import { VERSION } from '@mariozechner/pi-coding-agent';
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

/** Left-to-right ANSI gradient coloring. Spaces are left uncolored. */
const GRADIENT_COLORS = [
  '\x1b[38;5;199m',
  '\x1b[38;5;171m',
  '\x1b[38;5;135m',
  '\x1b[38;5;99m',
  '\x1b[38;5;75m',
  '\x1b[38;5;51m',
];

function gradientLine(line: string): string {
  const reset = '\x1b[0m';
  let result = '';
  let colorIdx = 0;
  const step = Math.max(1, Math.floor(line.length / GRADIENT_COLORS.length));

  for (let i = 0; i < line.length; i++) {
    if (i > 0 && i % step === 0 && colorIdx < GRADIENT_COLORS.length - 1) {
      colorIdx++;
    }

    const char = line[i];
    if (char !== ' ') {
      result += GRADIENT_COLORS[colorIdx] + char + reset;
    } else {
      result += char;
    }
  }
  return result;
}

const PI_LOGO = [
  '██████████    ',
  '████  ████    ',
  '████  ████    ',
  '████████  ████',
  '████      ████',
  '████      ████',
];

function renderLogo(theme: Theme): string[] {
  const lines = PI_LOGO.map((line) => '  ' + gradientLine(line) + '\x1b[0m');
  const subtitle = `${theme.fg('muted', '  pi agent')}${theme.fg('dim', ` v${VERSION}`)}`;
  return ['', ...lines, subtitle];
}

/** Register the custom header extension: flag and auto-enable on session start. */
export function registerHeader(pi: ExtensionAPI) {
  pi.registerFlag('customHeader', {
    description: 'Enable custom gradient-logo header',
    type: 'boolean',
    default: true,
  });

  let headerEnabled = true;

  function createHeaderComponent() {
    return (_tui: any, theme: Theme) => ({
      render(_width: number): string[] {
        return renderLogo(theme);
      },
      invalidate() {},
    });
  }

  function enable(ctx: ExtensionContext) {
    headerEnabled = true;
    ctx.ui.setHeader(createHeaderComponent());
  }

  function disable(ctx: ExtensionContext) {
    headerEnabled = false;
    ctx.ui.setHeader(undefined);
  }

  // auto-enable on session start if flag is set
  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (getSettingsFlag(ctx.cwd, 'customHeader', true)) {
      enable(ctx);
    }
  });

  /** Toggle the custom header on/off and persist to settings.json. */
  return {
    toggle(ctx: ExtensionContext): string {
      if (headerEnabled) {
        disable(ctx);
        updateSettingsFlag(ctx.cwd, 'customHeader', false);
        return 'powerline header disabled';
      } else {
        enable(ctx);
        updateSettingsFlag(ctx.cwd, 'customHeader', true);
        return 'powerline header enabled';
      }
    },
    /** Whether the header is currently enabled. */
    get enabled(): boolean {
      return headerEnabled;
    },
  };
}

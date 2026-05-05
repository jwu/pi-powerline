/**
 * Custom Header Extension
 *
 * Shows a gradient-colored PI logo.
 * Controlled by .pi/settings.json → header (boolean, default true).
 */
import type { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';
import { VERSION } from '@mariozechner/pi-coding-agent';
import { readPowerlineSettings } from './settings.ts';

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

/** Register the custom header extension. */
export function registerHeader(pi: ExtensionAPI) {
  let headerEnabled = false;

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

  // auto-enable on session start if powerline master switch + header setting are both on
  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.header) {
      enable(ctx);
    }
  });

  // re-evaluate on model switch
  pi.on('model_select', (_event, ctx) => {
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(ctx);
    } else if (!show && headerEnabled) {
      disable(ctx);
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(c);
    } else if (!show && headerEnabled) {
      disable(c);
    }
  });
}

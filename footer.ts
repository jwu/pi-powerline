/**
 * Custom Footer Extension
 *
 * Token stats come from ctx.sessionManager/ctx.model.
 * Git branch comes from footerData (not otherwise accessible).
 *
 * Controlled by .pi/settings.json → customFooter (boolean, default true).
 * Toggle at runtime with /footer command.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
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

/** Format a token count for display: <1000 shown as-is, >=1000 shown as e.g. "1.5k". */
function formatTokenCount(n: number): string {
  return n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
}

function createFooterRenderer(ctx: ExtensionContext) {
  return (tui: any, theme: any, footerData: any) => {
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsub,
      invalidate() {},
      render(width: number): string[] {
        // Compute tokens from ctx (already accessible to extensions)
        let input = 0,
          output = 0,
          cost = 0;
        for (const e of ctx.sessionManager.getBranch()) {
          if (e.type === 'message' && e.message.role === 'assistant') {
            const m = e.message as AssistantMessage;
            input += m.usage.input;
            output += m.usage.output;
            cost += m.usage.cost.total;
          }
        }

        // Get git branch (not otherwise accessible)
        const branch = footerData.getGitBranch();

        const left = theme.fg(
          'dim',
          `↑${formatTokenCount(input)} ↓${formatTokenCount(output)} $${cost.toFixed(3)}`,
        );
        const branchStr = branch ? ` (${branch})` : '';
        const right = theme.fg('dim', `${ctx.model?.id || 'no-model'}${branchStr}`);

        const pad = ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
        return [truncateToWidth(left + pad + right, width)];
      },
    };
  };
}

/** Register the custom footer extension: flag and auto-enable on session start. */
export function registerFooter(pi: ExtensionAPI) {
  pi.registerFlag('customFooter', {
    description: 'Enable custom footer with token stats',
    type: 'boolean',
    default: true,
  });

  let enabled = false;

  function enable(ctx: ExtensionContext) {
    enabled = true;
    ctx.ui.setFooter(createFooterRenderer(ctx));
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    ctx.ui.setFooter(undefined);
  }

  // auto-enable on session start if flag is set
  pi.on('session_start', (_event, ctx) => {
    if (getSettingsFlag(ctx.cwd, 'customFooter', true)) {
      enable(ctx);
    }
  });

  /** Toggle the custom footer on/off and persist to settings.json. */
  return {
    toggle(ctx: ExtensionContext): string {
      if (enabled) {
        disable(ctx);
        updateSettingsFlag(ctx.cwd, 'customFooter', false);
        return 'powerline footer disabled';
      } else {
        enable(ctx);
        updateSettingsFlag(ctx.cwd, 'customFooter', true);
        return 'powerline footer enabled';
      }
    },
    /** Whether the footer is currently enabled. */
    get enabled(): boolean {
      return enabled;
    },
  };
}

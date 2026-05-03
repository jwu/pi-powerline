/**
 * Custom Footer Extension
 *
 * Mirrors the built-in footer layout: pwd line, stats line, extension statuses line.
 *
 * Token stats and context usage come from ctx.sessionManager/ctx.model/ctx.getContextUsage().
 * Git branch, provider count, extension statuses come from footerData.
 * Thinking level comes from pi.getThinkingLevel() + pi.on(thinking_level_select).
 *
 * Controlled by .pi/settings.json → customFooter (boolean, default true).
 * Toggle at runtime with /footer command.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';

// ═══════════════════════════════════════════════════════════════════════════
// settings helpers
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// token formatting (mirrors built-in footer)
// ═══════════════════════════════════════════════════════════════════════════

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ═══════════════════════════════════════════════════════════════════════════
// live state (updated by thinking_level_select events)
// ═══════════════════════════════════════════════════════════════════════════

let liveThinkLevel = 'off';
let liveTui: any = null;

// ═══════════════════════════════════════════════════════════════════════════
// footer renderer
// ═══════════════════════════════════════════════════════════════════════════

/** Sanitize text for single-line status display. */
function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function createFooterRenderer(ctx: ExtensionContext) {
  return (tui: any, theme: any, footerData: any) => {
    liveTui = tui;
    const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose() {
        liveTui = null;
        unsubBranch();
      },
      invalidate() {},
      render(width: number): string[] {
        // ── cumulative token stats from ALL session entries ──
        let totalInput = 0,
          totalOutput = 0,
          totalCacheRead = 0,
          totalCacheWrite = 0,
          totalCost = 0;
        for (const e of ctx.sessionManager.getEntries()) {
          if (e.type === 'message' && e.message.role === 'assistant') {
            const m = e.message as AssistantMessage;
            totalInput += m.usage.input;
            totalOutput += m.usage.output;
            totalCacheRead += m.usage.cacheRead;
            totalCacheWrite += m.usage.cacheWrite;
            totalCost += m.usage.cost.total;
          }
        }

        // ── context usage ──
        const contextUsage = ctx.getContextUsage();
        const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const contextPercentValue = contextUsage?.percent ?? 0;
        const contextPercent =
          contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : '?';

        // ── line 1: pwd + git branch + session name ──
        let pwd = ctx.sessionManager.getCwd();
        const home = process.env.HOME || process.env.USERPROFILE;
        if (home && pwd.startsWith(home)) {
          pwd = `~${pwd.slice(home.length)}`;
        }
        const branch = footerData.getGitBranch();
        if (branch) pwd = `${pwd} (${branch})`;
        const sessionName = ctx.sessionManager.getSessionName();
        if (sessionName) pwd = `${pwd} • ${sessionName}`;
        const pwdLine = truncateToWidth(theme.fg('dim', pwd), width, theme.fg('dim', '...'));

        // ── line 2: stats + model ──
        const statsParts: string[] = [];
        if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
        if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
        if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
        if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

        const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
        if (totalCost || usingSubscription) {
          const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? ' (sub)' : ''}`;
          statsParts.push(costStr);
        }

        // context % with threshold coloring
        const contextPercentDisplay =
          contextPercent === '?'
            ? `?/${formatTokens(contextWindow)}`
            : `${contextPercent}%/${formatTokens(contextWindow)}`;
        let contextPercentStr: string;
        if (contextPercentValue > 90) {
          contextPercentStr = theme.fg('error', contextPercentDisplay);
        } else if (contextPercentValue > 70) {
          contextPercentStr = theme.fg('warning', contextPercentDisplay);
        } else {
          contextPercentStr = contextPercentDisplay;
        }
        statsParts.push(contextPercentStr);

        let statsLeft = statsParts.join(' ');
        let statsLeftWidth = visibleWidth(statsLeft);
        if (statsLeftWidth > width) {
          statsLeft = truncateToWidth(statsLeft, width, '...');
          statsLeftWidth = visibleWidth(statsLeft);
        }

        // right side: model + thinking level + optional provider prefix
        const modelName = ctx.model?.id || 'no-model';
        let rightSide = modelName;
        if (ctx.model?.reasoning) {
          const tl = liveThinkLevel || 'off';
          rightSide = tl === 'off' ? `${modelName} • thinking off` : `${modelName} • ${tl}`;
        }

        // prepend provider when multiple are available
        if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
          const withProvider = `(${ctx.model.provider}) ${rightSide}`;
          if (statsLeftWidth + 2 + visibleWidth(withProvider) <= width) {
            rightSide = withProvider;
          }
        }

        const rightW = visibleWidth(rightSide);
        const minPad = 2;
        let statsLine: string;

        if (statsLeftWidth + minPad + rightW <= width) {
          const padding = ' '.repeat(width - statsLeftWidth - rightW);
          statsLine = statsLeft + padding + rightSide;
        } else {
          const avail = width - statsLeftWidth - minPad;
          if (avail > 0) {
            const truncatedRight = truncateToWidth(rightSide, avail, '');
            const padding = ' '.repeat(
              Math.max(0, width - statsLeftWidth - visibleWidth(truncatedRight)),
            );
            statsLine = statsLeft + padding + truncatedRight;
          } else {
            statsLine = statsLeft;
          }
        }

        // dim-wrap left/right separately so context % coloring isn't cleared
        const dimLeft = theme.fg('dim', statsLeft);
        const tail = statsLine.slice(statsLeft.length);
        const dimTail = theme.fg('dim', tail);

        const lines = [pwdLine, dimLeft + dimTail];

        // ── line 3: extension statuses ──
        const extensionStatuses = footerData.getExtensionStatuses() as Map<string, string>;
        if (extensionStatuses.size > 0) {
          const sorted = Array.from(extensionStatuses.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatusText(text));
          const statusLine = sorted.join(' ');
          lines.push(truncateToWidth(statusLine, width, theme.fg('dim', '...')));
        }

        return lines;
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// module registration
// ═══════════════════════════════════════════════════════════════════════════

export function registerFooter(pi: ExtensionAPI) {
  pi.registerFlag('customFooter', {
    description: 'Enable custom footer with token stats',
    type: 'boolean',
    default: true,
  });

  let enabled = false;

  function enable(ctx: ExtensionContext) {
    enabled = true;
    liveThinkLevel = pi.getThinkingLevel();
    ctx.ui.setFooter(createFooterRenderer(ctx));
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    liveTui = null;
    ctx.ui.setFooter(undefined);
  }

  // auto-enable on session start if flag is set
  pi.on('session_start', (_event, ctx) => {
    if (getSettingsFlag(ctx.cwd, 'customFooter', true)) {
      enable(ctx);
    }
  });

  // track thinking level changes for footer display
  pi.on('thinking_level_select', (event) => {
    if (!enabled) return;
    liveThinkLevel = event.level;
    liveTui?.requestRender();
  });

  // model switch may affect reasoning support / provider count
  pi.on('model_select', () => {
    if (!enabled) return;
    liveThinkLevel = pi.getThinkingLevel();
    liveTui?.requestRender();
  });

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
    get enabled(): boolean {
      return enabled;
    },
  };
}

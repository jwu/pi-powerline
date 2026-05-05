/**
 * Custom Footer Extension
 *
 * Mirrors the built-in footer layout: pwd line, stats line, extension statuses line.
 *
 * Token stats and context usage come from ctx.sessionManager/ctx.model/ctx.getContextUsage().
 * Git branch, provider count, extension statuses come from footerData.
 * Thinking level comes from pi.getThinkingLevel() + pi.on(thinking_level_select).
 *
 * Controlled by .pi/settings.json → footer (boolean, default true).
 * Toggle at runtime via /powerline footer:on / footer:off.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { readPowerlineSettings } from './settings.ts';

// ═══════════════════════════════════════════════════════════════════════════
// auto-compact detection (nested under compaction.enabled, not powerline)
// ═══════════════════════════════════════════════════════════════════════════
function readAutoCompactEnabled(cwd: string): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content || '{}');
      if (
        settings.compaction &&
        typeof settings.compaction === 'object' &&
        'enabled' in (settings.compaction as Record<string, unknown>)
      ) {
        return !!(settings.compaction as Record<string, unknown>).enabled;
      }
    } catch {
      // ignore parse errors
    }
  }
  return true;
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
// think level display (mirrors widget.ts style)
// ═══════════════════════════════════════════════════════════════════════════

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const ICON_THINK = hasNerdFonts() ? '' : '';
const ICON_GIT = hasNerdFonts() ? '' : '⎇';

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

const THINK_LABELS: Record<string, string> = {
  minimal: 'min',
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhi',
};

const THINK_COLORS: Record<string, string> = {
  high: 'thinkingHigh',
  xhigh: 'thinkingXhigh',
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
};

// ═══════════════════════════════════════════════════════════════════════════
// usage helpers (for fusing live streaming data with persisted entries)
// ═══════════════════════════════════════════════════════════════════════════

type SessionAssistantUsage = AssistantMessage['usage'];

function getUsageTokenTotal(usage: SessionAssistantUsage): number {
  return (
    ('totalTokens' in usage && typeof usage.totalTokens === 'number' ? usage.totalTokens : 0) ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  );
}

function isSessionAssistantMessage(value: unknown): value is AssistantMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    (value as any).role === 'assistant' &&
    'usage' in value &&
    typeof (value as any).usage?.input === 'number' &&
    typeof (value as any).usage?.output === 'number'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// live state (updated by events)
// ═══════════════════════════════════════════════════════════════════════════

let liveThinkLevel = 'off';
let liveTui: any = null;
let isStreaming = false;
let liveAssistantUsage: SessionAssistantUsage | null = null;
let autoCompactEnabled = true;

// ═══════════════════════════════════════════════════════════════════════════
// footer renderer
// ═══════════════════════════════════════════════════════════════════════════

// hex → ANSI true color (for git branch, not using pi theme tokens)
function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

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
        // ── cumulative token stats from persisted entries + live streaming ──
        let totalInput = 0,
          totalOutput = 0,
          totalCacheRead = 0,
          totalCacheWrite = 0,
          totalCost = 0;
        let lastPersistedAssistant: AssistantMessage | undefined;
        for (const e of ctx.sessionManager.getEntries()) {
          if (e.type === 'message' && e.message.role === 'assistant') {
            const m = e.message as AssistantMessage;
            if (m.stopReason === 'error' || m.stopReason === 'aborted') continue;
            totalInput += m.usage.input;
            totalOutput += m.usage.output;
            totalCacheRead += m.usage.cacheRead;
            totalCacheWrite += m.usage.cacheWrite;
            totalCost += m.usage.cost.total;
            if (getUsageTokenTotal(m.usage) > 0) {
              lastPersistedAssistant = m;
            }
          }
        }

        // fuse live streaming usage (not yet persisted) on top of persisted totals
        const latestUsage = isStreaming
          ? (liveAssistantUsage ?? lastPersistedAssistant?.usage)
          : lastPersistedAssistant?.usage;
        if (isStreaming && liveAssistantUsage) {
          totalInput += liveAssistantUsage.input;
          totalOutput += liveAssistantUsage.output;
          totalCacheRead += liveAssistantUsage.cacheRead;
          totalCacheWrite += liveAssistantUsage.cacheWrite;
          totalCost += liveAssistantUsage.cost.total;
        }

        // ── context usage ──
        // During streaming, ctx.getContextUsage() may be stale; estimate from usage.
        const coreContextUsage = isStreaming && liveAssistantUsage ? null : ctx.getContextUsage();
        const contextTokens =
          coreContextUsage?.tokens ?? (latestUsage ? getUsageTokenTotal(latestUsage) : null);
        const contextWindow = coreContextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const contextPercent =
          contextTokens !== null ? ((contextTokens / contextWindow) * 100).toFixed(1) : '?';

        // ── git branch (leftmost, before stats) ──
        const branch = footerData.getGitBranch();
        const gitSegment = branch ? hexFg('#5faf5f', withIcon(ICON_GIT, branch)) : '';
        const gitFull = gitSegment ? gitSegment + ' ' : '';
        const gitFullWidth = gitSegment ? visibleWidth(gitSegment) + 1 : 0;

        // ── stats + model ──
        const statsParts: string[] = [];

        // context % with threshold coloring (always first)
        const contextPercentNum =
          contextTokens !== null && contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0;
        const contextPercentDisplay =
          contextPercent === '?'
            ? `?/${formatTokens(contextWindow)}`
            : `${contextPercent}%/${formatTokens(contextWindow)}${autoCompactEnabled ? ' (auto)' : ''}`;
        let contextPercentStr: string;
        if (contextPercentNum > 90) {
          contextPercentStr = theme.fg('error', contextPercentDisplay);
        } else if (contextPercentNum > 70) {
          contextPercentStr = theme.fg('warning', contextPercentDisplay);
        } else {
          contextPercentStr = contextPercentDisplay;
        }
        statsParts.push(contextPercentStr);

        if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
        if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
        if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
        if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

        const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
        if (totalCost || usingSubscription) {
          const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? ' (sub)' : ''}`;
          statsParts.push(costStr);
        }

        let statsLeft = statsParts.join(' ');
        let statsLeftWidth = visibleWidth(statsLeft);
        if (statsLeftWidth > width) {
          statsLeft = truncateToWidth(statsLeft, width, '...');
          statsLeftWidth = visibleWidth(statsLeft);
        }

        // ── stats line layout: git (green) + left (dim) + padding (dim) + right (colored think level) ──
        const dimLeft = theme.fg('dim', statsLeft);

        // right side: think level only, colored (omitted when model lacks reasoning)
        let rightSidePlain = '';
        if (ctx.model?.reasoning) {
          const tl = liveThinkLevel || 'off';
          const label = THINK_LABELS[tl] ?? tl;
          rightSidePlain = withIcon(ICON_THINK, label);
        }
        const rightWidth = visibleWidth(rightSidePlain);

        const minPad = 2;
        let statsLine: string;

        const totalBase = gitFullWidth + statsLeftWidth + minPad + rightWidth;
        if (totalBase <= width) {
          // everything fits
          const pad = width - gitFullWidth - statsLeftWidth - rightWidth;
          const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
          let coloredRight = '';
          if (rightSidePlain) {
            const tl = liveThinkLevel || 'off';
            coloredRight = theme.fg(THINK_COLORS[tl] ?? 'thinkingOff', rightSidePlain);
          }
          statsLine = gitFull + dimLeft + dimPadding + coloredRight;
        } else if (gitFullWidth + minPad + rightWidth <= width) {
          // drop git → fit statsLeft
          const availStats = width - gitFullWidth - minPad - rightWidth;
          let statsTrimmed: string;
          let statsTrimmedWidth: number;
          if (availStats > 0) {
            statsTrimmed = truncateToWidth(statsLeft, availStats, '');
            statsTrimmedWidth = visibleWidth(statsTrimmed);
          } else {
            statsTrimmed = '';
            statsTrimmedWidth = 0;
          }
          const pad = width - gitFullWidth - statsTrimmedWidth - rightWidth;
          const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
          let coloredRight = '';
          if (rightSidePlain) {
            const tl = liveThinkLevel || 'off';
            coloredRight = theme.fg(THINK_COLORS[tl] ?? 'thinkingOff', rightSidePlain);
          }
          statsLine = gitFull + theme.fg('dim', statsTrimmed) + dimPadding + coloredRight;
        } else {
          // drop git, drop right → only stats
          const availStats = width - minPad;
          let statsTrimmed: string;
          if (availStats > 0) {
            statsTrimmed = truncateToWidth(statsLeft, availStats, '');
          } else {
            statsTrimmed = '';
          }
          statsLine = theme.fg('dim', statsTrimmed);
        }

        const lines = [statsLine];

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

  // enable on session start if powerline master switch + footer setting are both on
  pi.on('session_start', (_event, ctx) => {
    autoCompactEnabled = readAutoCompactEnabled(ctx.cwd);
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.footer) {
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
  pi.on('model_select', (_event, ctx) => {
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(ctx);
    } else if (!show && enabled) {
      disable(ctx);
    } else if (enabled) {
      liveThinkLevel = pi.getThinkingLevel();
      liveTui?.requestRender();
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(c);
    } else if (!show && enabled) {
      disable(c);
    }
  });

  // ── real-time token updates during streaming ──

  pi.on('agent_start', () => {
    isStreaming = true;
    liveAssistantUsage = null;
  });

  pi.on('message_update', (event) => {
    if (!enabled) return;
    if (isSessionAssistantMessage(event.message)) {
      liveAssistantUsage = event.message.usage;
      liveTui?.requestRender();
    }
  });

  pi.on('message_end', (event) => {
    isStreaming = false;
    if (!enabled) return;
    if (isSessionAssistantMessage(event.message)) {
      liveAssistantUsage =
        event.message.stopReason === 'error' || event.message.stopReason === 'aborted'
          ? null
          : event.message.usage;
    }
    liveTui?.requestRender();
  });
}

/**
 * Custom Footer Extension
 *
 * Mirrors the built-in footer layout: pwd line, stats line, extension statuses line.
 *
 * Token stats and context usage come from ctx.sessionManager/ctx.model/ctx.getContextUsage().
 * Git branch, provider count, extension statuses come from footerData.
 * Thinking level comes from pi.getThinkingLevel() + pi.on(thinking_level_select).
 * The pi-mcp-adapter "mcp" status (e.g. "MCP 3/3") is fused into the right side of
 * the stats line when footer-mcp is on, instead of taking its own line.
 *
 * Controlled by .pi/settings.json → footer (boolean, default true)
 * and footer-mcp (boolean, default true).
 * Toggle at runtime via /powerline footer:on / footer:off / footer-mcp:on / footer-mcp:off.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { hasNerdFonts, hexFg, withIcon } from './utils.ts';
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
// think level display
// ═══════════════════════════════════════════════════════════════════════════

const ICON_THINK = hasNerdFonts() ? '' : '';
const ICON_GIT = hasNerdFonts() ? '' : '⎇';

const THINK_LABELS: Record<string, string> = {
  minimal: 'min',
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhi',
  max: 'max',
};

const THINK_COLORS: Record<string, string> = {
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
  high: 'thinkingHigh',
  xhigh: 'thinkingXhigh',
  max: 'thinkingMax',
};

export function getThinkingLevelDisplay(level: string): { label: string; color: string } {
  return {
    label: THINK_LABELS[level] ?? level,
    color: THINK_COLORS[level] ?? 'thinkingOff',
  };
}

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

function getCacheHitRate(usage: SessionAssistantUsage): number | undefined {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
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
let showFooterMcp = true;

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

/** One right-aligned segment on the stats line (MCP status or think level). */
export interface RightSegment {
  kind: 'mcp' | 'think';
  text: string;
  width: number;
}

/** Visible width of consecutive right-aligned segments (single-space separated). */
function segmentsWidth(segments: RightSegment[]): number {
  return segments.reduce((sum, s) => sum + s.width, 0) + Math.max(0, segments.length - 1);
}

function segmentsText(segments: RightSegment[]): string {
  return segments.map((s) => s.text).join(' ');
}

/**
 * Right-side content that fits into `budget` visible columns.
 * Candidates degrade from the full set to dropping MCP, then to nothing, so the
 * think level outlives the MCP status when space runs out.
 */
export function pickRightSide(
  segments: RightSegment[],
  budget: number,
): { width: number; text: string } {
  const candidates: RightSegment[][] = [segments];
  if (segments.some((s) => s.kind === 'mcp')) {
    candidates.push(segments.filter((s) => s.kind !== 'mcp'));
  }
  candidates.push([]);

  for (const candidate of candidates) {
    const width = segmentsWidth(candidate);
    if (width <= budget) return { width, text: segmentsText(candidate) };
  }
  return { width: 0, text: '' };
}

export function isSubscriptionAuth(ctx: ExtensionContext): boolean {
  const model = ctx.model;
  if (!model) return false;
  if (model.provider === 'kimi-coding') return true;

  const provider = ctx.modelRegistry.getProvider(model.provider);
  return ctx.modelRegistry.isUsingOAuth(model) && provider?.auth.oauth?.isSubscription === true;
}

/** Build the footer factory; exported for tests. */
export function createFooterRenderer(ctx: ExtensionContext) {
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
        const latestCacheHitRate = latestUsage ? getCacheHitRate(latestUsage) : undefined;
        if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
          statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
        }

        const usingSubscription = isSubscriptionAuth(ctx);
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

        // ── right side: MCP status (optional) + think level ──
        const extensionStatuses = footerData.getExtensionStatuses() as Map<string, string>;
        const mcpRaw = showFooterMcp ? extensionStatuses.get('mcp') : undefined;
        const mcpStatus = mcpRaw ? sanitizeStatusText(mcpRaw) : '';

        const rightSegments: RightSegment[] = [];
        if (mcpStatus) {
          rightSegments.push({ kind: 'mcp', text: mcpStatus, width: visibleWidth(mcpStatus) });
        }
        const thinkingDisplay = getThinkingLevelDisplay(liveThinkLevel || 'off');
        if (ctx.model?.reasoning) {
          const thinkPlain = withIcon(ICON_THINK, thinkingDisplay.label);
          rightSegments.push({
            kind: 'think',
            text: theme.fg(thinkingDisplay.color, thinkPlain),
            width: visibleWidth(thinkPlain),
          });
        }

        const minPad = 2;

        const dimLeft = theme.fg('dim', statsLeft);

        // ── stats line layout: git + stats (dim) + padding (dim) + right segments ──
        // When space runs out: trim stats first, then drop MCP, then drop the think level.
        const rightSide = pickRightSide(rightSegments, width - gitFullWidth - minPad);
        const rightWidth = rightSide.width;
        const coloredRight = rightSide.text;

        let statsLine = '';
        if (gitFullWidth + minPad + rightWidth <= width) {
          if (gitFullWidth + statsLeftWidth + minPad + rightWidth <= width) {
            const pad = width - gitFullWidth - statsLeftWidth - rightWidth;
            const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
            statsLine = gitFull + dimLeft + dimPadding + coloredRight;
          } else {
            const availStats = width - gitFullWidth - minPad - rightWidth;
            const statsTrimmed = availStats > 0 ? truncateToWidth(statsLeft, availStats, '') : '';
            const statsTrimmedWidth = visibleWidth(statsTrimmed);
            const pad = width - gitFullWidth - statsTrimmedWidth - rightWidth;
            const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
            statsLine = gitFull + theme.fg('dim', statsTrimmed) + dimPadding + coloredRight;
          }
        }
        if (!statsLine) {
          const availStats = width - minPad;
          const statsTrimmed = availStats > 0 ? truncateToWidth(statsLeft, availStats, '') : '';
          statsLine = theme.fg('dim', statsTrimmed);
        }

        const lines = [statsLine];

        // ── line 3: extension statuses ("mcp" moves to the stats line when enabled) ──
        const remainingStatuses = Array.from(extensionStatuses.entries())
          .filter(([key]) => !(showFooterMcp && key === 'mcp'))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, text]) => sanitizeStatusText(text))
          .filter((text) => text.length > 0);
        if (remainingStatuses.length > 0) {
          lines.push(truncateToWidth(remainingStatuses.join(' '), width, theme.fg('dim', '...')));
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
    showFooterMcp = readPowerlineSettings(ctx.cwd)['footer-mcp'];
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
    } else if (enabled) {
      showFooterMcp = s['footer-mcp'];
      liveTui?.requestRender();
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

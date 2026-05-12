/**
 * Custom Widget Extension
 *
 * Powerline-style status widget displayed above the input editor.
 * Shows:  model → current folder.
 * Only active when breadcrumb mode is "top" in .pi/settings.json.
 */
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { getBreadcrumbData, renderBreadcrumbInfo } from './breadcrumb.ts';
import { readPowerlineSettings } from './settings.ts';

// ═══════════════════════════════════════════════════════════════════════════
// live state
// ═══════════════════════════════════════════════════════════════════════════

let liveCtx: ExtensionContext | null = null;
let liveTui: any = null;
let widgetEnabled = false;

// ═══════════════════════════════════════════════════════════════════════════
// widget renderer
// ═══════════════════════════════════════════════════════════════════════════

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
        const data = getBreadcrumbData(ctx);
        const line = renderBreadcrumbInfo(data, theme, true);

        const visLen = visibleWidth(line);
        if (visLen > width) {
          return [truncateToWidth(line, width, '...')];
        }
        return [line + ' '.repeat(width - visLen)];
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// module registration
// ═══════════════════════════════════════════════════════════════════════════

export function registerWidget(pi: ExtensionAPI) {
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

  // enable only when powerline master switch is on and breadcrumb mode is "top"
  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.breadcrumb === 'top') {
      enable(ctx);
    }
  });

  // re-evaluate on model switch (breadcrumb setting may have changed)
  pi.on('model_select', (_event, ctx) => {
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.breadcrumb === 'top';
    if (show && !widgetEnabled) {
      enable(ctx);
    } else if (!show && widgetEnabled) {
      disable(ctx);
    } else if (widgetEnabled) {
      liveCtx = ctx;
      liveTui?.requestRender();
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.breadcrumb === 'top';
    if (show && !widgetEnabled) {
      enable(c);
    } else if (!show && widgetEnabled) {
      disable(c);
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { visibleWidth } from '@earendil-works/pi-tui';
import { registerFooter } from '../extensions/footer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Render the real footer through registerFooter + session_start, so the
// MCP status placement is verified against the production code path.
// ═══════════════════════════════════════════════════════════════════════════

const fg = (_color: string, text: string) => `\x1b[38;5;1m${text}\x1b[39m`;

interface RenderOptions {
  settings?: Record<string, unknown>;
  statuses?: Record<string, string>;
  width?: number;
}

function renderFooter({ settings = {}, statuses = {}, width = 80 }: RenderOptions): string[] {
  const cwd = mkdtempSync('pi-powerline-footer-');
  if (Object.keys(settings).length > 0) {
    mkdirSync(join(cwd, '.pi'), { recursive: true });
    writeFileSync(join(cwd, '.pi', 'settings.json'), JSON.stringify(settings));
  }

  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  const pi = {
    getThinkingLevel: () => 'medium',
    on(name: string, fn: (...args: any[]) => void) {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
    },
    events: { on() {}, emit() {} },
    registerFlag() {},
    registerCommand() {},
  };

  let factory: any;
  const ctx = {
    cwd,
    model: { provider: 'test', reasoning: true, contextWindow: 200000 },
    modelRegistry: { isUsingOAuth: () => false, getProvider: () => undefined },
    sessionManager: { getEntries: () => [] },
    getContextUsage: () => null,
    ui: {
      setFooter(next: any) {
        factory = next;
      },
      notify() {},
    },
  };

  registerFooter(pi as any);
  for (const handler of handlers.get('session_start') ?? []) handler({}, ctx);

  const footerData = {
    getGitBranch: () => 'main',
    getExtensionStatuses: () => new Map(Object.entries(statuses)),
    onBranchChange: () => () => {},
  };
  const theme = { fg };
  const tui = { requestRender() {} };

  const lines = factory(tui, theme, footerData).render(width);
  rmSync(cwd, { recursive: true, force: true });
  return lines;
}

test('MCP status moves to the right side of the stats line', () => {
  const lines = renderFooter({ statuses: { mcp: 'MCP 3/3', filechanges: '2 files' } });

  assert.equal(visibleWidth(lines[0]), 80);
  assert.ok(lines[0].includes('MCP 3/3'));
  // MCP sits left of the thinking level on the stats line
  assert.ok(lines[0].indexOf('MCP 3/3') < lines[0].indexOf('med'));
  // Other extension statuses keep their own line
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('2 files'));
  assert.ok(!lines[1].includes('MCP'));
});

test('footer-mcp off keeps the MCP status on its own line', () => {
  const lines = renderFooter({
    settings: { powerline: true, footer: true, 'footer-mcp': false },
    statuses: { mcp: 'MCP 3/3', filechanges: '2 files' },
  });

  assert.ok(!lines[0].includes('MCP 3/3'));
  assert.ok(lines[0].includes('med'));
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('MCP 3/3'));
});

test('MCP segment is dropped before the thinking level when space is tight', () => {
  // Too narrow for git + MCP + think level; the think level survives via pickRightSide.
  const lines = renderFooter({ statuses: { mcp: 'MCP 3/3' }, width: 16 });

  assert.equal(visibleWidth(lines[0]), 16);
  assert.ok(!lines[0].includes('MCP 3/3'));
});

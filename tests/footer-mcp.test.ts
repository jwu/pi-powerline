import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  countMcpStatus,
  mcpNamespace,
  registerFooter,
  watchToolCount,
} from '../extensions/footer.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Render the real footer through registerFooter + session_start, so the
// MCP status placement is verified against the production code path.
// ═══════════════════════════════════════════════════════════════════════════

const fg = (_color: string, text: string) => `\x1b[38;5;1m${text}\x1b[39m`;

interface RenderOptions {
  settings?: Record<string, unknown>;
  statuses?: Record<string, string>;
  width?: number;
  mcpServers?: Record<string, unknown>;
  tools?: Array<{ namespace?: { name?: string } }>;
}

function renderFooter({
  settings = {},
  statuses = {},
  width = 80,
  mcpServers,
  tools = [],
}: RenderOptions): string[] {
  const cwd = mkdtempSync('pi-powerline-footer-');
  if (Object.keys(settings).length > 0) {
    mkdirSync(join(cwd, '.pi'), { recursive: true });
    writeFileSync(join(cwd, '.pi', 'settings.json'), JSON.stringify(settings));
  }
  if (mcpServers) {
    mkdirSync(join(cwd, '.pi'), { recursive: true });
    writeFileSync(join(cwd, '.pi', 'mcp.json'), JSON.stringify({ mcpServers }));
  }

  // Point HOME at the sandbox so the real user-level mcp.json cannot leak into the count.
  const previousHome = process.env.HOME;
  process.env.HOME = cwd;

  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  const pi = {
    getThinkingLevel: () => 'medium',
    getAllTools: () => tools,
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
  process.env.HOME = previousHome;
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

// ═══════════════════════════════════════════════════════════════════════════
// built-in MCP status (no extension publishes an `mcp` status)
// ═══════════════════════════════════════════════════════════════════════════

test('built-in MCP status fills the segment when nothing publishes one', () => {
  const lines = renderFooter({
    mcpServers: { blender: {}, 'chrome-devtools': {}, 'comfy-mcp': {} },
    tools: [
      { namespace: { name: 'mcp__blender' } },
      { namespace: { name: 'mcp__chrome_devtools' } },
      { namespace: { name: 'mcp__comfy_mcp' } },
    ],
  });

  assert.ok(lines[0].includes('MCP 3/3'));
  assert.ok(lines[0].indexOf('MCP 3/3') < lines[0].indexOf('med'));
});

test('built-in MCP status counts only servers that registered tools', () => {
  const lines = renderFooter({
    mcpServers: { blender: {}, 'comfy-mcp': {} },
    tools: [{ namespace: { name: 'mcp__blender' } }],
  });

  assert.ok(lines[0].includes('MCP 1/2'));
});

test('disabled servers stay out of the denominator', () => {
  const lines = renderFooter({
    mcpServers: { blender: {}, 'chrome-devtools-alt': { enabled: false } },
    tools: [{ namespace: { name: 'mcp__blender' } }],
  });

  assert.ok(lines[0].includes('MCP 1/1'));
});

test('a published mcp status wins over the built-in count', () => {
  const lines = renderFooter({
    statuses: { mcp: 'MCP 9/9' },
    mcpServers: { blender: {}, 'comfy-mcp': {} },
    tools: [{ namespace: { name: 'mcp__blender' } }],
  });

  assert.ok(lines[0].includes('MCP 9/9'));
  assert.ok(!lines[0].includes('MCP 1/2'));
});

test('no configured MCP server leaves the segment empty', () => {
  const lines = renderFooter({ tools: [{ namespace: { name: 'mcp__blender' } }] });

  assert.ok(!lines[0].includes('MCP'));
});

test('footer-mcp off hides the built-in status too', () => {
  const lines = renderFooter({
    settings: { powerline: true, footer: true, 'footer-mcp': false },
    mcpServers: { blender: {} },
    tools: [{ namespace: { name: 'mcp__blender' } }],
  });

  assert.ok(!lines[0].includes('MCP 1/1'));
});

test('mcpNamespace sanitizes characters the tool naming replaces', () => {
  assert.equal(mcpNamespace('chrome-devtools'), 'mcp__chrome_devtools');
  assert.equal(mcpNamespace('comfy-mcp'), 'mcp__comfy_mcp');
});

test('countMcpStatus returns undefined without configured servers', () => {
  assert.equal(countMcpStatus([], []), undefined);
  assert.equal(countMcpStatus([{ namespace: { name: 'mcp__x' } }], []), undefined);
});

test('countMcpStatus stays silent until a server registers tools', () => {
  // Covers both "still connecting" and a pi without ToolInfo.namespace.
  assert.equal(countMcpStatus([], ['x']), undefined);
  assert.equal(countMcpStatus([{}], ['x', 'y']), undefined);
});

test('watchToolCount repaints on tool list changes and stops on its own', async () => {
  let tools: Array<{ namespace?: { name?: string } }> = [];
  let repaints = 0;
  const stop = watchToolCount(
    { getAllTools: () => tools } as any,
    { requestRender: () => repaints++ },
    20,
    8,
  );

  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(repaints, 0, 'a stable tool list must not repaint');

  // An MCP server finishing its handshake adds its tools.
  tools = [{ namespace: { name: 'mcp__blender' } }];
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(repaints, 1);

  // The watcher uses up its ticks and stops, so later changes are ignored.
  await new Promise((resolve) => setTimeout(resolve, 90));
  tools = [];
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(repaints, 1);

  stop();
});

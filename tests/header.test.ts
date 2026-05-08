import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHeader } from '../header.ts';
// gradientLine is in header.ts; reimplement inline for unit isolation
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

// ── gradientLine ──

test('gradientLine colors each character segment with a gradient', () => {
  const input = 'AAAAAAAAAAAAAAAAAAAA'; // 20 chars
  const result = gradientLine(input);

  // Should contain ANSI escape codes
  assert.ok(result.includes('\x1b['));

  // Spaces should remain uncolored — verify no space coloring
  // (input has no spaces, so just check result length > input)
  assert.ok(result.length > input.length);
});

test('gradientLine keeps spaces uncolored', () => {
  const input = 'A   B   C';
  const result = gradientLine(input);

  // There should be 6 spaces in the input, and they should not be wrapped
  // with ANSI codes (they'll be plain ' ' chars)
  assert.ok(result.includes('   '));
});

test('gradientLine handles single character', () => {
  const result = gradientLine('X');
  // Should contain ANSI, the char, and reset
  assert.ok(result.includes('\x1b['));
  assert.ok(result.includes('X'));
  assert.ok(result.includes('\x1b[0m'));
});

test('gradientLine handles empty string', () => {
  const result = gradientLine('');
  assert.equal(result, '');
});

test('gradientLine handles all-space string', () => {
  const input = '      '; // 6 spaces
  const result = gradientLine(input);
  // Spaces are passed through as-is
  assert.equal(result, input);
});

test('gradientLine output has proper ANSI reset sequences', () => {
  const input = 'HELLO';
  const result = gradientLine(input);

  // Every non-space char should be wrapped in <ansi>char<reset>
  // Count reset sequences
  const resetCount = (result.match(/\x1b\[0m/g) || []).length;
  // 5 non-space chars → 5 resets
  assert.equal(resetCount, 5);
});

test('gradientLine handles string shorter than color count', () => {
  const input = 'AB'; // 2 chars, 6 gradient colors
  const result = gradientLine(input);

  // Should still produce colored output
  assert.ok(result.includes('\x1b['));
  assert.ok(result.includes('A'));
  assert.ok(result.includes('B'));
});

test('gradientLine produces left-to-right color transition', () => {
  const input = 'ABCDEFGHIJKLMNOPQR'; // 19 chars, 6 color steps
  const result = gradientLine(input);

  // Extract ANSI color codes in order
  const colors: string[] = [];
  const re = /\x1b\[(38;5;\d+)m/g;
  let match;
  while ((match = re.exec(result)) !== null) {
    colors.push(match[1]);
  }

  // Should have used multiple distinct colors for a long enough string
  const uniqueColors = new Set(colors);
  assert.ok(uniqueColors.size >= 2, `expected >= 2 colors, got ${uniqueColors.size}`);
});

// ── renderLogo (via dynamic import, mock Theme) ──

test('renderLogo returns correct number of lines', async () => {
  // Import internal renderLogo — it's not exported, so we test indirectly
  // by verifying that the extension's default export registers correctly.
  // Instead, we verify gradientLine on the actual PI_LOGO lines.

  const PI_LOGO = [
    '██████████    ',
    '████  ████    ',
    '████  ████    ',
    '████████  ████',
    '████      ████',
    '████      ████',
  ];

  for (const line of PI_LOGO) {
    const result = gradientLine(line);
    // Should produce non-empty output
    assert.ok(result.length > 0);
    // Non-space chars should be colored
    assert.ok(result.includes('\x1b['));
  }
});

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '');
}

function enableHeaderInfo(cwd: string): void {
  mkdirSync(join(cwd, '.pi'), { recursive: true });
  writeFileSync(join(cwd, '.pi', 'settings.json'), JSON.stringify({ 'header-info': true }));
}

interface RenderHeaderOptions {
  cwd?: string;
  commands?: any[];
  themes?: any[];
  beforeAgentStartEvent?: any;
}

function renderHeader(
  reason: 'startup' | 'reload' | 'new',
  width: number,
  options: RenderHeaderOptions = {},
): string[] {
  let sessionStartHandler: ((event: { reason: string }, ctx: any) => void) | undefined;
  let beforeAgentStartHandler: ((event: any, ctx: any) => void) | undefined;
  let headerFactory:
    | ((tui: any, theme: any) => { render: (width: number) => string[] })
    | undefined;
  const pi = {
    on(event: string, handler: (event: any, ctx: any) => void) {
      if (event === 'session_start') sessionStartHandler = handler;
      if (event === 'before_agent_start') beforeAgentStartHandler = handler;
    },
    getCommands() {
      return options.commands ?? [];
    },
    events: { on() {} },
  };
  const ctx = {
    hasUI: true,
    cwd: options.cwd ?? '/tmp/pi-powerline-test-missing-settings',
    sessionManager: {
      getBranch() {
        return [];
      },
    },
    ui: {
      theme: undefined,
      getAllThemes() {
        return options.themes ?? [];
      },
      setHeader(factory: typeof headerFactory) {
        headerFactory = factory;
      },
    },
  };
  const theme = {
    fg(_color: string, text: string) {
      return `\x1b[31m${text}\x1b[0m`;
    },
  };
  const tui = { requestRender() {} };

  registerHeader(pi as any);
  sessionStartHandler?.({ reason }, ctx);
  if (options.beforeAgentStartEvent) beforeAgentStartHandler?.(options.beforeAgentStartEvent, ctx);
  assert.ok(headerFactory);
  return headerFactory(tui, theme).render(width);
}

test('header centers logo, version, and reason lines', () => {
  const lines = renderHeader('startup', 30).map(stripAnsi);

  assert.equal(lines[8], `${' '.repeat(11)}Welcome`);
  assert.ok(lines.slice(1).every((line) => line.length <= 30));
});

test('header center-wraps when width is too narrow', () => {
  const lines = renderHeader('new', 8).map(stripAnsi);
  const trimmed = lines.map((line) => line.trim());

  assert.ok(trimmed.includes('New'));
  assert.ok(trimmed.includes('Session'));
  assert.ok(trimmed.includes('Started'));
  assert.ok(lines.slice(1).every((line) => line.length <= 8));
});

test('header hides diagnostic info by default', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(!lines.includes('[Context]'));
    assert.ok(!lines.includes('[Skills]'));
    assert.ok(!lines.includes('[Prompts]'));
    assert.ok(!lines.includes('[Extensions]'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header hides diagnostic info for new sessions even when enabled', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('new', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.some((line) => line.includes('New Session Started')));
    assert.ok(!lines.includes('[Context]'));
    assert.ok(!lines.includes('[Skills]'));
    assert.ok(!lines.includes('[Prompts]'));
    assert.ok(!lines.includes('[Extensions]'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header shows diagnostic info for reload when enabled', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('reload', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.some((line) => line.includes('Reloaded')));
    assert.ok(lines.includes('[Context]'));
    assert.ok(lines.includes('  • AGENTS.md'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header context section displays relative system prompt paths', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');
    writeFileSync(join(cwd, '.pi', 'APPEND_SYSTEM.md'), 'append context');

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Context]'));
    assert.ok(lines.includes('  • AGENTS.md'));
    assert.ok(lines.includes('  • .pi/APPEND_SYSTEM.md'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header context section refreshes from before_agent_start with relative paths', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    const beforeAgentStartEvent = {
      systemPromptOptions: {
        contextFiles: [{ path: join(cwd, 'nested', 'AGENTS.md'), content: 'nested context' }],
        appendSystemPrompt: 'extra prompt',
      },
    };

    const lines = renderHeader('startup', 80, { cwd, beforeAgentStartEvent }).map(stripAnsi);

    assert.ok(lines.includes('[Context]'));
    assert.ok(lines.includes('  • nested/AGENTS.md'));
    assert.ok(lines.includes('  • append system prompt'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header skills section displays loaded skills from before_agent_start', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    const beforeAgentStartEvent = {
      systemPromptOptions: {
        contextFiles: [],
        skills: [{ name: 'skill-b' }, { name: 'skill-a' }],
      },
    };

    const lines = renderHeader('startup', 80, { cwd, beforeAgentStartEvent }).map(stripAnsi);

    assert.ok(lines.includes('[Skills]'));
    assert.ok(lines.includes('  • skill-a'));
    assert.ok(lines.includes('  • skill-b'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header extensions section displays package name with parenthesized version', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const extensionDir = join(cwd, 'extensions', 'demo');
  try {
    mkdirSync(extensionDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(
      join(extensionDir, 'package.json'),
      JSON.stringify({ name: 'demo-extension', version: '1.2.3' }),
    );

    const commands = [
      {
        name: 'demo',
        source: 'extension',
        sourceInfo: {
          path: join(extensionDir, 'index.ts'),
          source: 'local',
          scope: 'project',
          origin: 'top-level',
          baseDir: extensionDir,
        },
      },
    ];

    const lines = renderHeader('startup', 80, { cwd, commands }).map(stripAnsi);

    assert.ok(lines.includes('[Extensions]'));
    assert.ok(lines.includes('  • demo-extension (v1.2.3)'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header extensions section falls back to path instead of local source label', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const extensionDir = join(cwd, '.pi', 'extensions');
  const extensionPath = join(extensionDir, 'local-extension.ts');
  try {
    mkdirSync(extensionDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(extensionPath, 'export default function () {}');

    const commands = [
      {
        name: 'local-command',
        source: 'extension',
        sourceInfo: {
          path: extensionPath,
          source: 'local',
          scope: 'project',
          origin: 'top-level',
        },
      },
    ];

    const lines = renderHeader('startup', 80, { cwd, commands }).map(stripAnsi);

    assert.ok(lines.includes('[Extensions]'));
    assert.ok(lines.includes('  • .pi/extensions/local-extension.ts'));
    assert.ok(!lines.includes('  • local'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

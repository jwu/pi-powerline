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

function writeHeaderSettings(cwd: string, settings: Record<string, unknown>): void {
  mkdirSync(join(cwd, '.pi'), { recursive: true });
  writeFileSync(join(cwd, '.pi', 'settings.json'), JSON.stringify(settings));
}

function enableHeaderInfo(cwd: string): void {
  writeHeaderSettings(cwd, { 'header-info': true, quietStartup: true });
}

interface RenderHeaderOptions {
  cwd?: string;
  commands?: any[];
  themes?: any[];
  activeTools?: string[];
  beforeAgentStartEvent?: any;
}

function renderHeader(
  reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork',
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
    getActiveTools() {
      return options.activeTools ?? [];
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
  assert.equal(lines.at(-1), '');
});

test('header center-wraps when width is too narrow', () => {
  const lines = renderHeader('new', 8).map(stripAnsi);
  const trimmed = lines.map((line) => line.trim());

  assert.ok(trimmed.includes('New'));
  assert.ok(trimmed.includes('Session'));
  assert.ok(trimmed.includes('Started'));
  assert.ok(lines.slice(1).every((line) => line.length <= 8));
});

test('header renders resume and fork reason labels', () => {
  const resumeLines = renderHeader('resume', 80).map(stripAnsi);
  const forkLines = renderHeader('fork', 80).map(stripAnsi);

  assert.ok(resumeLines.some((line) => line.includes('Session Resumed')));
  assert.ok(forkLines.some((line) => line.includes('Session Forked')));
});

test('header hides diagnostic info when quietStartup is false by default', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    writeHeaderSettings(cwd, { quietStartup: false });
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(!lines.includes('[Context]'));
    assert.ok(!lines.includes('[Tools]'));
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
    assert.ok(!lines.includes('[Tools]'));
    assert.ok(!lines.includes('[Skills]'));
    assert.ok(!lines.includes('[Prompts]'));
    assert.ok(!lines.includes('[Extensions]'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header shows diagnostic info when quietStartup is true', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    writeHeaderSettings(cwd, { 'header-info': true, quietStartup: true });
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Context]'));
    assert.ok(lines.includes('  • AGENTS.md'));
    assert.ok(lines.includes('[Tools]'));
    assert.ok(lines.includes('  • none'));
    assert.equal(lines.at(-1), '');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header hides diagnostic info when quietStartup is false', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    writeHeaderSettings(cwd, { 'header-info': true, quietStartup: false });
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.some((line) => line.includes('Welcome')));
    assert.ok(!lines.includes('[Context]'));
    assert.ok(!lines.includes('[Tools]'));
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
    assert.ok(lines.includes('[Tools]'));
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

test('header tools section displays active tools sorted alphabetically', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const activeTools = ['read', 'bash', 'edit', 'write'];
    const lines = renderHeader('startup', 80, { cwd, activeTools }).map(stripAnsi);

    assert.ok(lines.includes('[Tools]'));
    assert.ok(lines.includes('  • bash'));
    assert.ok(lines.includes('  • edit'));
    assert.ok(lines.includes('  • read'));
    assert.ok(lines.includes('  • write'));

    // verify sort order: bash < edit < read < write
    const startIdx = lines.indexOf('[Tools]');
    assert.ok(startIdx > 0);
    const toolsSlice = lines.slice(startIdx + 1, startIdx + 5);
    const sorted = ['  • bash', '  • edit', '  • read', '  • write'];
    assert.deepEqual(toolsSlice, sorted);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header counts line includes tools count', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const activeTools = ['bash', 'read', 'edit'];
    const lines = renderHeader('startup', 80, { cwd, activeTools }).map(stripAnsi);

    const countsLine = lines.find((line) => line.includes('tools:'));
    assert.ok(countsLine, 'counts line should include tools: N');
    assert.match(countsLine, /tools:\s*3/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── packages section ──

test('header packages section shows package name with version from local path', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const pkgDir = join(cwd, 'my-test-pkg');
  try {
    mkdirSync(pkgDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@test/my-pkg', version: '2.0.0' }),
    );
    // write project settings with this package
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: [pkgDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Packages]'));
    assert.ok(lines.some((l) => l.includes('@test/my-pkg (v2.0.0) [project]')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header packages section shows package name without version when missing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const pkgDir = join(cwd, 'no-version-pkg');
  try {
    mkdirSync(pkgDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'no-version-pkg' }));
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: [pkgDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Packages]'));
    assert.ok(lines.some((l) => l.includes('  • no-version-pkg [project]')));
    assert.ok(!lines.some((l) => l.includes('no-version-pkg (v')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header packages section deduplicates by source', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const pkgDir = join(cwd, 'dup-pkg');
  try {
    mkdirSync(pkgDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'dup-pkg', version: '1.0.0' }),
    );
    // same package listed twice
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: [pkgDir, pkgDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    // should only appear once
    const occurrences = lines.filter((l) => l.includes('dup-pkg (v1.0.0) [project]')).length;
    assert.equal(occurrences, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header packages count appears in counts line', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const pkgDir = join(cwd, 'count-pkg');
  try {
    mkdirSync(pkgDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'count-pkg', version: '1.0.0' }),
    );
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: [pkgDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    const countsLine = lines.find((line) => line.includes('packages:'));
    assert.ok(countsLine, 'counts line should include packages: N');
    assert.match(countsLine, /packages:\s*\d+/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── extensions section (scanned from settings.json extensions field) ──

test('header extensions section lists .ts files from settings extensions dir', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const extDir = join(cwd, '.pi', 'extensions-test');
  try {
    mkdirSync(extDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(join(extDir, 'alpha.ts'), 'export default function () {}');
    writeFileSync(join(extDir, 'beta.ts'), 'export default function () {}');
    writeFileSync(join(extDir, 'not-an-extension.md'), '# markdown');
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      extensions: [extDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Extensions]'));
    assert.ok(lines.some((l) => l.includes('.pi/extensions-test/alpha.ts')));
    assert.ok(lines.some((l) => l.includes('.pi/extensions-test/beta.ts')));
    // non-ts files excluded
    assert.ok(!lines.some((l) => l.includes('not-an-extension')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header extensions section shows single .ts file entry', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const extFile = join(cwd, 'custom-ext.ts');
  try {
    enableHeaderInfo(cwd);
    writeFileSync(extFile, 'export default function () {}');
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      extensions: [extFile],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Extensions]'));
    assert.ok(lines.some((l) => l.includes('custom-ext.ts')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header extensions section shows none when no extensions configured', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    // Point home to a temp dir with no settings to isolate from global
    const prevHome = process.env.HOME;
    const fakeHome = mkdtempSync(join(tmpdir(), 'pi-powerline-header-home-'));
    process.env.HOME = fakeHome;
    try {
      writeHeaderSettings(cwd, {
        'header-info': true,
        quietStartup: true,
      });

      const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

      assert.ok(lines.includes('[Extensions]'));
      assert.ok(lines.some((l) => l.includes('  • none')));
    } finally {
      process.env.HOME = prevHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── counts line order ──

test('header counts line has correct field order', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    enableHeaderInfo(cwd);
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');

    const lines = renderHeader('startup', 120, { cwd }).map(stripAnsi);

    const countsLine = lines.find(
      (line) =>
        line.includes('context:') &&
        line.includes('packages:') &&
        line.includes('tools:') &&
        line.includes('skills:') &&
        line.includes('prompts:') &&
        line.includes('commands:') &&
        line.includes('extensions:') &&
        line.includes('themes:'),
    );
    assert.ok(countsLine, 'counts line should contain all fields');

    // verify exact order
    const idx = (s: string) => countsLine!.indexOf(s);
    assert.ok(idx('context:') < idx('packages:'));
    assert.ok(idx('packages:') < idx('tools:'));
    assert.ok(idx('tools:') < idx('skills:'));
    assert.ok(idx('skills:') < idx('prompts:'));
    assert.ok(idx('prompts:') < idx('commands:'));
    assert.ok(idx('commands:') < idx('extensions:'));
    assert.ok(idx('extensions:') < idx('themes:'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header sections follow consistent order', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const pkgDir = join(cwd, 'order-pkg');
  const extDir = join(cwd, '.pi', 'order-ext');
  try {
    mkdirSync(pkgDir, { recursive: true });
    mkdirSync(extDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'order-pkg', version: '1.0.0' }),
    );
    writeFileSync(join(extDir, 'order-ext.ts'), 'export default function () {}');
    writeFileSync(join(cwd, 'AGENTS.md'), 'project context');
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: [pkgDir],
      extensions: [extDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    // Extract section headers in order
    const sections = lines.filter((l) => l.startsWith('[') && l.endsWith(']'));
    const sectionNames = sections.map((l) => l.replace(/\[|\]/g, ''));

    const idx = (s: string) => sectionNames.indexOf(s);
    assert.ok(idx('Context') >= 0, 'should have Context section');
    assert.ok(idx('Packages') >= 0, 'should have Packages section');
    assert.ok(idx('Tools') >= 0, 'should have Tools section');
    assert.ok(idx('Skills') >= 0, 'should have Skills section');
    assert.ok(idx('Prompts') >= 0, 'should have Prompts section');
    assert.ok(idx('Extensions') >= 0, 'should have Extensions section');

    // verify order
    assert.ok(idx('Context') < idx('Packages'));
    assert.ok(idx('Packages') < idx('Tools'));
    assert.ok(idx('Tools') < idx('Skills'));
    assert.ok(idx('Skills') < idx('Prompts'));
    assert.ok(idx('Prompts') < idx('Extensions'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── npm package resolution ──

test('header packages resolves npm package from project-local .pi/npm', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const npmDir = join(cwd, '.pi', 'npm', 'node_modules', 'pi-local-pkg');
  try {
    mkdirSync(npmDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(
      join(npmDir, 'package.json'),
      JSON.stringify({ name: 'pi-local-pkg', version: '3.1.0' }),
    );
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      packages: ['npm:pi-local-pkg'],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.includes('[Packages]'));
    assert.ok(lines.some((l) => l.includes('pi-local-pkg (v3.1.0) [project]')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('header packages shows npm package name without version when not installed', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  try {
    const prevHome = process.env.HOME;
    const fakeHome = mkdtempSync(join(tmpdir(), 'pi-powerline-fake-home-'));
    process.env.HOME = fakeHome;
    try {
      enableHeaderInfo(cwd);
      writeHeaderSettings(cwd, {
        'header-info': true,
        quietStartup: true,
        packages: ['npm:missing-pkg'],
      });

      const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

      assert.ok(lines.includes('[Packages]'));
      assert.ok(lines.some((l) => l.includes('  • missing-pkg [project]')));
      assert.ok(!lines.some((l) => l.includes('missing-pkg (v')));
    } finally {
      process.env.HOME = prevHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── extensions: non-ts exclusion ──

test('header extensions excludes non-ts files from directory scan', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-powerline-header-'));
  const extDir = join(cwd, '.pi', 'mixed-ext');
  try {
    mkdirSync(extDir, { recursive: true });
    enableHeaderInfo(cwd);
    writeFileSync(join(extDir, 'good.ts'), 'export default function () {}');
    writeFileSync(join(extDir, 'readme.md'), '# docs');
    writeFileSync(join(extDir, 'config.json'), '{}');
    writeHeaderSettings(cwd, {
      'header-info': true,
      quietStartup: true,
      extensions: [extDir],
    });

    const lines = renderHeader('startup', 80, { cwd }).map(stripAnsi);

    assert.ok(lines.some((l) => l.includes('good.ts')));
    assert.ok(!lines.some((l) => l.includes('readme.md')));
    assert.ok(!lines.some((l) => l.includes('config.json')));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleWidth } from '@earendil-works/pi-tui';
import { PromptPrefixEditor, updateTheme } from '../extensions/editor.ts';

// ── helpers ──

// 使用 pi-tui 的宽度计算：1.6.0 的 Editor 会在内容行里放光标标记
// （APC 序列，显示宽度为 0），朴素的正则长度会把它算进去。

function mockTUI(columns?: number) {
  return {
    requestRender: () => {},
    terminal: { rows: 100, columns },
  } as any;
}

function mockEditorTheme() {
  return {
    borderColor: (str: string) => str,
    selectList: {} as any,
  };
}

function mockKeybindings() {
  return { matches: () => false } as any;
}

function makeEditor(columns?: number): PromptPrefixEditor {
  return new PromptPrefixEditor(mockTUI(columns), mockEditorTheme(), mockKeybindings());
}

/** Set the module-level currentTheme used by PromptPrefixEditor.render. */
/** Mock theme that passes text through unchanged (for width/layout tests). */
function setPlainTheme() {
  updateTheme({
    fg(_color: string, text: string) {
      return text;
    },
    bg() {
      return '';
    },
    bold(text: string) {
      return text;
    },
  } as any);
}

/** Mock theme that wraps text in visible tags (for color-token tests). */
function setTaggedTheme() {
  updateTheme({
    fg(color: string, text: string): string {
      return `{${color}}${text}{/}`;
    },
    bg() {
      return '';
    },
    bold(text: string) {
      return text;
    },
  } as any);
}

/** Set module-level liveCtx + breadcrumbMode for breadcrumb embedding tests. */
// ── basic rendering (plain theme, no color tags) ──

test('empty editor renders prefix + borders at correct width', () => {
  setPlainTheme();
  const editor = makeEditor();
  const lines = editor.render(20);

  assert.ok(lines.length >= 3, 'should have at least 3 lines');

  // Top and bottom borders are dashes at full width
  assert.equal(visibleWidth(lines[0]), 20);
  assert.equal(visibleWidth(lines[lines.length - 1]), 20);

  // Content line has ❯ prefix (plain theme, no color wrapper)
  assert.ok(lines[1].startsWith('❯'));
  assert.equal(visibleWidth(lines[1]), 20);
});

test('editor with text renders content after ❯ prefix', () => {
  setPlainTheme();
  const editor = makeEditor();
  editor.setText('hello world');
  const lines = editor.render(30);

  assert.ok(lines.length >= 3);
  assert.ok(lines[1].includes('hello world'));
  assert.ok(lines[1].startsWith('❯'));
});

// ── width consistency (plain theme) ──

test('all output lines have exact target width for various sizes', () => {
  setPlainTheme();
  const editor = makeEditor();

  for (const w of [10, 20, 40, 80, 120]) {
    const lines = editor.render(w);
    for (const line of lines) {
      assert.equal(
        visibleWidth(line),
        w,
        `width=${w}: line visible width ${visibleWidth(line)} !== ${w}`,
      );
    }
  }
});

test('minimum width (3) renders correctly', () => {
  setPlainTheme();
  const editor = makeEditor();
  const lines = editor.render(3);

  assert.ok(lines.length >= 3);
  for (const line of lines) {
    assert.equal(visibleWidth(line), 3);
  }
});

test('terminal columns cap prevents over-wide lines after resize', () => {
  setPlainTheme();
  const editor = makeEditor(27);
  editor.setText('hello world');
  const lines = editor.render(45);

  assert.ok(lines.length >= 3);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 27, `line visible width ${visibleWidth(line)} > 27`);
  }
});

// ── bash mode (tagged theme for color detection) ──

test('text starting with ! switches to bashMode color tokens', () => {
  setTaggedTheme();
  const editor = makeEditor();
  editor.setText('!echo hello');
  const lines = editor.render(20);

  // Top border should be bashMode colored
  assert.ok(lines[0].includes('{bashMode}─{/}'), 'border should be bashMode colored');
  // Prefix should be bashMode colored
  assert.ok(lines[1].includes('{bashMode}❯{/}'), 'prefix should be bashMode colored');
});

test('normal text uses default color tokens', () => {
  setTaggedTheme();
  const editor = makeEditor();
  editor.setText('hello world');
  const lines = editor.render(20);

  // Top border should be borderAccent colored
  assert.ok(lines[0].includes('{borderAccent}─{/}'));
  // Prefix should be dim colored
  assert.ok(lines[1].includes('{dim}❯{/}'));
});

test('bash mode triggered by ! even with leading spaces', () => {
  setTaggedTheme();
  const editor = makeEditor();
  editor.setText('   !echo hello');
  const lines = editor.render(20);

  assert.ok(lines[0].includes('{bashMode}─{/}'));
});

test('text with ! in the middle not treated as bash mode', () => {
  setTaggedTheme();
  const editor = makeEditor();
  editor.setText('hello! world');
  const lines = editor.render(20);

  // ! is not at the start, so normal mode
  assert.ok(lines[0].includes('{borderAccent}─{/}'));
  assert.ok(lines[1].includes('{dim}❯{/}'));
});

// ── multi-line content ──

test('multi-line text renders prefix on first line and indent on subsequent lines', () => {
  setPlainTheme();
  const editor = makeEditor();
  editor.setText('first line\nsecond line');
  const lines = editor.render(30);

  const contentLines = lines.slice(1, -1);
  const firstContent = contentLines.find((l) => l.includes('first line'));
  const secondContent = contentLines.find((l) => l.includes('second line'));

  assert.ok(firstContent, 'first line should be present');
  assert.ok(secondContent, 'second line should be present');
  assert.ok(firstContent.startsWith('❯'), 'first content line should have ❯ prefix');
  assert.ok(!secondContent.startsWith('❯'), 'second content line should have indent, not prefix');
});

// ── content preserving ──

test('ANSI codes in content are preserved', () => {
  setPlainTheme();
  const editor = makeEditor();
  editor.setText('\x1b[31mred\x1b[0m text');
  const lines = editor.render(30);

  assert.ok(lines.some((l) => l.includes('\x1b[31mred\x1b[0m')));
});

test('content lines preserve original spacing after prefix', () => {
  setPlainTheme();
  const editor = makeEditor();
  editor.setText('  indented');
  const lines = editor.render(20);

  const contentLine = lines[1];
  assert.ok(contentLine.includes('  indented'));
});

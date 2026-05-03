import test from 'node:test';
import assert from 'node:assert/strict';

// ── reimplemented helpers for unit isolation ──

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

// ═══════════════════════════════════════════════════
// withIcon
// ═══════════════════════════════════════════════════

test('withIcon returns icon + space + text when icon is given', () => {
  assert.equal(withIcon('\uEC19', 'my-model'), '\uEC19 my-model');
  assert.equal(withIcon('\uF115', 'src'), '\uF115 src');
});

test('withIcon returns text only when icon is empty', () => {
  assert.equal(withIcon('', 'my-model'), 'my-model');
  assert.equal(withIcon('', 'dir'), 'dir');
});

// ═══════════════════════════════════════════════════
// hexFg
// ═══════════════════════════════════════════════════

test('hexFg generates ANSI true color escape sequence', () => {
  assert.equal(hexFg('#d787af', 'hello'), '\x1b[38;2;215;135;175mhello');
  assert.equal(hexFg('#00afaf', 'world'), '\x1b[38;2;0;175;175mworld');
  assert.equal(hexFg('#ffffff', 'white'), '\x1b[38;2;255;255;255mwhite');
  assert.equal(hexFg('#000000', 'black'), '\x1b[38;2;0;0;0mblack');
});

test('hexFg works without # prefix', () => {
  assert.equal(hexFg('d787af', 'hello'), '\x1b[38;2;215;135;175mhello');
});

test('hexFg handles uppercase hex', () => {
  assert.equal(hexFg('#FF00FF', 'mag'), '\x1b[38;2;255;0;255mmag');
});

// ═══════════════════════════════════════════════════
// widget render logic (model + folder, no think level)
// ═══════════════════════════════════════════════════

/** Minimal theme stub — only need fg */
function makeTheme(): any {
  return {
    fg(color: string, text: string): string {
      return `{${color}}${text}{/}`;
    },
  };
}

/** Render one line simulating the live render path (model → folder). */
function renderWidgetLine(modelName: string, folder: string): string {
  const theme = makeTheme();
  const iconModel = '';
  const iconFolder = 'dir';
  const sep = '|';

  const modelText = withIcon(iconModel, modelName);
  const folderText = withIcon(iconFolder, folder);

  const line =
    hexFg('#d787af', modelText) +
    theme.fg('dim', ` ${sep} `) +
    hexFg('#00afaf', folderText) +
    '\x1b[0m';

  return line;
}

test('widget render includes model name in magenta', () => {
  const line = renderWidgetLine('claude-sonnet', 'myproj');
  assert.ok(line.includes('\x1b[38;2;215;135;175mclaude-sonnet'));
});

test('widget render includes folder in cyan', () => {
  const line = renderWidgetLine('m1', 'src');
  assert.ok(line.includes('\x1b[38;2;0;175;175m'));
  assert.ok(line.includes('dir src'));
});

test('widget render includes dim separator', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.includes('{dim} | {/}'));
});

test('widget render output ends with ANSI reset', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.endsWith('\x1b[0m'));
});

test('widget render structure: model → sep → folder', () => {
  const line = renderWidgetLine('MODEL', 'DIR');

  const modelIdx = line.indexOf('MODEL');
  const sepIdx = line.indexOf('{dim} | {/}');
  const dirIdx = line.indexOf('dir DIR');

  assert.ok(modelIdx < sepIdx, 'model before sep');
  assert.ok(sepIdx < dirIdx, 'sep before folder');
});

// ═══════════════════════════════════════════════════
// live state injection pattern
// ═══════════════════════════════════════════════════

test('render uses liveCtx.model for model name', () => {
  const cases: Array<[any, string]> = [
    [{ model: { name: 'Claude 4' } }, 'Claude 4'],
    [{ model: { id: 'claude-4' } }, 'claude-4'],
    [{ model: undefined }, 'no-model'],
    [null, 'no-model'],
  ];

  for (const [ctx, expected] of cases) {
    const modelName = ctx?.model?.name || ctx?.model?.id || 'no-model';
    assert.equal(modelName, expected);
  }
});

test('render uses liveCtx.cwd for folder name', () => {
  const cases: Array<[any, string]> = [
    [{ cwd: '/home/user/projects/foo' }, '/home/user/projects/foo'],
    [{ cwd: '/tmp' }, '/tmp'],
    [null, process.cwd()],
    [{}, process.cwd()],
  ];

  for (const [ctx, expected] of cases) {
    const cwd = ctx?.cwd ?? process.cwd();
    assert.equal(cwd, expected);
  }
});

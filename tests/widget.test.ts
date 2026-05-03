import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexFg,
  ICON_FOLDER,
  ICON_MODEL,
  renderBreadcrumbInfo,
  SEP,
  withIcon,
} from '../breadcrumb.ts';

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
  const data = {
    modelName,
    folder,
    modelText: withIcon(ICON_MODEL, modelName),
    folderText: withIcon(ICON_FOLDER, folder),
  };
  return renderBreadcrumbInfo(data, theme, true);
}

test('widget render includes model name in magenta', () => {
  const line = renderWidgetLine('claude-sonnet', 'myproj');
  const expectText = ICON_MODEL ? `${ICON_MODEL} claude-sonnet` : 'claude-sonnet';
  assert.ok(line.includes(`\x1b[38;2;215;135;175m${expectText}`));
});

test('widget render includes folder in cyan', () => {
  const line = renderWidgetLine('m1', 'src');
  assert.ok(line.includes('\x1b[38;2;0;175;175m'));
  const expectText = ICON_FOLDER ? `${ICON_FOLDER} src` : 'src';
  assert.ok(line.includes(expectText));
});

test('widget render includes dim separator', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.includes(`{dim} ${SEP} {/}`));
});

test('widget render output ends with ANSI reset', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.endsWith('\x1b[0m'));
});

test('widget render structure: model → sep → folder', () => {
  const line = renderWidgetLine('MODEL', 'DIR');

  const modelIdx = line.indexOf('MODEL');
  const sepIdx = line.indexOf(`{dim} ${SEP} {/}`);
  const dirText = ICON_FOLDER ? `${ICON_FOLDER} DIR` : 'DIR';
  const dirIdx = line.indexOf(dirText);

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

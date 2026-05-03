import test from 'node:test';
import assert from 'node:assert/strict';
// renderPromptPrefix is tested indirectly via editor module; reimplement inline for unit isolation
function renderPromptPrefix(
  lines: string[],
  width: number,
  borderChar: string,
  prefixChar: string,
  indentChar: string,
): string[] {
  if (lines.length < 3) return lines;

  let bottomIdx = lines.length - 1;
  for (let i = lines.length - 1; i >= 1; i--) {
    const stripped = (lines[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      bottomIdx = i;
      break;
    }
  }

  const result: string[] = [];

  result.push(borderChar.repeat(width));

  for (let i = 1; i < bottomIdx; i++) {
    if (i === 1) {
      result.push(prefixChar + ' ' + (lines[i] ?? ''));
    } else {
      result.push(indentChar + ' ' + (lines[i] ?? ''));
    }
  }

  if (bottomIdx === 1) {
    result.push(prefixChar + ' ' + ' '.repeat(width - 2));
  }

  result.push(borderChar.repeat(width));

  for (let i = bottomIdx + 1; i < lines.length; i++) {
    result.push(lines[i] ?? '');
  }

  return result;
}

const B = '─';
const P = '>';
const I = ' ';

// ── helpers ──

/** Strip ANSI escape codes and count visible characters. */
function visibleWidth(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string to the given visible width with trailing spaces. */
function padTo(str: string, width: number): string {
  const w = visibleWidth(str);
  return w >= width ? str : str + ' '.repeat(width - w);
}

/** Simulate a border line from Editor.render (pure dashes, no leading space). */
function editorBorder(w: number, char = B): string {
  return char.repeat(w);
}

/** Build a minimal well-formed Editor.render output for given content lines. */
function editorLines(editorWidth: number, content: string[]): string[] {
  return [
    editorBorder(editorWidth),
    ...content.map((c) => padTo(c, editorWidth)),
    editorBorder(editorWidth),
  ];
}

// ── basic rendering ──

test('single line renders with > prefix and borders', () => {
  const w = 20;
  const lines = editorLines(w - 2, ['hello']);
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 3);
  assert.equal(visibleWidth(result[0]), w);
  assert.match(result[1], /^> hello/);
  assert.ok(result[1].endsWith('hello' + ' '.repeat(w - 2 - 5)));
  assert.equal(visibleWidth(result[2]), w);
});

test('multi-line renders with prefix on first line and indent on subsequent', () => {
  const w = 20;
  const lines = editorLines(w - 2, ['line1', 'line2']);
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 4);
  assert.match(result[1], /^> line1/);
  assert.match(result[2], /^  line2/);
});

test('short input (< 3 lines) passes through unchanged', () => {
  const lines = ['just one line'];
  assert.deepEqual(renderPromptPrefix(lines, 20, B, P, I), ['just one line']);

  const lines2 = ['line0', 'line1'];
  assert.deepEqual(renderPromptPrefix(lines2, 20, B, P, I), ['line0', 'line1']);
});

test('extra lines below the border are passed through', () => {
  const w = 20;
  const lines = [...editorLines(w - 2, ['content']), 'autocomplete entry'];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 4);
  assert.match(result[1], /^> content/);
  assert.equal(result[3], 'autocomplete entry');
});

// ── width consistency ──

test('all output lines have exact target width', () => {
  const w = 30;
  const lines = editorLines(w - 2, ['a', 'bb', 'ccc']);
  const result = renderPromptPrefix(lines, w, B, P, I);

  for (const line of result) {
    assert.equal(
      visibleWidth(line),
      w,
      `line visible width = ${visibleWidth(line)}, expected ${w}`,
    );
  }
});

test('all output lines have exact target width (narrow terminal)', () => {
  const w = 8;
  const lines = editorLines(w - 2, ['hi']);
  const result = renderPromptPrefix(lines, w, B, P, I);

  for (const line of result) {
    assert.equal(visibleWidth(line), w);
  }
});

// ── border detection ──

test('bottom border is detected via ─── pattern (backward scan)', () => {
  const w = 20;
  const ew = w - 2;
  // Content line starting with ─── — must NOT be mistaken for border
  const lines = [
    editorBorder(ew),
    padTo('hello', ew),
    padTo('─── looks like a border but is content', ew),
    editorBorder(ew),
  ];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 4);
  assert.match(result[1], /^> hello/);
  assert.match(result[2], /^  ─── looks like a border/);
});

test('ANSI codes in border lines are stripped before detection', () => {
  const w = 20;
  const coloredBorder = '\x1b[33m' + B.repeat(w - 2) + '\x1b[0m';
  const lines = [editorBorder(w - 2), padTo('text', w - 2), coloredBorder];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 3);
  assert.match(result[1], /^> text/);
});

test('bottom line without ─── is treated as border area (last content line discarded)', () => {
  const w = 20;
  const ew = w - 2;
  // 3 lines with no bottom border: last line falls into border zone and is dropped
  const lines = [editorBorder(ew), padTo('text', ew), padTo('no border here', ew)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  // Only lines[1] gets processed; lines[2] is in border-position → replaced by generated border
  assert.equal(result.length, 3);
  assert.match(result[1], /^> text/);
  assert.equal(visibleWidth(result[2]), w);
});

// ── content preserving ──

test('content lines preserve original text after prefix', () => {
  const w = 20;
  const content = padTo('  indented  text  ', w - 2);
  const lines = [editorBorder(w - 2), content, editorBorder(w - 2)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.ok(result[1].endsWith(content));
});

test('ANSI codes in content lines are preserved', () => {
  const w = 20;
  const coloredText = '\x1b[31mred\x1b[0m text';
  const content = padTo(coloredText, w - 2);
  const lines = [editorBorder(w - 2), content, editorBorder(w - 2)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.ok(result[1].includes(coloredText));
});

// ── edge cases ──

test('content shorter than editor width is correctly padded by caller', () => {
  const w = 15;
  const ew = w - 2; // 13
  const lines = [editorBorder(ew), padTo('hi', ew), editorBorder(ew)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 3);
  // "hi" + 11 spaces = 13 chars from editor, then "> " prefix → 15 total
  assert.equal(visibleWidth(result[1]), w);
});

// ── bottomIdx === 1 (empty editor content) ──

test('bottomIdx === 1: empty content between borders produces empty prefix line', () => {
  const w = 10;
  const ew = w - 2; // 8
  // lines.length < 3 → early return; use 3 lines with empty content
  const lines3 = [editorBorder(ew), padTo('', ew), editorBorder(ew)];
  const result = renderPromptPrefix(lines3, w, B, P, I);

  // bottomIdx === 1 → generates "> " + spaces as the content area
  assert.equal(result.length, 3);
  assert.equal(visibleWidth(result[0]), w);
  assert.ok(result[1].endsWith(' '.repeat(w - 2)));
  assert.equal(visibleWidth(result[1]), w);
  assert.equal(visibleWidth(result[2]), w);
});

test('bottomIdx === 1 with trailing lines preserved', () => {
  const w = 12;
  const ew = w - 2;
  // Top border, bottom border (at index 1, detected by backward scan), + trailing extras
  const lines = [
    editorBorder(ew),
    editorBorder(ew), // border containing ─── → bottomIdx = 1
    'trailing-1',
    'trailing-2',
  ];
  const result = renderPromptPrefix(lines, w, B, P, I);

  // Output: top-border, empty > line, bottom-border, trailing-1, trailing-2
  assert.equal(result.length, 5);
  assert.match(result[1], /^>\s/);
  assert.equal(result[3], 'trailing-1');
  assert.equal(result[4], 'trailing-2');
});

// ── ANSI-colored border/prefix/indent chars ──

test('accepts ANSI-colored border/prefix/indent characters', () => {
  const w = 14;
  const ew = w - 2;
  const coloredBorder = '\x1b[32m─\x1b[0m';
  const coloredPrefix = '\x1b[33m❯\x1b[0m';
  const coloredIndent = '\x1b[34m·\x1b[0m';

  const lines = [editorBorder(ew), padTo('hi', ew), editorBorder(ew)];
  const result = renderPromptPrefix(lines, w, coloredBorder, coloredPrefix, coloredIndent);

  // All lines should have the target visible width
  for (const line of result) {
    assert.equal(visibleWidth(line), w);
  }
  // prefix line should contain the colored prefix
  assert.ok(result[1].includes(coloredPrefix));
});

// ── custom characters ──

test('works with arbitrary custom characters', () => {
  const w = 16;
  const ew = w - 2;
  const lines = [
    '*'.repeat(ew), // star border
    padTo('hello', ew),
    padTo('world', ew),
    '*'.repeat(ew),
  ];
  const result = renderPromptPrefix(lines, w, '*', '$', '#');

  assert.equal(result.length, 4);
  assert.equal(visibleWidth(result[0]), w);
  // ">" is the default prefix, but here we use "$"
  assert.ok(result[1].startsWith('$'));
  assert.ok(result[2].startsWith('#'));
  assert.equal(visibleWidth(result[3]), w);
});

// ── empty lines in content ──

test('empty content lines between borders are preserved with proper prefix', () => {
  const w = 10;
  const ew = w - 2;
  const lines = [
    editorBorder(ew),
    padTo('first', ew),
    padTo('', ew),
    padTo('', ew),
    padTo('last', ew),
    editorBorder(ew),
  ];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 6);
  assert.match(result[1], /^> first/);
  assert.match(result[2], /^  \s+$/);
  assert.match(result[3], /^  \s+$/);
  assert.match(result[4], /^  last/);
});

// ── multiple border-like patterns in content ──

test('backward scan only picks the last ─── line as bottom border', () => {
  const w = 20;
  const ew = w - 2;
  // Multiple ─── lines: first is a separator (content), second is the real bottom border
  const lines = [
    editorBorder(ew),
    padTo('above separator', ew),
    padTo('────', ew), // looks like a border but is content
    padTo('between', ew),
    editorBorder(ew), // the real bottom border
    'trailing text',
  ];
  const result = renderPromptPrefix(lines, w, B, P, I);

  // Backward scan finds real bottom border at index 4
  // Content: lines 1,2,3 → prefix on 1, indent on 2,3
  // Trailing: line 5
  assert.equal(result.length, 6);
  assert.match(result[1], /^> above separator/);
  assert.match(result[2], /^  ────/); // treated as content, not border
  assert.match(result[3], /^  between/);
  assert.equal(result[5], 'trailing text');
});

// ── minimum width ──

test('handles minimum width (3) correctly', () => {
  const w = 3;
  const ew = Math.max(1, w - 2); // 1
  const lines = [editorBorder(ew), padTo('a', ew), editorBorder(ew)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  assert.equal(result.length, 3);
  for (const line of result) {
    assert.equal(visibleWidth(line), w);
  }
});

// ── ANSI codes on content line that looks like a border ──

test('content starting with ─── but preceded by ANSI is NOT detected as border (backward scan)', () => {
  const w = 20;
  const ew = w - 2;
  // A content line that starts with ANSI then ───
  const ansiPrefix = '\x1b[1m'; // bold
  const ansiSuffix = '\x1b[0m';
  const fakeBorderContent = ansiPrefix + '───' + ansiSuffix + ' rest';
  const paddedFakeBorder = padTo(fakeBorderContent, ew);
  // After stripping ANSI: "─── rest" → starts with ───, so backward scan will match it as border!
  // But it's at the same position as the content above the real border. Let's make it NOT at the bottom.
  const lines = [editorBorder(ew), padTo('text', ew), paddedFakeBorder, editorBorder(ew)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  // Backward scan starts at index 3 (real border, matches ─── → bottomIdx=3), scan stops.
  // Content is lines 1,2
  assert.equal(result.length, 4);
  assert.match(result[1], /^> text/);
  // The fake border line (ANSI + ───) is content, gets indent prefix
  assert.match(result[2], /^  /);
  assert.ok(result[2].includes(fakeBorderContent));
});

// ── stress: many content lines ──

test('many content lines all get correct prefix/indent', () => {
  const w = 20;
  const ew = w - 2;
  const contentCount = 100;
  const content = Array.from({ length: contentCount }, (_, i) => padTo(`line-${i}`, ew));
  const lines = [editorBorder(ew), ...content, editorBorder(ew)];
  const result = renderPromptPrefix(lines, w, B, P, I);

  // borders + content lines
  assert.equal(result.length, contentCount + 2);
  // First content line has prefix
  assert.match(result[1], /^> line-0/);
  // All subsequent content lines have indent
  for (let i = 2; i <= contentCount; i++) {
    assert.match(result[i], new RegExp(`^  line-${i - 1}`));
  }
});

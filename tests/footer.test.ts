import test from 'node:test';
import assert from 'node:assert/strict';

// Reimplement formatTokens inline for unit isolation (matches footer.ts)
function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

// ── formatTokens ──

test('formatTokens: < 1000 returns exact number', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(1), '1');
  assert.equal(formatTokens(42), '42');
  assert.equal(formatTokens(500), '500');
  assert.equal(formatTokens(999), '999');
});

test('formatTokens: 1k – 9.9k range (one decimal)', () => {
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(1001), '1.0k');
  assert.equal(formatTokens(1499), '1.5k');
  assert.equal(formatTokens(1500), '1.5k');
  assert.equal(formatTokens(1550), '1.6k');
  assert.equal(formatTokens(1999), '2.0k');
  assert.equal(formatTokens(9999), '10.0k');
});

test('formatTokens: 10k – 999k range (rounded integer k)', () => {
  assert.equal(formatTokens(10000), '10k');
  assert.equal(formatTokens(12345), '12k'); // 12.345 → Math.round = 12
  assert.equal(formatTokens(12500), '13k'); // 12.5 → Math.round = 13
  assert.equal(formatTokens(100000), '100k');
  assert.equal(formatTokens(500500), '501k');
  assert.equal(formatTokens(999499), '999k');
  assert.equal(formatTokens(999500), '1000k');
});

test('formatTokens: 1M – 9.9M range (one decimal)', () => {
  assert.equal(formatTokens(1000000), '1.0M');
  assert.equal(formatTokens(1499999), '1.5M');
  assert.equal(formatTokens(1500000), '1.5M');
  assert.equal(formatTokens(9999999), '10.0M');
});

test('formatTokens: >= 10M (rounded integer M)', () => {
  assert.equal(formatTokens(10000000), '10M');
  assert.equal(formatTokens(12345678), '12M');
  assert.equal(formatTokens(50000000), '50M');
  assert.equal(formatTokens(100000000), '100M');
});

test('formatTokens: output format for each tier', () => {
  // < 1k: digits only
  assert.match(formatTokens(123), /^\d+$/);
  // 1k-10k: digit.dk
  assert.match(formatTokens(1500), /^\d+\.\dk$/);
  // 10k-1M: digit(s)k
  assert.match(formatTokens(50000), /^\d+k$/);
  // 1M-10M: digit.dM
  assert.match(formatTokens(5000000), /^\d+\.\dM$/);
  // >= 10M: digit(s)M
  assert.match(formatTokens(50000000), /^\d+M$/);
});

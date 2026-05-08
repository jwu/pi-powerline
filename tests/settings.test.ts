import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPowerlineSettings } from '../settings.ts';

// ── helpers ──

function writeSettingsFile(dir: string, content: unknown): void {
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), JSON.stringify(content));
}

const DEFAULT_SETTINGS = {
  powerline: true,
  breadcrumb: 'inner',
  footer: true,
  header: true,
  'header-info': false,
} as const;

// ── defaults ──

test('empty settings returns defaults', () => {
  const dir = mkdtempSync('pi-settings-test-');

  assert.deepEqual(readPowerlineSettings(dir), DEFAULT_SETTINGS);

  rmSync(dir, { recursive: true, force: true });
});

test('missing .pi/settings.json returns defaults', () => {
  const dir = mkdtempSync('pi-settings-test-');
  // No .pi dir at all
  assert.deepEqual(readPowerlineSettings(dir), DEFAULT_SETTINGS);
  rmSync(dir, { recursive: true, force: true });
});

// ── partial overrides ──

test('partial overrides merge with defaults', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, { powerline: false, breadcrumb: 'top' });

  assert.deepEqual(readPowerlineSettings(dir), {
    ...DEFAULT_SETTINGS,
    powerline: false,
    breadcrumb: 'top',
  });

  rmSync(dir, { recursive: true, force: true });
});

test('all values overridden', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, {
    powerline: false,
    breadcrumb: 'hide',
    footer: false,
    header: false,
    'header-info': true,
  });

  assert.deepEqual(readPowerlineSettings(dir), {
    powerline: false,
    breadcrumb: 'hide',
    footer: false,
    header: false,
    'header-info': true,
  });

  rmSync(dir, { recursive: true, force: true });
});

test('individual boolean fields can be toggled', () => {
  const dir = mkdtempSync('pi-settings-test-');

  writeSettingsFile(dir, { powerline: false });
  assert.deepEqual(readPowerlineSettings(dir).powerline, false);

  writeSettingsFile(dir, { powerline: true });
  assert.deepEqual(readPowerlineSettings(dir).powerline, true);

  writeSettingsFile(dir, { footer: false });
  assert.deepEqual(readPowerlineSettings(dir).footer, false);

  writeSettingsFile(dir, { header: false });
  assert.deepEqual(readPowerlineSettings(dir).header, false);

  writeSettingsFile(dir, { 'header-info': true });
  assert.deepEqual(readPowerlineSettings(dir)['header-info'], true);

  rmSync(dir, { recursive: true, force: true });
});

// ── invalid values → defaults ──

test('invalid breadcrumb falls back to default', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, { breadcrumb: 'outer' });

  assert.deepEqual(readPowerlineSettings(dir), DEFAULT_SETTINGS);

  rmSync(dir, { recursive: true, force: true });
});

test('non-boolean powerline falls back to default', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, { powerline: 'yes' });

  assert.deepEqual(readPowerlineSettings(dir).powerline, true);

  rmSync(dir, { recursive: true, force: true });
});

test('non-boolean footer/header/header-info falls back to default', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, { footer: 1, header: 0, 'header-info': 'yes' });

  assert.deepEqual(readPowerlineSettings(dir).footer, true);
  assert.deepEqual(readPowerlineSettings(dir).header, true);
  assert.deepEqual(readPowerlineSettings(dir)['header-info'], false);

  rmSync(dir, { recursive: true, force: true });
});

// ── corrupted settings ──

test('corrupted JSON returns defaults', () => {
  const dir = mkdtempSync('pi-settings-test-');
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), '{ broken json');

  assert.deepEqual(readPowerlineSettings(dir), DEFAULT_SETTINGS);

  rmSync(dir, { recursive: true, force: true });
});

// ── extra keys preserved ──

test('extra keys in settings.json do not affect powerline settings', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, {
    powerline: false,
    breadcrumb: 'hide',
    model: 'claude-sonnet',
    editor: 'vim',
  });

  assert.deepEqual(readPowerlineSettings(dir), {
    ...DEFAULT_SETTINGS,
    powerline: false,
    breadcrumb: 'hide',
  });

  rmSync(dir, { recursive: true, force: true });
});

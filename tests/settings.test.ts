import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPowerlineSettings, readSettings } from '../extensions/settings.ts';

// ── helpers ──

const originalHome = process.env.HOME;
let testHome: string | undefined;

beforeEach(() => {
  testHome = mkdtempSync('pi-settings-home-');
  process.env.HOME = testHome;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (testHome) rmSync(testHome, { recursive: true, force: true });
  testHome = undefined;
});

function writeSettingsFile(dir: string, content: unknown): void {
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), JSON.stringify(content));
}

const DEFAULT_SETTINGS = {
  powerline: true,
  breadcrumb: 'inner',
  footer: true,
  'footer-mcp': true,
  header: true,
  'header-info': true,
  quietStartup: false,
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
    'footer-mcp': false,
    header: false,
    'header-info': true,
    quietStartup: true,
  });

  assert.deepEqual(readPowerlineSettings(dir), {
    powerline: false,
    breadcrumb: 'hide',
    footer: false,
    'footer-mcp': false,
    header: false,
    'header-info': true,
    quietStartup: true,
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

  writeSettingsFile(dir, { 'footer-mcp': false });
  assert.deepEqual(readPowerlineSettings(dir)['footer-mcp'], false);

  writeSettingsFile(dir, { header: false });
  assert.deepEqual(readPowerlineSettings(dir).header, false);

  writeSettingsFile(dir, { 'header-info': true });
  assert.deepEqual(readPowerlineSettings(dir)['header-info'], true);

  writeSettingsFile(dir, { quietStartup: true });
  assert.deepEqual(readPowerlineSettings(dir).quietStartup, true);

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

test('non-boolean footer/header/header-info/quietStartup falls back to default', () => {
  const dir = mkdtempSync('pi-settings-test-');
  writeSettingsFile(dir, {
    footer: 1,
    'footer-mcp': 1,
    header: 0,
    'header-info': 'yes',
    quietStartup: 'yes',
  });

  assert.deepEqual(readPowerlineSettings(dir).footer, true);
  assert.deepEqual(readPowerlineSettings(dir)['footer-mcp'], true);
  assert.deepEqual(readPowerlineSettings(dir).header, true);
  assert.deepEqual(readPowerlineSettings(dir)['header-info'], true);
  assert.deepEqual(readPowerlineSettings(dir).quietStartup, false);

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

test('readSettings returns merged raw global and project settings', () => {
  const originalHome = process.env.HOME;
  const home = mkdtempSync('pi-settings-home-');
  const dir = mkdtempSync('pi-settings-test-');

  try {
    process.env.HOME = home;
    mkdirSync(join(home, '.pi', 'agent'), { recursive: true });
    writeFileSync(
      join(home, '.pi', 'agent', 'settings.json'),
      JSON.stringify({ theme: 'dark', footer: false, quietStartup: true }),
    );
    writeSettingsFile(dir, { footer: true, header: false });

    assert.deepEqual(readSettings(dir), {
      theme: 'dark',
      footer: true,
      quietStartup: true,
      header: false,
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

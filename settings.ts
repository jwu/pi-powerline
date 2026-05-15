// shared settings read/write helpers for pi-powerline
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type BreadcrumbMode = 'hide' | 'top' | 'inner';

export interface PowerlineSettings {
  powerline: boolean;
  breadcrumb: BreadcrumbMode;
  footer: boolean;
  header: boolean;
  'header-info': boolean;
  quietStartup: boolean;
}

const DEFAULTS: PowerlineSettings = {
  powerline: true,
  breadcrumb: 'inner',
  footer: true,
  header: true,
  'header-info': true,
  quietStartup: false,
};

function getSettingsPath(): string {
  return join(process.env.HOME ?? homedir(), '.pi', 'agent', 'settings.json');
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, '.pi', 'settings.json');
}

function readSettingsFile(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  try {
    const value = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readSettings(cwd: string = process.cwd()): Record<string, unknown> {
  return {
    ...readSettingsFile(getSettingsPath()),
    ...readSettingsFile(getProjectSettingsPath(cwd)),
  };
}

function writeSettings(cwd: string, settings: Record<string, unknown>): void {
  const settingsDir = join(cwd, '.pi');
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
  writeFileSync(getProjectSettingsPath(cwd), JSON.stringify(settings, null, 2) + '\n');
}

/** Read powerline settings, validating and applying defaults. */
export function readPowerlineSettings(cwd: string): PowerlineSettings {
  const s = readSettings(cwd);
  return {
    powerline: typeof s.powerline === 'boolean' ? s.powerline : DEFAULTS.powerline,
    breadcrumb: (['hide', 'top', 'inner'].includes(s.breadcrumb as string)
      ? s.breadcrumb
      : DEFAULTS.breadcrumb) as BreadcrumbMode,
    footer: typeof s.footer === 'boolean' ? s.footer : DEFAULTS.footer,
    header: typeof s.header === 'boolean' ? s.header : DEFAULTS.header,
    'header-info':
      typeof s['header-info'] === 'boolean' ? s['header-info'] : DEFAULTS['header-info'],
    quietStartup: typeof s.quietStartup === 'boolean' ? s.quietStartup : DEFAULTS.quietStartup,
  };
}

/** Write a single powerline setting key, preserving other settings.json keys. */
export function writePowerlineSetting(
  cwd: string,
  key: keyof PowerlineSettings,
  value: string | boolean,
): void {
  const s = readSettings(cwd);
  s[key] = value;
  writeSettings(cwd, s);
}

/** Write multiple powerline settings at once, preserving other keys. */
export function writePowerlineSettings(cwd: string, patch: Partial<PowerlineSettings>): void {
  const s = readSettings(cwd);
  for (const [k, v] of Object.entries(patch)) {
    s[k] = v;
  }
  writeSettings(cwd, s);
}

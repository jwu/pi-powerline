// shared settings read/write helpers for pi-powerline
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type BreadcrumbMode = 'hide' | 'top' | 'inner';

export interface PowerlineSettings {
  powerline: boolean;
  breadcrumb: BreadcrumbMode;
  footer: boolean;
  header: boolean;
  'header-info': boolean;
}

const DEFAULTS: PowerlineSettings = {
  powerline: true,
  breadcrumb: 'inner',
  footer: true,
  header: true,
  'header-info': false,
};

function readSettings(cwd: string): Record<string, unknown> {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(cwd: string, settings: Record<string, unknown>): void {
  const settingsDir = join(cwd, '.pi');
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
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

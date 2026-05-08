/**
 * Custom Header Extension
 *
 * Shows a gradient-colored PI logo.
 * Controlled by .pi/settings.json → header (boolean, default true).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  BeforeAgentStartEvent,
  SessionStartEvent,
  SlashCommandInfo,
  Theme,
} from '@mariozechner/pi-coding-agent';
import { VERSION } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { readPowerlineSettings } from './settings.ts';

/** Left-to-right ANSI gradient coloring. Spaces are left uncolored. */
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

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function visibleLength(line: string): number {
  return line.replace(ANSI_PATTERN, '').length;
}

function centerTruncate(line: string, width: number): string {
  if (width <= 0) return '';

  const length = visibleLength(line);
  if (length <= width) return line;

  const reset = '\x1b[0m';
  const start = Math.floor((length - width) / 2);
  const end = start + width;
  let activeAnsi = '';
  let result = '';
  let visibleIdx = 0;

  for (let i = 0; i < line.length; ) {
    const ansi = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
    if (ansi) {
      const code = ansi[0];
      activeAnsi = code === reset ? '' : code;
      if (visibleIdx >= start && visibleIdx < end) {
        result += code;
      }
      i += code.length;
      continue;
    }

    const char = Array.from(line.slice(i))[0] ?? '';
    if (visibleIdx >= start && visibleIdx < end) {
      if (!result && activeAnsi) result += activeAnsi;
      result += char;
    }
    visibleIdx++;
    i += char.length;
  }

  return result.includes('\x1b[') ? result + reset : result;
}

function centerLine(line: string, width: number): string {
  const centeredLine = centerTruncate(line, width);
  const padding = Math.max(0, Math.floor((width - visibleLength(centeredLine)) / 2));
  return ' '.repeat(padding) + centeredLine;
}

function centerWrappedLines(line: string, width: number): string[] {
  if (width <= 0) return [''];
  return wrapTextWithAnsi(line, width).map((wrappedLine) => centerLine(wrappedLine, width));
}

const PI_LOGO = [
  '██████████    ',
  '████  ████    ',
  '████  ████    ',
  '████████  ████',
  '████      ████',
  '████      ████',
];

function formatReasonStatus(theme: Theme, reason: SessionStartEvent['reason']): string {
  switch (reason) {
    case 'startup':
      return theme.fg('warning', 'Welcome');
    case 'reload':
      return theme.fg('success', 'Reloaded');
    case 'new':
      return theme.fg('success', 'New Session Started');
    default:
      return theme.fg('dim', reason);
  }
}

interface HeaderInfo {
  themeName: string;
  cwd: string;
  commands: string[];
  prompts: string[];
  skills: string[];
  extensions: string[];
  contextItems: string[];
  contextCount: number;
  themesCount: number;
  skillsCount: number;
  promptsCount: number;
  extensionsCount: number;
  commandsCount: number;
}

function renderBullet(theme: Theme, value: string, width: number): string[] {
  if (width <= 0) return [''];

  const bulletWidth = Math.min(4, width);
  const textWidth = Math.max(1, width - bulletWidth);
  const wrapped = wrapTextWithAnsi(theme.fg('muted', value), textWidth);
  const bullet = theme.fg('dim', '  • ');
  const indent = ' '.repeat(bulletWidth);

  return wrapped.map((line, index) => `${index === 0 ? bullet : indent}${line}`);
}

function renderInfoSection(theme: Theme, title: string, items: string[], width: number): string[] {
  if (width <= 0) return [''];

  const values = items.length ? items : ['none'];
  return [
    truncateToWidth(theme.fg('accent', `[${title}]`), width, ''),
    ...values.flatMap((item) => renderBullet(theme, item, width)),
  ];
}

function renderLogo(
  theme: Theme,
  reason: SessionStartEvent['reason'],
  width: number,
  info?: HeaderInfo,
): string[] {
  const logoWidth = Math.max(...PI_LOGO.map((line) => line.length));
  const lines = PI_LOGO.map((line) =>
    centerLine(gradientLine(line.padEnd(logoWidth)) + '\x1b[0m', width),
  );
  const subtitle = `${theme.fg('muted', 'pi agent')}${theme.fg('dim', ` v${VERSION}`)}`;
  const result = [
    '',
    ...lines,
    ...centerWrappedLines(subtitle, width),
    ...centerWrappedLines(formatReasonStatus(theme, reason), width),
  ];

  if (!info) return result;

  const counts = [
    `context: ${info.contextCount}`,
    `themes: ${info.themesCount}`,
    `skills: ${info.skillsCount}`,
    `prompts: ${info.promptsCount}`,
    `extensions: ${info.extensionsCount}`,
    `commands: ${info.commandsCount}`,
  ].join('  ');

  return [
    ...result,
    '',
    ...centerWrappedLines(theme.fg('dim', counts), width),
    '',
    ...renderInfoSection(theme, 'Context', info.contextItems, width),
    '',
    ...renderInfoSection(theme, 'Skills', info.skills, width),
    '',
    ...renderInfoSection(
      theme,
      'Prompts',
      info.prompts.map((name) => `/${name}`),
      width,
    ),
    '',
    ...renderInfoSection(theme, 'Extensions', info.extensions, width),
  ];
}

function getCommandNames(
  commands: SlashCommandInfo[],
  source?: SlashCommandInfo['source'],
): string[] {
  return commands
    .filter((command) => !source || command.source === source)
    .map((command) => command.name)
    .sort((a, b) => a.localeCompare(b));
}

function countUniqueSources(
  commands: SlashCommandInfo[],
  source: SlashCommandInfo['source'],
): number {
  return new Set(
    commands
      .filter((command) => command.source === source)
      .map((command) => command.sourceInfo?.path || command.sourceInfo?.source || command.name),
  ).size;
}

function formatRelativePath(cwd: string, filePath: string): string {
  return relative(cwd, filePath) || '.';
}

function formatDisplayPath(cwd: string, filePath: string): string {
  const home = homedir();
  const rel = relative(cwd, filePath);
  if (!rel || (!rel.startsWith('..') && !rel.startsWith('/'))) return rel || '.';
  if (filePath === home) return '~';
  if (filePath.startsWith(`${home}/`)) return `~/${relative(home, filePath)}`;
  return filePath;
}

function discoverContextItems(cwd: string): string[] {
  const candidates = ['AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'];
  const items: string[] = [];
  const seen = new Set<string>();
  let currentDir = resolve(cwd);
  const root = resolve('/');

  while (true) {
    for (const filename of candidates) {
      const filePath = join(currentDir, filename);
      if (existsSync(filePath) && !seen.has(filePath)) {
        items.unshift(formatRelativePath(cwd, filePath));
        seen.add(filePath);
        break;
      }
    }

    if (currentDir === root) break;
    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const appendSystemPath = join(cwd, '.pi', 'APPEND_SYSTEM.md');
  if (existsSync(appendSystemPath)) items.push(formatRelativePath(cwd, appendSystemPath));
  return items;
}

function normalizeSystemPromptItems(ctx: ExtensionContext, event: BeforeAgentStartEvent): string[] {
  const files = event.systemPromptOptions.contextFiles ?? [];
  const nextItems = files.map((file: { path: string }) => formatRelativePath(ctx.cwd, file.path));
  if (event.systemPromptOptions.customPrompt) nextItems.unshift('custom system prompt');
  if (event.systemPromptOptions.appendSystemPrompt) nextItems.push('append system prompt');
  return nextItems;
}

function getDirectory(path: string): string {
  try {
    return statSync(path).isDirectory() ? path : dirname(path);
  } catch {
    return dirname(path);
  }
}

function readPackageLabel(startPath: string): string | undefined {
  let currentDir = getDirectory(startPath);
  const root = resolve('/');

  while (true) {
    const packagePath = join(currentDir, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf-8')) as {
          name?: string;
          version?: string;
        };
        if (pkg.name) return `${pkg.name}${pkg.version ? ` (v${pkg.version})` : ''}`;
      } catch {
        // ignore invalid package metadata
      }
    }

    if (currentDir === root) break;
    const parentDir = resolve(currentDir, '..');
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return undefined;
}

function getExtensionItems(cwd: string, commands: SlashCommandInfo[]): string[] {
  const extensions = new Map<string, string>();

  for (const command of commands) {
    if (command.source !== 'extension') continue;

    const sourcePath = command.sourceInfo?.baseDir ?? command.sourceInfo?.path;
    const key = sourcePath || command.sourceInfo?.source || command.name;
    const label =
      (sourcePath ? readPackageLabel(sourcePath) : undefined) ??
      (sourcePath ? formatDisplayPath(cwd, sourcePath) : undefined) ??
      command.sourceInfo?.source ??
      command.name;
    extensions.set(key, label);
  }

  return Array.from(extensions.values()).sort((a, b) => a.localeCompare(b));
}

function shouldShowHeaderInfo(ctx: ExtensionContext, reason: SessionStartEvent['reason']): boolean {
  if (reason !== 'startup' && reason !== 'reload') return false;
  return readPowerlineSettings(ctx.cwd)['header-info'];
}

function collectHeaderInfo(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  theme: Theme,
  contextItems: string[],
  skillItems: string[],
): HeaderInfo {
  const commands = typeof pi.getCommands === 'function' ? pi.getCommands() : [];
  const allThemes = typeof ctx.ui.getAllThemes === 'function' ? ctx.ui.getAllThemes() : [];
  const themeName = theme.name ?? ctx.ui.theme?.name ?? 'current';
  const extensions = getExtensionItems(ctx.cwd, commands);

  return {
    themeName,
    cwd: ctx.cwd,
    commands: getCommandNames(commands),
    prompts: getCommandNames(commands, 'prompt'),
    skills: skillItems,
    extensions,
    contextItems,
    contextCount: contextItems.length,
    themesCount: allThemes.length,
    skillsCount: skillItems.length,
    promptsCount: countUniqueSources(commands, 'prompt'),
    extensionsCount: extensions.length,
    commandsCount: commands.length,
  };
}

/** Register the custom header extension. */
export function registerHeader(pi: ExtensionAPI) {
  let headerEnabled = false;
  let currentReason: SessionStartEvent['reason'] = 'startup';
  let liveTui: any = null;
  let contextItems: string[] = [];
  let skillItems: string[] = [];

  function createHeaderComponent(ctx: ExtensionContext, reason: SessionStartEvent['reason']) {
    return (tui: any, theme: Theme) => {
      liveTui = tui;
      return {
        render(width: number): string[] {
          return renderLogo(
            theme,
            reason,
            width,
            shouldShowHeaderInfo(ctx, reason)
              ? collectHeaderInfo(pi, ctx, theme, contextItems, skillItems)
              : undefined,
          );
        },
        invalidate() {},
      };
    };
  }

  function enable(ctx: ExtensionContext, reason = currentReason) {
    headerEnabled = true;
    currentReason = reason;
    ctx.ui.setHeader(createHeaderComponent(ctx, reason));
  }

  function disable(ctx: ExtensionContext) {
    headerEnabled = false;
    liveTui = null;
    ctx.ui.setHeader(undefined);
  }

  // auto-enable on session start if powerline master switch + header setting are both on
  pi.on('session_start', (event, ctx) => {
    if (!ctx.hasUI) return;
    const commands = typeof pi.getCommands === 'function' ? pi.getCommands() : [];
    contextItems = discoverContextItems(ctx.cwd);
    skillItems = getCommandNames(commands, 'skill');
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.header) {
      enable(ctx, event.reason);
    }
  });

  // Refresh with Pi's exact system prompt sources once a prompt is submitted.
  pi.on('before_agent_start', (event, ctx) => {
    const nextItems = normalizeSystemPromptItems(ctx, event);
    const nextSkills = (event.systemPromptOptions.skills ?? [])
      .map((skill) => skill.name)
      .sort((a, b) => a.localeCompare(b));
    if (nextItems.length > 0) contextItems = nextItems;
    skillItems = nextSkills;
    liveTui?.requestRender();
  });

  // re-evaluate on model switch
  pi.on('model_select', (_event, ctx) => {
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(ctx);
    } else if (!show && headerEnabled) {
      disable(ctx);
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(c);
    } else if (!show && headerEnabled) {
      disable(c);
    }
  });
}

# pi-powerline

Powerline-style UI extensions for [pi](https://github.com/badlogic/pi-mono) coding agent: custom editor, breadcrumb widget, footer, and header.

![pi-powerline screenshot](https://github.com/user-attachments/assets/9ee65cd5-8501-4502-ba69-0209b19e0499)

## Features

**Custom editor** — Always-on bordered input area with a `❯` prompt prefix. Switches to bash-mode coloring when the prompt starts with `!`. Breadcrumb info (model → directory) can be embedded in the top border.

**Breadcrumb widget** — Displays current model → working directory above the editor, shown only when breadcrumb mode is `top`.

**Custom footer** — A compact status bar showing token usage (`↑input ↓output` + cache read/write), context usage % with auto-compact indicator, session cost, thinking level, git branch, and extension statuses. Updates in real-time during streaming.

**Custom header** — A gradient-colored PI logo rendered with ANSI 256-color codes, replacing the built-in header.

> Highly inspired by [nicobailon/pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer).

## Installation

### Local development

Clone the repository and use pi's `--extension` flag:

```bash
git clone <repo-url> pi-powerline
cd pi-powerline
pi -e ./index.ts
```

Or add it to your project's `.pi/settings.json`:

```json
{
  "extensions": ["./index.ts"]
}
```

### From npm (after publishing)

```bash
pi install npm:pi-powerline
```

Restart pi to activate.

## Usage

All extensions activate automatically on session start. Each can be configured via the `/powerline` command.

### Settings

Configure in `.pi/settings.json`:

```json
{
  "breadcrumb": "inner",
  "footer": true,
  "header": true
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `breadcrumb` | `"hide"` \| `"top"` \| `"inner"` | `"inner"` | Breadcrumb display mode |
| `footer` | `boolean` | `true` | Enable custom footer |
| `header` | `boolean` | `true` | Enable gradient-logo header |

**Breadcrumb modes:**

- `hide` — No breadcrumb display
- `top` — Breadcrumb as a widget above the editor
- `inner` — Breadcrumb embedded in the editor's top border

### Commands

| Command | Description |
|---------|-------------|
| `/powerline` | Show current powerline settings |
| `/powerline breadcrumb:hide` | Disable breadcrumb |
| `/powerline breadcrumb:top` | Breadcrumb as top widget |
| `/powerline breadcrumb:inner` | Breadcrumb in editor border |
| `/powerline footer:on` | Enable custom footer |
| `/powerline footer:off` | Disable custom footer |
| `/powerline header:on` | Enable custom header |
| `/powerline header:off` | Disable custom header |

### Nerd Fonts

The breadcrumb and footer use Nerd Font icons when a compatible terminal is detected (iTerm, WezTerm, Kitty, Ghostty, Alacritty). Set `POWERLINE_NERD_FONTS=1` or `POWERLINE_NERD_FONTS=0` to explicitly enable/disable.

## Development

### Project structure

```
.
├── index.ts              # Single entry point (default export)
├── editor.ts             # Custom editor with prompt prefix
├── breadcrumb.ts         # Shared breadcrumb data & rendering helpers
├── widget.ts             # Top widget (shown when breadcrumb=top)
├── footer.ts             # Custom footer (token stats, git, thinking level)
├── header.ts             # Gradient-logo header
├── settings.ts           # Shared .pi/settings.json read/write helpers
├── tests/
│   ├── editor.test.ts
│   ├── footer.test.ts
│   ├── header.test.ts
│   └── widget.test.ts
├── .pi/
│   ├── settings.json
│   ├── APPEND_SYSTEM.md
│   └── extensions/
│       └── auto-format.ts  # Auto prettier on edit/write
├── .husky/
│   └── pre-commit          # prettier check + bun test
├── .editorconfig
├── .prettierrc
├── .prettierignore
├── package.json
└── tsconfig.json           # gitignored
```

### Architecture

`index.ts` is the single entry point registered in `package.json` → `"pi": { "extensions": ["./index.ts"] }`. It registers four extensions:

```ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerHeader } from './header.ts';
import { registerWidget } from './widget.ts';

export default function (pi: ExtensionAPI) {
  registerEditor(pi);
  registerFooter(pi);
  registerHeader(pi);
  registerWidget(pi);
}
```

Settings are managed via `settings.ts` — a shared module that reads/writes `.pi/settings.json`. When `/powerline` changes a setting, it emits a `powerline_settings_changed` event that all modules listen to for live reconfiguration.

### Code quality

- **Formatting**: `.pi/extensions/auto-format.ts` runs prettier automatically after edit/write tools touch `.ts` files. Prettier config: single quotes, semicolons, trailing commas, 2-space indent, 100 char width.
- **Pre-commit**: `.husky/pre-commit` runs `prettier --check` + `bun test` before every commit.
- Use `bun run format` to format all files, `bun run format:check` to verify.

### Editor setup

Neovim's tsserver can't resolve `@mariozechner/pi-*` imports because those packages are bundled inside pi, not in `node_modules`. Create a `tsconfig.json` with path mappings pointing to the global pi installation:

```bash
# Find the pi install path
ls -d $(dirname $(which pi))/../lib/node_modules/@mariozechner/pi-coding-agent
```

Then copy the example below and adjust paths to match your system:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@mariozechner/pi-coding-agent": [
        "/path/to/.nvm/versions/node/vXX/lib/node_modules/@mariozechner/pi-coding-agent/dist"
      ],
      "@mariozechner/pi-ai": [
        "/path/to/.nvm/.../pi-coding-agent/node_modules/@mariozechner/pi-ai/dist"
      ],
      "@mariozechner/pi-tui": [
        "/path/to/.nvm/.../pi-coding-agent/node_modules/@mariozechner/pi-tui/dist"
      ]
    }
  },
  "include": ["*.ts", "tests/**/*.ts"]
}
```

`tsconfig.json` is gitignored — each developer creates their own.

### Running tests

```bash
bun test
# or via npm:
npm run test:bun
```

Tests use bun's built-in test runner (compatible with `node:test`). Run `npm run test` for the Node.js variant.

### Testing a single extension

```bash
pi -e ./index.ts
```

Then verify:
- **Header**: startup screen → should show gradient-colored PI logo
- **Editor**: type text → should see `❯` prefix with `─` borders; type `!command` → bash-mode coloring
- **Breadcrumb**: check top border or widget → should show model name and folder
- **Footer**: check bottom bar → should show model, token stats, git branch, thinking level

## License

MIT

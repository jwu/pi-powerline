# pi-powerline

Powerline-style UI extensions for [pi](https://github.com/earendil-works/pi): custom editor, breadcrumb, footer, and header.

Requires pi 0.84.0 or newer and Node.js 22.19.0 or newer.

Highly inspired by [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer).

![screenshot](https://raw.githubusercontent.com/jwu/pi-powerline/refs/heads/main/assets/pi-powerline.png)

## Install

```bash
pi install npm:pi-powerline
```

## Settings

Settings are read from both global and project files. Project settings override global settings.

| Location | Scope |
|----------|-------|
| `~/.pi/agent/settings.json` | Global |
| `.pi/settings.json` | Current project |

```json
// .pi/settings.json
{
  "powerline": true,
  "breadcrumb": "inner",
  "footer": true,
  "footer-mcp": true,
  "header": true,
  "header-info": true
}
```

| Setting | Values | Default | Effect |
|---------|--------|---------|--------|
| `powerline` | `true` / `false` | `true` | Master switch for all pi-powerline UI extensions |
| `breadcrumb` | `"hide"` / `"top"` / `"inner"` | `"inner"` | Breadcrumb placement |
| `footer` | `true` / `false` | `true` | Enable custom footer |
| `footer-mcp` | `true` / `false` | `true` | Fuse the pi-mcp status into the footer stats line |
| `header` | `true` / `false` | `true` | Enable custom gradient-logo header |
| `header-info` | `true` / `false` | `true` | Show header diagnostic info on startup/reload |

### Nerd Font icons

pi-powerline uses Nerd Font icons when it can infer that the terminal supports them.

Detection order:

1. `PI_NERD_FONTS=1` forces icons on
2. `PI_NERD_FONTS=0` forces icons off
3. `GHOSTTY_RESOURCES_DIR` enables icons for Ghostty
4. `TERM_PROGRAM` or `TERM` containing `iterm`, `wezterm`, `kitty`, `ghostty`, or `alacritty` enables icons
5. Otherwise icons are disabled and plain text fallbacks are used

For SSH or terminals that cannot be detected reliably, set it explicitly:

```bash
export PI_NERD_FONTS=1
```

### Footer MCP status

When [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) reports a footer status
(for example `MCP 3/3` with `mcpFooterStatus: "compact"`), pi-powerline moves it from its own
line to the right side of the stats line, left of the thinking level:

```
 ⎇ main  50.0%/200k (auto) ↑1.2k ↓3.4k   →   MCP 3/3 med
```

Set `footer-mcp` to `false` to keep the MCP status on its own footer line. Other extension
statuses (such as `filechanges`) always stay on that line.

### Header info

`header-info` adds diagnostic sections under the header:

- `Context` — loaded system prompt context files, such as `AGENTS.md`, `AGENTS.override.md`, and `.pi/APPEND_SYSTEM.md`
- `Skills` — loaded skills
- `Prompts` — loaded prompt commands
- `Extensions` — loaded extension packages or paths

It is only rendered for `startup` and `reload`, never for new sessions. It also requires Pi's `quietStartup` setting to be `true`:

```json
{
  "quietStartup": true,
  "header-info": true
}
```

## Commands

| Command | Effect |
|---------|--------|
| `/powerline` | Toggle all extensions on/off |
| `/powerline info` | Show current settings |
| `/powerline breadcrumb:top\|inner\|hide` | Set breadcrumb mode |
| `/powerline footer:on\|off` | Toggle footer |
| `/powerline footer-mcp:on\|off` | Toggle MCP status on the stats line |
| `/powerline header:on\|off` | Toggle header |
| `/powerline header-info:on\|off` | Toggle header diagnostic info |

## License

MIT

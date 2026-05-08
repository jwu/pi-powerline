# pi-powerline

Powerline-style UI extensions for [pi](https://github.com/badlogic/pi-mono): custom editor, breadcrumb, footer, and header.

Highly inspired by [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer).

![screenshot](https://raw.githubusercontent.com/jwu/pi-powerline/refs/heads/main/assets/pi-powerline.png)

## Install

```bash
pi install npm:pi-powerline
```

## Settings

```json
// .pi/settings.json
{
  "breadcrumb": "inner",
  "footer": true,
  "header": true,
  "header-info": false
}
```

| Setting | Values | Default |
|---------|--------|---------|
| `powerline` | `true` / `false` | `true` |
| `breadcrumb` | `"hide"` / `"top"` / `"inner"` | `"inner"` |
| `footer` | `true` / `false` | `true` |
| `header` | `true` / `false` | `true` |
| `header-info` | `true` / `false` | `false` |

## Commands

| Command | Effect |
|---------|--------|
| `/powerline` | Toggle all extensions on/off |
| `/powerline info` | Show current settings |
| `/powerline breadcrumb:top\|inner\|hide` | Set breadcrumb mode |
| `/powerline footer:on\|off` | Toggle footer |
| `/powerline header:on\|off` | Toggle header |
| `/powerline header-info:on\|off` | Toggle header diagnostic info |

## License

MIT

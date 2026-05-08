# [0.4.0](https://github.com/jwu/pi-powerline/compare/v0.3.1...v0.4.0) (2026-05-08)


### Bug Fixes

* respect quiet startup for header info ([fb243f5](https://github.com/jwu/pi-powerline/commit/fb243f5502f3a866ba971a243f7236f02a9cd96a))


### Features

* add optional header info ([40a2a29](https://github.com/jwu/pi-powerline/commit/40a2a29d758459962656f098da254939f537b87f))
* center header status ([963e6ef](https://github.com/jwu/pi-powerline/commit/963e6ef0b0fc30fe896d6356734fcd23d1ae4ff5))

## [0.3.1](https://github.com/jwu/pi-powerline/compare/v0.3.0...v0.3.1) (2026-05-06)


### Bug Fixes

* guard prepare script to skip simple-git-hooks outside git repos ([c26bcad](https://github.com/jwu/pi-powerline/commit/c26bcad428ea0a855e9725abb0d269a5f975d09f))

# [0.3.0](https://github.com/jwu/pi-powerline/compare/v0.2.3...v0.3.0) (2026-05-06)


### Bug Fixes

* remove npm provenance (requires CI, not supported with --no-ci) ([d9e9005](https://github.com/jwu/pi-powerline/commit/d9e90055df72e9d3b991ba48ecd2acbbd3af998b))


### Features

* switch from git-cliff to semantic-release, add commitlint, strengthen TUI tests ([4cec86e](https://github.com/jwu/pi-powerline/commit/4cec86e61666436ef1cbc0a1cab3426408a0ce70))

## [0.2.3] - 2026-05-06

### 🐛 Bug Fixes

- Husky command not found when installed as dependency

### 📚 Documentation

- Credit pi-powerline-footer by nicobailon

### ⚙️ Miscellaneous Tasks

- Update changelog
## [0.2.2] - 2026-05-05

### 🐛 Bug Fixes

- Use GitHub raw URL for screenshot in README

### ⚙️ Miscellaneous Tasks

- Add homepage and repository fields to package.json
## [0.2.1] - 2026-05-05

### ⚙️ Miscellaneous Tasks

- Add git-cliff changelog
- Bump version to 0.2.1
## [0.2.0] - 2026-05-05

### 🚀 Features

- Add powerline master switch, simplify README, use local assets

### ⚙️ Miscellaneous Tasks

- Bump version to 0.2.0
## [0.1.0] - 2026-05-03

### 🚀 Features

- Powerline UI extensions with auto-format and pre-commit hooks
- Add /powerline toggle command for editor, footer, header
- Add powerline status widget above editor
- /powerline commands take effect immediately via events bus

### 🐛 Bug Fixes

- EditorTheme type mismatch, add diagnostics checks

### 💼 Other

- Use pi.getThinkingLevel() and pi.on(thinking_level_select) for think level
- Mirror built-in footer layout with full stats, context usage, thinking level
- Drop redundant pwd line (already shown by widget)
- Show only think level on right side, styled like widget
- Add Nerd Font think icon to right side
- Real-time token stats via message_update live usage fusion
- Show (auto) marker when auto-compact is enabled
- Move context usage to front of stats line, preserve per-segment coloring
- Restore original dim-wrapping, keep context-first ordering only
- Remove think level display (now in footer), show only model → folder
- Truncate with ellipsis instead of wrapping to next line
- Drop think: prefix from level label in stats line
- Embed widget info (model + folder) in top border line

### 🚜 Refactor

- Unified settings model with breadcrumb/footer/header config keys
- Extract shared breadcrumb helpers into breadcrumb.ts

### 📚 Documentation

- Update README to reflect current features, settings, and commands

### ⚙️ Miscellaneous Tasks

- Prepare package.json for pi package publishing

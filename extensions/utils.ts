/**
 * Shared utility functions
 *
 * Rendering and font-detection helpers used by breadcrumb, footer, and other extensions.
 */

// ═══════════════════════════════════════════════════════════════════════════
// nerd font detection (cached)
// ═══════════════════════════════════════════════════════════════════════════

let _nerdCache: boolean | null = null;

export function hasNerdFonts(): boolean {
  if (_nerdCache !== null) return _nerdCache;

  if (process.env.PI_NERD_FONTS === '1') return (_nerdCache = true);
  if (process.env.PI_NERD_FONTS === '0') return (_nerdCache = false);
  if (process.env.GHOSTTY_RESOURCES_DIR) return (_nerdCache = true);
  // Herdr's terminal usually renders with a Nerd Font (see config-gpui.toml).
  if (process.env.HERDR_ENV) return (_nerdCache = true);

  const terminal = `${process.env.TERM_PROGRAM || ''} ${process.env.TERM || ''}`.toLowerCase();
  if (
    ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty', 'herdr'].some((t) => terminal.includes(t))
  ) {
    return (_nerdCache = true);
  }

  return (_nerdCache = false);
}

// ═══════════════════════════════════════════════════════════════════════════
// rendering helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Prepend icon with trailing space, or return plain text if icon is empty */
export function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

/** hex → ANSI true color escape (no reset appended) */
export function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

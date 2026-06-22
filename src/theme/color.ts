/**
 * Tiny color math for deriving themed colors at runtime (court tinting, jersey
 * trim contrast). Pure string/number work with NO React Native imports, so the
 * Node-only vitest suite can cover it and any module can import it via
 * `@/theme/color` (not the font-loading `@/theme` barrel). Functions degrade
 * gracefully on malformed input instead of throwing, so bad team data can never
 * crash a render.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Parse "#RGB" or "#RRGGBB" (with or without the leading #). Null if malformed. */
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Serialize back to "#rrggbb" (lowercase), clamping channels to 0..255. */
export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => clampChannel(v).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Linear blend from `from` toward `to` by `t` in [0, 1]. mix(a, b, 0) === a.
 * On a parse failure the readable endpoint wins so callers still get a color.
 */
export function mix(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a && !b) return from;
  if (!a) return to;
  if (!b) return from;
  const k = Math.max(0, Math.min(1, t));
  return toHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
}

/** sRGB relative luminance in [0, 1] (WCAG). Treats bad input as black. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio in [1, 21] between two colors. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick whichever candidate reads best against `bg`: returns the first candidate
 * that clears `minRatio`, otherwise the highest-contrast candidate, otherwise
 * `fallback`. Used to keep court lines visible over a team-tinted floor when a
 * franchise's secondary is nearly the same as the floor color.
 */
export function pickReadable(
  bg: string,
  candidates: string[],
  fallback: string,
  minRatio = 2.2
): string {
  let best: string | null = null;
  let bestRatio = 0;
  for (const c of candidates) {
    const ratio = contrastRatio(bg, c);
    if (ratio >= minRatio) return c;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  // Use the fallback only if it beats the best candidate we found.
  if (best && bestRatio >= contrastRatio(bg, fallback)) return best;
  return fallback;
}

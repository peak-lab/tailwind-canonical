export const TAILWIND_COLORS = new Set([
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'black',
  'white',
  'transparent',
  'current',
  'inherit',
]);

export const COLOR_PROPERTIES = new Set([
  'text',
  'bg',
  'border',
  'ring',
  'ring-offset',
  'divide',
  'outline',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'decoration',
  'accent',
  'caret',
  'shadow',
  'placeholder',
]);

export const COLOR_SHADES = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);

export const COLOR_FAMILIES: Record<string, string> = {
  red: 'red',
  rose: 'red',
  pink: 'red',
  orange: 'orange',
  amber: 'orange',
  yellow: 'yellow',
  lime: 'yellow',
  green: 'green',
  emerald: 'green',
  teal: 'green',
  blue: 'blue',
  sky: 'blue',
  cyan: 'blue',
  indigo: 'blue',
  purple: 'purple',
  violet: 'purple',
  fuchsia: 'purple',
  gray: 'gray',
  slate: 'gray',
  zinc: 'gray',
  neutral: 'gray',
  stone: 'gray',
};

function stripVariants(cls: string): string {
  const idx = cls.lastIndexOf(':');
  return idx === -1 ? cls : cls.slice(idx + 1);
}

/**
 * Parses a color utility class into its property, color name and (optional)
 * numeric shade. Strips leading variants (`hover:` …). Returns `null` when the
 * class is not a color utility (unknown property, arbitrary `[..]` value, or no
 * color segment). A trailing dash-separated numeric segment becomes the shade;
 * otherwise `shade` is `''`. Shared by `typos.ts` and `consistency.ts`.
 */
export function parseColorClass(
  cls: string,
): { property: string; color: string; shade: string } | null {
  const base = stripVariants(cls);
  if (base.includes('[')) return null;

  const dash = base.indexOf('-');
  if (dash === -1) return null;
  const property = base.slice(0, dash);
  if (!COLOR_PROPERTIES.has(property)) return null;

  const rest = base.slice(dash + 1);
  if (rest === '') return null;
  const lastDash = rest.lastIndexOf('-');
  if (lastDash !== -1 && /^\d+$/.test(rest.slice(lastDash + 1))) {
    return {
      property,
      color: rest.slice(0, lastDash),
      shade: rest.slice(lastDash + 1),
    };
  }
  return { property, color: rest, shade: '' };
}

export const SCALE_PROPERTIES = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
  'z',
]);

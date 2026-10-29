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

const COLOR_PROPERTIES = new Set([
  'text',
  'bg',
  'border',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-x',
  'border-y',
  'border-s',
  'border-e',
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
  'text-shadow',
  'inset-shadow',
  'placeholder',
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
  let depth = 0;
  let colon = -1;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === '\\') i++;
    else if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) colon = i;
  }
  return cls.slice(colon + 1);
}

export function splitClassModifiers(cls: string): {
  prefix: string;
  utility: string;
  importantBefore: string;
  importantAfter: string;
} {
  const base = stripVariants(cls);
  const importantBefore = base.startsWith('!') ? '!' : '';
  const importantAfter = base.endsWith('!') ? '!' : '';
  return {
    prefix: cls.slice(0, cls.length - base.length),
    utility: base.slice(
      importantBefore.length,
      base.length - importantAfter.length,
    ),
    importantBefore,
    importantAfter,
  };
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
): { property: string; color: string; shade: string; opacity: string } | null {
  const { utility } = splitClassModifiers(cls);
  const slash = utility.indexOf('/');
  const base = slash === -1 ? utility : utility.slice(0, slash);
  const opacity = slash === -1 ? '' : utility.slice(slash);
  if (base.includes('[') || base.includes('(')) return null;

  const firstDash = base.indexOf('-');
  if (firstDash === -1) return null;
  let property = base.slice(0, firstDash);
  const secondDash = base.indexOf('-', firstDash + 1);
  if (secondDash !== -1) {
    const twoWord = base.slice(0, secondDash);
    if (COLOR_PROPERTIES.has(twoWord)) property = twoWord;
  }
  if (!COLOR_PROPERTIES.has(property)) return null;

  const rest = base.slice(property.length + 1);
  if (rest === '') return null;
  const lastDash = rest.lastIndexOf('-');
  if (lastDash !== -1 && /^\d+$/.test(rest.slice(lastDash + 1))) {
    return {
      property,
      color: rest.slice(0, lastDash),
      shade: rest.slice(lastDash + 1),
      opacity,
    };
  }
  return { property, color: rest, shade: '', opacity };
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

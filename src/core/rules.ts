import type { SortCategory } from './sorter.js';

export type Suggestion = {
  original: string;
  canonical: string;
  isCustomToken: boolean;
};

type AnalyzeConfig = {
  minRareScalePropertyOccurrences?: number;
  rareScaleMaxFiles?: number;
  rareScaleMaxCount?: number;
  maxScaleGroups?: number;
  maxScaleValues?: number;
  maxRareValues?: number;
  maxPatterns?: number;
};

type DefaultCommandConfig = {
  fix?: boolean;
  merge?: boolean;
  dedup?: boolean;
  sort?: boolean;
  check?: boolean;
  analyze?: boolean;
  typos?: boolean;
  watch?: boolean;
  reporter?: 'text' | 'json' | 'sarif';
  targets?: string[];
};

const TEXT_SIZE_MAP: Record<number, string> = {
  12: 'xs',
  14: 'sm',
  16: 'base',
  18: 'lg',
  20: 'xl',
  24: '2xl',
  30: '3xl',
  36: '4xl',
  48: '5xl',
  60: '6xl',
  72: '7xl',
  96: '8xl',
  128: '9xl',
};

const BUILT_IN_TEXT_PX = new Set(Object.keys(TEXT_SIZE_MAP).map(Number));

const ROUNDED_MAP: Record<number, string> = {
  2: 'sm',
  4: 'sm',
  6: 'md',
  8: 'lg',
  12: 'xl',
  16: '2xl',
  24: '3xl',
};

const FRACTION_MAP: Record<string, string> = {
  '50': '1/2',
  '33.333333': '1/3',
  '33.33': '1/3',
  '66.666667': '2/3',
  '66.67': '2/3',
  '25': '1/4',
  '75': '3/4',
  '20': '1/5',
  '40': '2/5',
  '60': '3/5',
  '80': '4/5',
  '16.666667': '1/6',
  '16.67': '1/6',
  '83.333333': '5/6',
  '83.33': '5/6',
  '8.333333': '1/12',
  '8.33': '1/12',
  '91.666667': '11/12',
  '91.67': '11/12',
};

const FRACTION_PREFIXES = [
  'w',
  'h',
  'min-w',
  'max-w',
  'min-h',
  'max-h',
  'inset',
  'top',
  'left',
  'right',
  'bottom',
  'translate-x',
  'translate-y',
];

const SPACING_PREFIXES = [
  'h',
  'w',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'gap-x',
  'gap-y',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'size',
  'min-h',
  'max-h',
  'min-w',
  'max-w',
  'translate-x',
  'translate-y',
  'space-x',
  'space-y',
  'leading',
];

const SPACING_PX_RE = new RegExp(
  `^(${SPACING_PREFIXES.join('|')})-\\[(\\d+)px\\]$`,
);

const SPACING_REM_RE = new RegExp(
  `^(${SPACING_PREFIXES.join('|')})-\\[(\\d+(?:\\.\\d+)?)rem\\]$`,
);

const FRACTION_RE = new RegExp(
  `^(${FRACTION_PREFIXES.join('|')})-\\[(\\d+(?:\\.\\d+)?)%\\]$`,
);

/** Pixel widths shipped by `border`, `divide`, `ring` and `outline` in both majors. */
const WIDTH_SCALE = new Set([0, 1, 2, 4, 8]);

/** Bare form is 1px in both majors. */
const BARE_WIDTH_RE = /^(border(?:-[xytrblse])?|divide-[xy])-\[(\d+)px\]$/;

/** No bare form: `ring` is 3px in v3, `outline` is a style in v3. */
const NUMBERED_WIDTH_RE = /^(ring|outline)-\[(\d+)px\]$/;

const LEADING_KEYWORDS: Record<string, string> = {
  '1': 'none',
  '1.25': 'tight',
  '1.375': 'snug',
  '1.5': 'normal',
  '1.625': 'relaxed',
  '2': 'loose',
};

const FONT_WEIGHT_MAP: Record<number, string> = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'normal',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
};

/**
 * Unitless integer utilities. v4 derives each from the bare number, so any
 * integer at or above `min` works; v3 only ships the listed steps.
 */
const INTEGER_SCALES: Record<string, { min: number; v3: Set<number> }> = {
  z: { min: 0, v3: new Set([0, 10, 20, 30, 40, 50]) },
  order: { min: 1, v3: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
  'line-clamp': { min: 1, v3: new Set([1, 2, 3, 4, 5, 6]) },
  columns: { min: 1, v3: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
};

const INTEGER_SCALE_RE = new RegExp(
  `^(${Object.keys(INTEGER_SCALES).join('|')})-\\[(\\d+)\\]$`,
);

/** Leading steps v3 ships; v4 derives any integer from the spacing scale. */
const V3_LEADING_STEPS = new Set([3, 4, 5, 6, 7, 8, 9, 10]);

const OPACITY_SCALE = new Set([
  0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100,
]);

/**
 * Numeric spacing steps the ÷4 rule may emit that Tailwind v3 actually ships.
 * v4 derives every step from `calc(var(--spacing) * n)`, so any integer works
 * there; v3 ships a discrete scale and a class outside it generates no CSS.
 * The ÷4 rule only ever yields integers, so v3's half steps are unreachable
 * and absent here. Measured by compiling tailwindcss@3.3.7.
 */
const V3_SPACING_STEPS = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44,
  48, 52, 56, 60, 64, 72, 80, 96,
]);

/** No numeric spacing scale at all in v3.3, the documented floor. */
const V3_UNSCALED_SPACING_PREFIXES = new Set(['size']);

/** Only the zero step exists in v3.3; the scale itself arrived after 3.3. */
const V3_ZERO_ONLY_SPACING_PREFIXES = new Set(['min-w', 'max-w', 'min-h']);

const V3_INSET_FRACTIONS = ['1/2', '1/3', '2/3', '1/4', '3/4'];
const V3_HEIGHT_FRACTIONS = [
  ...V3_INSET_FRACTIONS,
  '1/5',
  '2/5',
  '3/5',
  '4/5',
  '1/6',
  '5/6',
];

/**
 * Fractions each utility ships in v3.3 — the scale differs per utility, not
 * just per family, so this is keyed on both. A prefix absent from this table
 * has no fraction scale at all (`min-w`, `max-w`, `min-h`, `max-h`).
 */
const V3_FRACTIONS_BY_PREFIX: Record<string, Set<string>> = {
  w: new Set([...V3_HEIGHT_FRACTIONS, '1/12', '11/12']),
  h: new Set(V3_HEIGHT_FRACTIONS),
  inset: new Set(V3_INSET_FRACTIONS),
  top: new Set(V3_INSET_FRACTIONS),
  left: new Set(V3_INSET_FRACTIONS),
  right: new Set(V3_INSET_FRACTIONS),
  bottom: new Set(V3_INSET_FRACTIONS),
  'translate-x': new Set(V3_INSET_FRACTIONS),
  'translate-y': new Set(V3_INSET_FRACTIONS),
};

/** Discrete v3 scales; v4 accepts any integer for these utilities. */
const V3_TIME_STEPS = new Set([0, 75, 100, 150, 200, 300, 500, 700, 1000]);
const V3_SCALE_STEPS = new Set([0, 50, 75, 90, 95, 100, 105, 110, 125, 150]);
const V3_ROTATE_STEPS = new Set([0, 1, 2, 3, 6, 12, 45, 90, 180]);

/** px → blur suffix; `''` is the bare `blur` class. */
const BLUR_MAP_V4: Record<number, string> = {
  4: '-xs',
  8: '-sm',
  12: '-md',
  16: '-lg',
  24: '-xl',
  40: '-2xl',
  64: '-3xl',
};
const BLUR_MAP_V3: Record<number, string> = {
  4: '-sm',
  8: '',
  12: '-md',
  16: '-lg',
  24: '-xl',
  40: '-2xl',
  64: '-3xl',
};

export type Config = {
  customTextTokens?: Record<number, string>;
  customSpacingTokens?: Record<number, string>;
  ignorePatterns?: RegExp[];
  functionNames?: string[];
  attributeNames?: string[];
  sortOrder?: SortCategory[];
  extraColorFamilies?: Record<string, string>;
  extraScaleProperties?: string[];
  extraColors?: string[];
  analyze?: AnalyzeConfig;
  minRareScalePropertyOccurrences?: number;
  rareScaleMaxFiles?: number;
  rareScaleMaxCount?: number;
  defaultCommand?: DefaultCommandConfig;
  /** Target Tailwind major. v3 restricts suggestions to its discrete scale. */
  tailwindVersion?: 3 | 4;
};

function remToPx(rem: number): number | null {
  const px = rem * 16;
  return Number.isInteger(px) ? px : null;
}

function isIgnored(cls: string, patterns?: RegExp[]): boolean {
  if (!patterns) return false;
  return patterns.some((re) => {
    re.lastIndex = 0;
    return re.test(cls);
  });
}

/** `value × factor` when it lands on an integer, else null (float-safe). */
function toInteger(value: number, factor: number): number | null {
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) <= 1e-9 ? rounded : null;
}

function scaleStepSuggestion(
  cls: string,
  prefix: string,
  step: number | null,
  v3Steps: Set<number> | null,
): Suggestion | null {
  if (step === null || (v3Steps && !v3Steps.has(step))) return null;
  return {
    original: cls,
    canonical: `${prefix}-${step}`,
    isCustomToken: false,
  };
}

/** True when the ÷4 result would be a class v3 never generates. */
function isMissingInV3(prefix: string, step: number): boolean {
  if (prefix === 'leading') return !V3_LEADING_STEPS.has(step);
  if (V3_UNSCALED_SPACING_PREFIXES.has(prefix)) return true;
  if (V3_ZERO_ONLY_SPACING_PREFIXES.has(prefix)) return step !== 0;
  return !V3_SPACING_STEPS.has(step);
}

function textSuggestion(
  cls: string,
  px: number,
  textTokens: Record<number, string>,
): Suggestion | null {
  const token = textTokens[px];
  if (!token) return null;
  return {
    original: cls,
    canonical: `text-${token}`,
    isCustomToken: !BUILT_IN_TEXT_PX.has(px),
  };
}

function spacingSuggestion(
  cls: string,
  prefix: string,
  px: number,
  spacingTokens: Record<number, string>,
  v3: boolean,
): Suggestion | null {
  if (spacingTokens[px]) {
    return {
      original: cls,
      canonical: `${prefix}-${spacingTokens[px]}`,
      isCustomToken: true,
    };
  }
  if (px === 1) {
    if (
      v3 &&
      (V3_UNSCALED_SPACING_PREFIXES.has(prefix) ||
        V3_ZERO_ONLY_SPACING_PREFIXES.has(prefix))
    ) {
      return null;
    }
    return { original: cls, canonical: `${prefix}-px`, isCustomToken: false };
  }
  if (px % 4 !== 0) return null;
  if (v3 && isMissingInV3(prefix, px / 4)) return null;
  return {
    original: cls,
    canonical: `${prefix}-${px / 4}`,
    isCustomToken: false,
  };
}

/** Utilities whose arbitrary value may be negated (`-mt-2`, `-translate-x-1/2`). */
const NEGATABLE_PREFIXES = [
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'inset',
  'top',
  'left',
  'right',
  'bottom',
  'translate-x',
  'translate-y',
  'space-x',
  'space-y',
  'scale',
  'scale-x',
  'scale-y',
  'rotate',
  'z',
  'order',
];

type ParsedClass = {
  variants: string;
  leadingImportant: boolean;
  trailingImportant: boolean;
  negative: boolean;
  utility: string;
};

/** Index just past the last top-level `:` — brackets/parens may hold colons. */
function variantsEnd(cls: string): number {
  let depth = 0;
  let end = 0;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === '[' || ch === '(') depth++;
    else if ((ch === ']' || ch === ')') && depth > 0) depth--;
    else if (ch === ':' && depth === 0) end = i + 1;
  }
  return end;
}

function parseClass(cls: string): ParsedClass {
  const end = variantsEnd(cls);
  let utility = cls.slice(end);
  const leadingImportant = utility.startsWith('!');
  if (leadingImportant) utility = utility.slice(1);
  const trailingImportant = !leadingImportant && utility.endsWith('!');
  if (trailingImportant) utility = utility.slice(0, -1);
  let negative = utility.startsWith('-');
  if (negative) utility = utility.slice(1);
  const innerNegative = utility.match(/^([a-z-]+)-\[-([^\]]+)\]$/);
  if (innerNegative) {
    negative = !negative;
    utility = `${innerNegative[1]}-[${innerNegative[2]}]`;
  }
  return {
    variants: cls.slice(0, end),
    leadingImportant,
    trailingImportant,
    negative,
    utility,
  };
}

/**
 * Suggests the canonical form of a class, preserving its variants
 * (`hover:`, `md:`, `[&:hover]:`), important modifier (`!p-4` / `p-4!`)
 * and sign (`-mt-[8px]` / `mt-[-8px]` → `-mt-2`).
 */
export function suggestCanonical(
  cls: string,
  config: Config = {},
): Suggestion | null {
  if (isIgnored(cls, config.ignorePatterns)) return null;

  const parsed = parseClass(cls);
  if (
    parsed.utility !== cls &&
    isIgnored(parsed.utility, config.ignorePatterns)
  )
    return null;

  const base = suggestUtility(parsed.utility, config);
  if (!base) return null;
  if (
    parsed.negative &&
    !NEGATABLE_PREFIXES.some((p) => parsed.utility.startsWith(`${p}-[`))
  ) {
    return null;
  }

  const sign = parsed.negative && !/-(0|none)$/.test(base.canonical) ? '-' : '';
  return {
    original: cls,
    canonical: `${parsed.variants}${parsed.leadingImportant ? '!' : ''}${sign}${base.canonical}${parsed.trailingImportant ? '!' : ''}`,
    isCustomToken: base.isCustomToken,
  };
}

function suggestUtility(cls: string, config: Config): Suggestion | null {
  const textTokens = { ...TEXT_SIZE_MAP, ...config.customTextTokens };
  const spacingTokens = config.customSpacingTokens ?? {};
  const v3 = config.tailwindVersion === 3;

  // text-[Npx]
  const textPxMatch = cls.match(/^text-\[(\d+)px\]$/);
  if (textPxMatch) {
    return textSuggestion(cls, parseInt(textPxMatch[1], 10), textTokens);
  }

  // text-[N.Nrem]
  const textRemMatch = cls.match(/^text-\[(\d+(?:\.\d+)?)rem\]$/);
  if (textRemMatch) {
    const px = remToPx(parseFloat(textRemMatch[1]));
    return px === null ? null : textSuggestion(cls, px, textTokens);
  }

  // spacing-[Npx]
  const spacingPxMatch = cls.match(SPACING_PX_RE);
  if (spacingPxMatch) {
    const px = parseInt(spacingPxMatch[2], 10);
    return spacingSuggestion(cls, spacingPxMatch[1], px, spacingTokens, v3);
  }

  // spacing-[N.Nrem]
  const spacingRemMatch = cls.match(SPACING_REM_RE);
  if (spacingRemMatch) {
    const px = remToPx(parseFloat(spacingRemMatch[2]));
    if (px === null) return null;
    return spacingSuggestion(cls, spacingRemMatch[1], px, spacingTokens, v3);
  }

  // w/h/inset/etc-[N.N%]
  const fractionMatch = cls.match(FRACTION_RE);
  if (fractionMatch) {
    const prefix = fractionMatch[1];
    const pct = fractionMatch[2];
    const fraction = FRACTION_MAP[pct];
    if (!fraction) return null;
    if (v3 && !V3_FRACTIONS_BY_PREFIX[prefix]?.has(fraction)) return null;
    return {
      original: cls,
      canonical: `${prefix}-${fraction}`,
      isCustomToken: false,
    };
  }

  // leading-[1.5] → leading-normal
  const leadingUnitlessMatch = cls.match(/^leading-\[(\d+(?:\.\d+)?|\.\d+)\]$/);
  if (leadingUnitlessMatch) {
    const keyword =
      LEADING_KEYWORDS[String(parseFloat(leadingUnitlessMatch[1]))];
    if (!keyword) return null;
    return {
      original: cls,
      canonical: `leading-${keyword}`,
      isCustomToken: false,
    };
  }

  // font-[700] → font-bold
  const fontWeightMatch = cls.match(/^font-\[(\d+)\]$/);
  if (fontWeightMatch) {
    const weight = FONT_WEIGHT_MAP[parseInt(fontWeightMatch[1], 10)];
    if (!weight) return null;
    return { original: cls, canonical: `font-${weight}`, isCustomToken: false };
  }

  // z/order/line-clamp/columns-[N]
  const integerMatch = cls.match(INTEGER_SCALE_RE);
  if (integerMatch) {
    const prefix = integerMatch[1];
    const value = parseInt(integerMatch[2], 10);
    if (prefix === 'order' && value === 0) {
      return { original: cls, canonical: 'order-none', isCustomToken: false };
    }
    const scale = INTEGER_SCALES[prefix];
    if (value < scale.min) return null;
    if (v3 && !scale.v3.has(value)) return null;
    return {
      original: cls,
      canonical: `${prefix}-${value}`,
      isCustomToken: false,
    };
  }

  // grow-[N] / shrink-[N]
  const flexFactorMatch = cls.match(/^(grow|shrink)-\[(\d+)\]$/);
  if (flexFactorMatch) {
    const prefix = flexFactorMatch[1];
    const value = parseInt(flexFactorMatch[2], 10);
    if (value > 1 && v3) return null;
    return {
      original: cls,
      canonical: value === 1 ? prefix : `${prefix}-${value}`,
      isCustomToken: false,
    };
  }

  // opacity-[N.N], opacity-[0.N] or opacity-[.N]
  const opacityMatch = cls.match(/^opacity-\[(\d+(?:\.\d+)?|\.\d+)\]$/);
  if (opacityMatch) {
    const raw = parseFloat(opacityMatch[1]);
    // CSS opacity is a 0..1 fraction; a bare value > 1 clamps to 1 and is not
    // equivalent to opacity-<N> (a percentage), so leave it untouched.
    if (raw > 1) return null;
    const scaled = raw * 100;
    const value = Math.round(scaled);
    if (
      !(
        OPACITY_SCALE.has(value) &&
        Math.abs(scaled - value) <= Number.EPSILON * 100
      )
    ) {
      return null;
    }
    return {
      original: cls,
      canonical: `opacity-${value}`,
      isCustomToken: false,
    };
  }

  // border/divide-[Npx]
  const bareWidthMatch = cls.match(BARE_WIDTH_RE);
  if (bareWidthMatch) {
    const px = parseInt(bareWidthMatch[2], 10);
    if (!WIDTH_SCALE.has(px)) return null;
    return {
      original: cls,
      canonical: px === 1 ? bareWidthMatch[1] : `${bareWidthMatch[1]}-${px}`,
      isCustomToken: false,
    };
  }

  // ring/outline-[Npx]
  const numberedWidthMatch = cls.match(NUMBERED_WIDTH_RE);
  if (numberedWidthMatch) {
    const px = parseInt(numberedWidthMatch[2], 10);
    if (!WIDTH_SCALE.has(px)) return null;
    return {
      original: cls,
      canonical: `${numberedWidthMatch[1]}-${px}`,
      isCustomToken: false,
    };
  }

  // rounded-[Npx]
  const roundedMatch = cls.match(/^(rounded|rounded-[a-z]+)-\[(\d+)px\]$/);
  if (roundedMatch) {
    const prefix = roundedMatch[1];
    const px = parseInt(roundedMatch[2], 10);
    const token = ROUNDED_MAP[px];
    if (!token) return null;
    return {
      original: cls,
      canonical: `${prefix}-${token}`,
      isCustomToken: false,
    };
  }

  // duration-[200ms] / delay-[0.2s]
  const timeMatch = cls.match(/^(duration|delay)-\[(\d+(?:\.\d+)?)(ms|s)\]$/);
  if (timeMatch) {
    const ms = toInteger(
      parseFloat(timeMatch[2]),
      timeMatch[3] === 's' ? 1000 : 1,
    );
    return scaleStepSuggestion(
      cls,
      timeMatch[1],
      ms,
      v3 ? V3_TIME_STEPS : null,
    );
  }

  // scale-[1.05] / scale-x-[105%]
  const scaleMatch = cls.match(/^(scale(?:-[xy])?)-\[(\d+(?:\.\d+)?)(%?)\]$/);
  if (scaleMatch) {
    const pct = toInteger(parseFloat(scaleMatch[2]), scaleMatch[3] ? 1 : 100);
    return scaleStepSuggestion(
      cls,
      scaleMatch[1],
      pct,
      v3 ? V3_SCALE_STEPS : null,
    );
  }

  // rotate-[45deg]
  const rotateMatch = cls.match(/^rotate-\[(\d+(?:\.\d+)?)deg\]$/);
  if (rotateMatch) {
    const deg = toInteger(parseFloat(rotateMatch[1]), 1);
    return scaleStepSuggestion(cls, 'rotate', deg, v3 ? V3_ROTATE_STEPS : null);
  }

  // blur-[8px] / blur-[0.5rem]
  const blurMatch = cls.match(/^blur-\[(\d+(?:\.\d+)?)(px|rem)\]$/);
  if (blurMatch) {
    const raw = parseFloat(blurMatch[1]);
    const px = blurMatch[2] === 'rem' ? remToPx(raw) : toInteger(raw, 1);
    if (px === null) return null;
    const suffix = (v3 ? BLUR_MAP_V3 : BLUR_MAP_V4)[px];
    if (suffix === undefined) return null;
    return { original: cls, canonical: `blur${suffix}`, isCustomToken: false };
  }

  return null;
}

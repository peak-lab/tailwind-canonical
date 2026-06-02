import type { SortCategory } from './sorter.js';

export type Suggestion = {
  original: string;
  canonical: string;
  isCustomToken: boolean;
};

const TEXT_SIZE_MAP: Record<number, string> = {
  8: '3xs',
  9: '3xs',
  10: '3xs',
  11: '2xs',
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
};

const BUILT_IN_TEXT_PX = new Set([12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72]);

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
];

const SPACING_PX_RE = new RegExp(
  `^(${SPACING_PREFIXES.join('|')})-\\[(\\d+)px\\]$`,
);

const SPACING_REM_RE = new RegExp(
  `^(${SPACING_PREFIXES.join('|')})-\\[(\\d+(?:\\.\\d+)?)rem\\]$`,
);

const OPACITY_SCALE = new Set([
  0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100,
]);

export type Config = {
  customTextTokens?: Record<number, string>;
  customSpacingTokens?: Record<number, string>;
  ignorePatterns?: RegExp[];
  functionNames?: string[];
  attributeNames?: string[];
  sortOrder?: SortCategory[];
};

function remToPx(rem: number): number {
  return Math.round(rem * 16);
}

export function suggestCanonical(
  cls: string,
  config: Config = {},
): Suggestion | null {
  const textTokens = { ...TEXT_SIZE_MAP, ...config.customTextTokens };
  const spacingTokens = config.customSpacingTokens ?? {};

  // text-[Npx]
  const textPxMatch = cls.match(/^text-\[(\d+)px\]$/);
  if (textPxMatch) {
    const px = parseInt(textPxMatch[1], 10);
    const token = textTokens[px];
    if (!token) return null;
    return {
      original: cls,
      canonical: `text-${token}`,
      isCustomToken: !BUILT_IN_TEXT_PX.has(px),
    };
  }

  // text-[N.Nrem]
  const textRemMatch = cls.match(/^text-\[(\d+(?:\.\d+)?)rem\]$/);
  if (textRemMatch) {
    const px = remToPx(parseFloat(textRemMatch[1]));
    const token = textTokens[px];
    if (!token) return null;
    return {
      original: cls,
      canonical: `text-${token}`,
      isCustomToken: !BUILT_IN_TEXT_PX.has(px),
    };
  }

  // spacing-[Npx]
  const spacingPxMatch = cls.match(SPACING_PX_RE);
  if (spacingPxMatch) {
    const prefix = spacingPxMatch[1];
    const px = parseInt(spacingPxMatch[2], 10);
    if (spacingTokens[px]) {
      return {
        original: cls,
        canonical: `${prefix}-${spacingTokens[px]}`,
        isCustomToken: true,
      };
    }
    if (px % 4 === 0) {
      return {
        original: cls,
        canonical: `${prefix}-${px / 4}`,
        isCustomToken: false,
      };
    }
    return null;
  }

  // spacing-[N.Nrem]
  const spacingRemMatch = cls.match(SPACING_REM_RE);
  if (spacingRemMatch) {
    const prefix = spacingRemMatch[1];
    const px = remToPx(parseFloat(spacingRemMatch[2]));
    if (spacingTokens[px]) {
      return {
        original: cls,
        canonical: `${prefix}-${spacingTokens[px]}`,
        isCustomToken: true,
      };
    }
    if (px % 4 === 0) {
      return {
        original: cls,
        canonical: `${prefix}-${px / 4}`,
        isCustomToken: false,
      };
    }
    return null;
  }

  // w/h/inset/etc-[N.N%]
  const fractionPrefixPattern = FRACTION_PREFIXES.join('|');
  const fractionMatch = cls.match(
    new RegExp(`^(${fractionPrefixPattern})-\\[([\\d.]+)%\\]$`),
  );
  if (fractionMatch) {
    const prefix = fractionMatch[1];
    const pct = fractionMatch[2];
    const fraction = FRACTION_MAP[pct];
    if (!fraction) return null;
    return {
      original: cls,
      canonical: `${prefix}-${fraction}`,
      isCustomToken: false,
    };
  }

  // opacity-[N.N] or opacity-[0.N]
  const opacityMatch = cls.match(/^opacity-\[(\d+(?:\.\d+)?)\]$/);
  if (opacityMatch) {
    const raw = parseFloat(opacityMatch[1]);
    const value = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
    if (!OPACITY_SCALE.has(value)) return null;
    return {
      original: cls,
      canonical: `opacity-${value}`,
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

  return null;
}

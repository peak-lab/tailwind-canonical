import { readFileSync } from 'node:fs';
import {
  type ClassStringOpts,
  extractClassStrings,
  SINGLE_CLASS_REGEX,
} from './class-strings.js';
import type { Config } from './rules.js';

export type FileClasses = { file: string; classes: string[] };

export type ColorVariant = { token: string; count: number; files: string[] };

export type ColorVariantGroup = {
  property: string;
  family: string;
  variants: ColorVariant[];
};

export type ScaleValue = { value: string; count: number; files: string[] };

export type ScaleInconsistency = {
  property: string;
  values: ScaleValue[];
};

export type ClassCombination = {
  classes: string[];
  count: number;
  files: string[];
};

export type ConsistencyReport = {
  filesAnalyzed: number;
  colorVariants: ColorVariantGroup[];
  scaleInconsistencies: ScaleInconsistency[];
  combinations: ClassCombination[];
};

export type ConsistencyOptions = {
  minCombinationSize?: number;
  minCombinationFiles?: number;
  maxCombinations?: number;
  minScaleOccurrences?: number;
};

const COLOR_PROPERTIES = new Set([
  'text',
  'bg',
  'border',
  'ring',
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

const COLOR_FAMILIES: Record<string, string> = {
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

const SCALE_PROPERTIES = new Set([
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

function stripVariants(cls: string): string {
  const idx = cls.lastIndexOf(':');
  return idx === -1 ? cls : cls.slice(idx + 1);
}

function parseColor(
  cls: string,
): { property: string; family: string; token: string } | null {
  const base = stripVariants(cls);
  const dash = base.indexOf('-');
  if (dash === -1) return null;
  const property = base.slice(0, dash);
  if (!COLOR_PROPERTIES.has(property)) return null;
  const rest = base.slice(dash + 1);
  const restDash = rest.indexOf('-');
  if (restDash === -1) return null;
  const color = rest.slice(0, restDash);
  const shade = rest.slice(restDash + 1);
  const family = COLOR_FAMILIES[color];
  if (!(family && /^\d+$/.test(shade))) return null;
  return { property, family, token: `${color}-${shade}` };
}

function parseScale(cls: string): { property: string; value: string } | null {
  const base = stripVariants(cls);
  const negative = base.startsWith('-');
  const body = negative ? base.slice(1) : base;
  const dash = body.lastIndexOf('-');
  if (dash === -1) return null;
  const property = body.slice(0, dash);
  if (!SCALE_PROPERTIES.has(property)) return null;
  const value = body.slice(dash + 1);
  if (!value) return null;
  return { property, value: negative ? `-${value}` : value };
}

function addUsage(
  map: Map<string, { count: number; files: Set<string> }>,
  key: string,
  file: string,
): void {
  let entry = map.get(key);
  if (!entry) {
    entry = { count: 0, files: new Set() };
    map.set(key, entry);
  }
  entry.count++;
  entry.files.add(file);
}

function detectColorVariants(input: FileClasses[]): ColorVariantGroup[] {
  const groups = new Map<
    string,
    {
      property: string;
      family: string;
      tokens: Map<string, { count: number; files: Set<string> }>;
    }
  >();

  for (const { file, classes } of input) {
    for (const cls of classes) {
      const parsed = parseColor(cls);
      if (!parsed) continue;
      const groupKey = `${parsed.property}|${parsed.family}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          property: parsed.property,
          family: parsed.family,
          tokens: new Map(),
        };
        groups.set(groupKey, group);
      }
      addUsage(group.tokens, parsed.token, file);
    }
  }

  const result: ColorVariantGroup[] = [];
  for (const group of groups.values()) {
    if (group.tokens.size < 2) continue;
    const variants = [...group.tokens.entries()]
      .map(([token, usage]) => ({
        token,
        count: usage.count,
        files: [...usage.files].sort(),
      }))
      .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
    result.push({
      property: group.property,
      family: group.family,
      variants,
    });
  }

  return result.sort(
    (a, b) =>
      a.property.localeCompare(b.property) || a.family.localeCompare(b.family),
  );
}

function detectScaleInconsistencies(
  input: FileClasses[],
  minOccurrences: number,
): ScaleInconsistency[] {
  const props = new Map<
    string,
    Map<string, { count: number; files: Set<string> }>
  >();

  for (const { file, classes } of input) {
    for (const cls of classes) {
      const parsed = parseScale(cls);
      if (!parsed) continue;
      let values = props.get(parsed.property);
      if (!values) {
        values = new Map();
        props.set(parsed.property, values);
      }
      addUsage(values, parsed.value, file);
    }
  }

  const result: ScaleInconsistency[] = [];
  for (const [property, values] of props) {
    if (values.size < 2) continue;
    const total = [...values.values()].reduce((s, v) => s + v.count, 0);
    if (total < minOccurrences) continue;
    const sorted = [...values.entries()]
      .map(([value, usage]) => ({
        value,
        count: usage.count,
        files: [...usage.files].sort(),
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    result.push({ property, values: sorted });
  }

  return result.sort((a, b) => a.property.localeCompare(b.property));
}

function detectCombinations(
  input: FileClasses[],
  minSize: number,
  minFiles: number,
  max: number,
): ClassCombination[] {
  const combos = new Map<
    string,
    { classes: string[]; count: number; files: Set<string> }
  >();

  for (const { file, classes } of input) {
    if (classes.length < minSize) continue;
    const unique = [...new Set(classes)].sort();
    if (unique.length < minSize) continue;
    const key = unique.join(' ');
    let entry = combos.get(key);
    if (!entry) {
      entry = { classes: unique, count: 0, files: new Set() };
      combos.set(key, entry);
    }
    entry.count++;
    entry.files.add(file);
  }

  return [...combos.values()]
    .filter((c) => c.files.size >= minFiles)
    .map((c) => ({
      classes: c.classes,
      count: c.count,
      files: [...c.files].sort(),
    }))
    .sort(
      (a, b) =>
        b.files.length - a.files.length ||
        b.count - a.count ||
        a.classes.join(' ').localeCompare(b.classes.join(' ')),
    )
    .slice(0, max);
}

export function analyzeConsistency(
  input: FileClasses[],
  options: ConsistencyOptions = {},
): ConsistencyReport {
  const minCombinationSize = options.minCombinationSize ?? 2;
  const minCombinationFiles = options.minCombinationFiles ?? 3;
  const maxCombinations = options.maxCombinations ?? 20;
  const minScaleOccurrences = options.minScaleOccurrences ?? 3;

  return {
    filesAnalyzed: input.length,
    colorVariants: detectColorVariants(input),
    scaleInconsistencies: detectScaleInconsistencies(
      input,
      minScaleOccurrences,
    ),
    combinations: detectCombinations(
      input,
      minCombinationSize,
      minCombinationFiles,
      maxCombinations,
    ),
  };
}

export function collectClasses(
  content: string,
  opts: ClassStringOpts = {},
): string[] {
  const classes: string[] = [];
  for (const { value } of extractClassStrings(content, opts)) {
    for (const match of value.matchAll(SINGLE_CLASS_REGEX)) {
      classes.push(match[0]);
    }
  }
  return classes;
}

export function analyzeConsistencyFiles(
  filePaths: string[],
  config: Config = {},
  options: ConsistencyOptions = {},
): ConsistencyReport {
  const opts: ClassStringOpts = {
    functionNames: config.functionNames,
    attributeNames: config.attributeNames,
  };
  const input: FileClasses[] = filePaths.map((file) => ({
    file,
    classes: collectClasses(readFileSync(file, 'utf8'), opts),
  }));
  return analyzeConsistency(input, options);
}

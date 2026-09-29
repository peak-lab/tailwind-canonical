import type { Config } from './rules.js';
import { DEFAULT_SORT_ORDER } from './sorter.js';

const CONFIG_FILENAME = 'tailwind-canonical.config.ts';
export const CONFIG_FILENAMES = [
  CONFIG_FILENAME,
  'tailwind-canonical.config.mts',
  'tailwind-canonical.config.js',
  'tailwind-canonical.config.mjs',
] as const;

const KNOWN_KEYS = [
  'customTextTokens',
  'customSpacingTokens',
  'ignorePatterns',
  'functionNames',
  'attributeNames',
  'sortOrder',
  'extraColorFamilies',
  'extraScaleProperties',
  'extraColors',
  'analyze',
  'minRareScalePropertyOccurrences',
  'rareScaleMaxFiles',
  'rareScaleMaxCount',
  'defaultCommand',
  'tailwindVersion',
] as const;

const ANALYZE_KEYS = [
  'minRareScalePropertyOccurrences',
  'rareScaleMaxFiles',
  'rareScaleMaxCount',
  'maxScaleGroups',
  'maxScaleValues',
  'maxRareValues',
  'maxPatterns',
] as const;

const DEFAULT_COMMAND_BOOLEAN_KEYS = [
  'fix',
  'merge',
  'dedup',
  'sort',
  'check',
  'analyze',
  'typos',
  'watch',
] as const;

const DEFAULT_COMMAND_KEYS = [
  ...DEFAULT_COMMAND_BOOLEAN_KEYS,
  'reporter',
  'targets',
] as const;

const REPORTERS = new Set<string>(['text', 'json', 'sarif']);

const SORT_CATEGORIES = new Set<string>(DEFAULT_SORT_ORDER);

function fail(filename: string, message: string): never {
  throw new Error(`Invalid ${filename}: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKnownKeys(
  cfg: Record<string, unknown>,
  known: readonly string[],
  label: string,
  filename: string,
): void {
  for (const key of Object.keys(cfg)) {
    if (!known.includes(key)) {
      fail(
        filename,
        `${label} "${key}" (expected one of: ${known.join(', ')})`,
      );
    }
  }
}

function assertPxTokenMap(value: unknown, key: string, filename: string): void {
  if (!isPlainObject(value)) {
    fail(
      filename,
      `${key} must be an object mapping px numbers to token names`,
    );
  }
  for (const [k, v] of Object.entries(value)) {
    if (!/^\d+$/.test(k))
      fail(filename, `${key} keys must be integers (got "${k}")`);
    if (typeof v !== 'string') fail(filename, `${key}[${k}] must be a string`);
  }
}

function assertStringArray(
  value: unknown,
  key: string,
  filename: string,
): void {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    fail(filename, `${key} must be an array of strings`);
  }
}

function assertRegExpArray(
  value: unknown,
  key: string,
  filename: string,
): void {
  if (!Array.isArray(value) || value.some((v) => !(v instanceof RegExp))) {
    fail(filename, `${key} must be an array of RegExp`);
  }
}

function assertStringRecord(
  value: unknown,
  key: string,
  filename: string,
): void {
  if (!isPlainObject(value)) {
    fail(filename, `${key} must be an object mapping strings to strings`);
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== 'string') fail(filename, `${key}[${k}] must be a string`);
  }
}

function assertPositiveInteger(
  value: unknown,
  key: string,
  filename: string,
): void {
  if (!Number.isInteger(value) || Number(value) < 1) {
    fail(filename, `${key} must be a positive integer`);
  }
}

function assertAnalyzeConfig(value: unknown, filename: string): void {
  if (!isPlainObject(value)) fail(filename, 'analyze must be an object');
  assertKnownKeys(
    value,
    ANALYZE_KEYS,
    'analyze contains unknown key',
    filename,
  );
  for (const key of ANALYZE_KEYS) {
    if (key in value)
      assertPositiveInteger(value[key], `analyze.${key}`, filename);
  }
}

function assertDefaultCommandConfig(value: unknown, filename: string): void {
  if (!isPlainObject(value)) fail(filename, 'defaultCommand must be an object');
  const cfg = value;
  assertKnownKeys(
    cfg,
    DEFAULT_COMMAND_KEYS,
    'defaultCommand contains unknown key',
    filename,
  );
  for (const key of DEFAULT_COMMAND_BOOLEAN_KEYS) {
    if (key in cfg && typeof cfg[key] !== 'boolean') {
      fail(filename, `defaultCommand.${key} must be a boolean`);
    }
  }
  if (
    'reporter' in cfg &&
    (typeof cfg.reporter !== 'string' || !REPORTERS.has(cfg.reporter))
  ) {
    fail(filename, 'defaultCommand.reporter must be one of: text, json, sarif');
  }
  if ('targets' in cfg) {
    assertStringArray(cfg.targets, 'defaultCommand.targets', filename);
  }
}

function assertSortOrder(value: unknown, filename: string): void {
  if (!Array.isArray(value))
    fail(filename, 'sortOrder must be an array of category names');
  for (const name of value) {
    if (typeof name !== 'string' || !SORT_CATEGORIES.has(name)) {
      fail(
        filename,
        `sortOrder contains invalid category "${String(name)}" (valid: ${[...SORT_CATEGORIES].join(', ')})`,
      );
    }
  }
}

export function validateConfig(
  input: unknown,
  filename = CONFIG_FILENAME,
): Config {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    fail(filename, 'default export must be an object');
  }

  const cfg = input as Record<string, unknown>;
  assertKnownKeys(cfg, KNOWN_KEYS, 'unknown key', filename);

  if ('customTextTokens' in cfg)
    assertPxTokenMap(cfg.customTextTokens, 'customTextTokens', filename);
  if ('customSpacingTokens' in cfg)
    assertPxTokenMap(cfg.customSpacingTokens, 'customSpacingTokens', filename);
  if ('ignorePatterns' in cfg)
    assertRegExpArray(cfg.ignorePatterns, 'ignorePatterns', filename);
  if ('functionNames' in cfg)
    assertStringArray(cfg.functionNames, 'functionNames', filename);
  if ('attributeNames' in cfg)
    assertStringArray(cfg.attributeNames, 'attributeNames', filename);
  if ('sortOrder' in cfg) assertSortOrder(cfg.sortOrder, filename);
  if ('extraColorFamilies' in cfg)
    assertStringRecord(cfg.extraColorFamilies, 'extraColorFamilies', filename);
  if ('extraScaleProperties' in cfg)
    assertStringArray(
      cfg.extraScaleProperties,
      'extraScaleProperties',
      filename,
    );
  if ('extraColors' in cfg)
    assertStringArray(cfg.extraColors, 'extraColors', filename);
  if ('analyze' in cfg) assertAnalyzeConfig(cfg.analyze, filename);
  if ('minRareScalePropertyOccurrences' in cfg)
    assertPositiveInteger(
      cfg.minRareScalePropertyOccurrences,
      'minRareScalePropertyOccurrences',
      filename,
    );
  if ('rareScaleMaxFiles' in cfg)
    assertPositiveInteger(cfg.rareScaleMaxFiles, 'rareScaleMaxFiles', filename);
  if ('rareScaleMaxCount' in cfg)
    assertPositiveInteger(cfg.rareScaleMaxCount, 'rareScaleMaxCount', filename);
  if ('defaultCommand' in cfg)
    assertDefaultCommandConfig(cfg.defaultCommand, filename);
  if (
    'tailwindVersion' in cfg &&
    cfg.tailwindVersion !== 3 &&
    cfg.tailwindVersion !== 4
  ) {
    fail(filename, 'tailwindVersion must be 3 or 4');
  }

  return cfg as Config;
}

export { loadConfig, resolveInitFilename } from '../io/config.js';

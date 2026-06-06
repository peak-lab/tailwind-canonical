import type { Config } from './rules.js';
import { DEFAULT_SORT_ORDER } from './sorter.js';

export const CONFIG_FILENAME = 'tailwind-canonical.config.ts';
export const CONFIG_FILENAMES = [
  CONFIG_FILENAME,
  'tailwind-canonical.config.js',
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

const ANALYZE_KEY_SET = new Set<string>(ANALYZE_KEYS);

const KNOWN_KEY_SET = new Set<string>(KNOWN_KEYS);
const SORT_CATEGORIES = new Set<string>(DEFAULT_SORT_ORDER);

function invalidConfig(filename: string, message: string): Error {
  return new Error(`Invalid ${filename}: ${message}`);
}

function fail(filename: string, message: string): never {
  throw invalidConfig(filename, message);
}

function assertPxTokenMap(value: unknown, key: string, filename: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(
      filename,
      `${key} must be an object mapping px numbers to token names`,
    );
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(filename, `${key} must be an object mapping strings to strings`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(filename, 'analyze must be an object');
  }
  const cfg = value as Record<string, unknown>;
  for (const key of Object.keys(cfg)) {
    if (!ANALYZE_KEY_SET.has(key)) {
      fail(
        filename,
        `analyze contains unknown key "${key}" (expected one of: ${ANALYZE_KEYS.join(', ')})`,
      );
    }
  }
  for (const key of ANALYZE_KEYS) {
    if (key in cfg) assertPositiveInteger(cfg[key], `analyze.${key}`, filename);
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
  for (const key of Object.keys(cfg)) {
    if (!KNOWN_KEY_SET.has(key)) {
      fail(
        filename,
        `unknown key "${key}" (expected one of: ${KNOWN_KEYS.join(', ')})`,
      );
    }
  }

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

  return cfg as Config;
}

export { loadConfig } from '../io/config.js';

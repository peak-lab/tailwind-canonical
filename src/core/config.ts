import type { Config } from './rules.js';
import { DEFAULT_SORT_ORDER } from './sorter.js';

export const CONFIG_FILENAME = 'tailwind-canonical.config.js';

const KNOWN_KEYS = [
  'customTextTokens',
  'customSpacingTokens',
  'ignorePatterns',
  'functionNames',
  'attributeNames',
  'sortOrder',
  'extraColorFamilies',
  'extraScaleProperties',
] as const;

const KNOWN_KEY_SET = new Set<string>(KNOWN_KEYS);
const SORT_CATEGORIES = new Set<string>(DEFAULT_SORT_ORDER);

function fail(message: string): never {
  throw new Error(`Invalid ${CONFIG_FILENAME}: ${message}`);
}

function assertPxTokenMap(value: unknown, key: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${key} must be an object mapping px numbers to token names`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(k)) fail(`${key} keys must be integers (got "${k}")`);
    if (typeof v !== 'string') fail(`${key}[${k}] must be a string`);
  }
}

function assertStringArray(value: unknown, key: string): void {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    fail(`${key} must be an array of strings`);
  }
}

function assertRegExpArray(value: unknown, key: string): void {
  if (!Array.isArray(value) || value.some((v) => !(v instanceof RegExp))) {
    fail(`${key} must be an array of RegExp`);
  }
}

function assertStringRecord(value: unknown, key: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${key} must be an object mapping strings to strings`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') fail(`${key}[${k}] must be a string`);
  }
}

function assertSortOrder(value: unknown): void {
  if (!Array.isArray(value))
    fail('sortOrder must be an array of category names');
  for (const name of value) {
    if (typeof name !== 'string' || !SORT_CATEGORIES.has(name)) {
      fail(
        `sortOrder contains invalid category "${String(name)}" (valid: ${[...SORT_CATEGORIES].join(', ')})`,
      );
    }
  }
}

export function validateConfig(input: unknown): Config {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    fail('default export must be an object');
  }

  const cfg = input as Record<string, unknown>;
  for (const key of Object.keys(cfg)) {
    if (!KNOWN_KEY_SET.has(key)) {
      fail(`unknown key "${key}" (expected one of: ${KNOWN_KEYS.join(', ')})`);
    }
  }

  if ('customTextTokens' in cfg)
    assertPxTokenMap(cfg.customTextTokens, 'customTextTokens');
  if ('customSpacingTokens' in cfg)
    assertPxTokenMap(cfg.customSpacingTokens, 'customSpacingTokens');
  if ('ignorePatterns' in cfg)
    assertRegExpArray(cfg.ignorePatterns, 'ignorePatterns');
  if ('functionNames' in cfg)
    assertStringArray(cfg.functionNames, 'functionNames');
  if ('attributeNames' in cfg)
    assertStringArray(cfg.attributeNames, 'attributeNames');
  if ('sortOrder' in cfg) assertSortOrder(cfg.sortOrder);
  if ('extraColorFamilies' in cfg)
    assertStringRecord(cfg.extraColorFamilies, 'extraColorFamilies');
  if ('extraScaleProperties' in cfg)
    assertStringArray(cfg.extraScaleProperties, 'extraScaleProperties');

  return cfg as Config;
}

export { loadConfig } from '../io/config.js';

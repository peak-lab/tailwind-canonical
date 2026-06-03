export type { Finding } from './core/analyzer.js';
export { analyzeFile } from './core/analyzer.js';
export type { ClassStringOpts } from './core/class-strings.js';
export {
  extractClassStrings,
  replaceClassStrings,
} from './core/class-strings.js';
export { loadConfig, validateConfig } from './core/config.js';
export type {
  ClassCombination,
  ColorVariant,
  ColorVariantGroup,
  ConsistencyOptions,
  ConsistencyReport,
  FileClasses,
  ScaleInconsistency,
  ScaleValue,
} from './core/consistency.js';
export {
  analyzeConsistency,
  analyzeConsistencyFiles,
  collectClasses,
} from './core/consistency.js';
export { dedupeFile, deduplicateClasses } from './core/deduplicator.js';
export { fixFile } from './core/fixer.js';
export { mergeFile } from './core/merger.js';
export type { Config, Suggestion } from './core/rules.js';
export { suggestCanonical } from './core/rules.js';
export { resolveTargets, scanFiles } from './core/scanner.js';
export type { SortCategory } from './core/sorter.js';
export { DEFAULT_SORT_ORDER, sortClasses, sortFile } from './core/sorter.js';
export { getSuppressedLines, makeLineSuppressor } from './core/suppressions.js';

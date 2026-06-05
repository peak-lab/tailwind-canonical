// Public programmatic API for `tailwind-canonical`.
//
// This barrel is the package's stable surface. Internal plumbing
// (class-string extraction, suppression predicates, config validation,
// file-class collection, consistency file readers) is intentionally NOT
// re-exported here — import it by direct module path if you need it.

// Analysis
export type { Finding } from './core/analyzer.js';
export { analyzeFile } from './core/analyzer.js';
// Config loading
export { loadConfig } from './core/config.js';
// Cross-file consistency analysis (pure)
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
export { analyzeConsistency } from './core/consistency.js';
// Transforms (pure + file appliers)
export { dedupeFile, deduplicateClasses } from './core/deduplicator.js';
export { fixFile } from './core/fixer.js';
export { mergeFile } from './core/merger.js';
// Core rule engine
export type { Config, Suggestion } from './core/rules.js';
export { suggestCanonical } from './core/rules.js';
// File discovery
export type { ScanOptions } from './core/scanner.js';
export { resolveTargets, scanFiles } from './core/scanner.js';
export type { SortCategory } from './core/sorter.js';
export { DEFAULT_SORT_ORDER, sortClasses, sortFile } from './core/sorter.js';
// Typo detection
export type { TypoFinding } from './core/typos.js';
export { analyzeTyposFile, detectTypo } from './core/typos.js';

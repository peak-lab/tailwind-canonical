export type { Finding } from './core/analyzer.js';
export { analyzeFile } from './core/analyzer.js';
export { dedupeFile, deduplicateClasses } from './core/deduplicator.js';
export { fixFile } from './core/fixer.js';
export { mergeFile } from './core/merger.js';
export type { Config, Suggestion } from './core/rules.js';
export { suggestCanonical } from './core/rules.js';
export { scanFiles } from './core/scanner.js';
export { sortClasses, sortFile } from './core/sorter.js';

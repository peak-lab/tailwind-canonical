# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build        # compile TypeScript → dist/
pnpm dev          # watch mode
pnpm test         # run all tests (tsx ESM runner, no build required)
pnpm typecheck    # type-check without emitting
pnpm lint         # biome check src/
pnpm lint:fix     # biome check --write src/
pnpm knip         # detect unused exports/files/deps (enforced in CI + pre-push)
```

Run a single test file:
```bash
node --import=tsx/esm --test src/core/rules.test.ts
```

## Architecture

This is a zero-dependency TypeScript library published as ESM (`"type": "module"`).
Outputs to `dist/` via `tsc`. Two public entry points: `.` and `./eslint`.

**Layering:** `src/core/` is pure (no `node:fs`); all filesystem I/O lives in `src/io/`. Each `*File` wrapper (`analyzeFile`, `fixFile`, `dedupeFile`, `sortFile`, `mergeFile`, `analyzeTyposFile`, `analyzeConsistencyFiles`, `loadConfig`, `scanFiles`, `resolveTargets`) lives in `src/io/`; the matching `core/*.ts` re-exports it (`export { fixFile } from '../io/fixer.js'`) so existing import paths and the public barrel stay stable. The pure content-level functions live in core: `analyzeContent`, `fixContent`, `dedupeContent`, `sortContent`, `mergeContent`, `analyzeTyposContent`, `validateConfig`, `globToRegex`/`isGlob`. The only `node:fs` use left in core's tree is `cli.ts`'s `fsWatch` (the watcher) and test fixtures.

**Core pipeline** (`src/core/` — pure logic, no `node:fs`):

| File | Role |
|---|---|
| `rules.ts` | Pure function `suggestCanonical(cls, config)` — the single source of truth for all replacement logic. No I/O. |
| `analyzer.ts` | `analyzeContent(file, content, config)` — extracts `className` values via regex, maps each class through `suggestCanonical`, returns `Finding[]` with line/col. Re-exports `analyzeFile` from `io/`. |
| `fixer.ts` | `fixContent(content, config)` — applies all `suggestCanonical` replacements, returns `{result,count}`. Re-exports `fixFile` from `io/`. |
| `deduplicator.ts` | `deduplicateClasses(str)` — pure expand-apply-collapse for p/m/border-width/inset box families. Display/position last-wins. `dedupeContent()` wraps it; re-exports `dedupeFile` from `io/`. |
| `sorter.ts` | `sortClasses(str)` — stable sort by category (layout→position→display→flex/grid→sizing→border→spacing→typography→colors→effects→…→variants). `sortContent()` wraps it; re-exports `sortFile` from `io/`. |
| `merger.ts` | `mergeContent(content, twMerge, opts)` — pure. Re-exports `mergeFile` from `io/` (async; dynamically imports `tailwind-merge`, an optional peer dep). |
| `scanner.ts` | Pure glob helpers `globToRegex`/`isGlob` + `DEFAULT_EXTENSIONS`/`DEFAULT_IGNORE` + `ScanOptions`. Re-exports `scanFiles`/`resolveTargets` from `io/`. |
| `consistency.ts` | `analyzeConsistency(fileClasses[], options?)` — pure cross-file detectors: color-variant grouping (by property + hue family), scale inconsistency (spacing/gap/z), repeated class combinations. `collectClasses`/`toConsistencyOptions` are pure. Re-exports `analyzeConsistencyFiles` from `io/`. Lexicons come from `lexicon.ts`; a known color without an explicit family forms its own family. `options.extraColorFamilies`/`extraScaleProperties` extend detection. |
| `config.ts` | `validateConfig(input)` — pure validation. Re-exports `loadConfig` from `io/`. `CONFIG_FILENAME` is shared with `io/config.ts`. |
| `suppressions.ts` | `getSuppressedLines(content)` — 1-based line set from `tailwind-canonical-disable-next-line` / `disable`…`enable` pragma comments (substring match). `makeLineSuppressor()` + `lineAt()` feed the `isSuppressed` predicate. |
| `lexicon.ts` | Shared Tailwind vocab: `TAILWIND_COLORS`, `COLOR_PROPERTIES`, `COLOR_FAMILIES`, `SCALE_PROPERTIES`. Consumed by both `typos.ts` and `consistency.ts`. |
| `typos.ts` | `detectTypo(cls)` — flags color-name typos via Levenshtein-1 against `TAILWIND_COLORS` (candidate len ≥3, low false-positive). `analyzeTyposContent()` adds line/col + suppression. Re-exports `analyzeTyposFile` from `io/`. CLI `--typos`. |
| `class-strings.ts` | Shared tokenizer: `extractClassStrings`/`replaceClassStrings` (the `className`/attribute + `cn(...)`/`clsx(...)` scanner), `SINGLE_CLASS_REGEX`, `ClassStringOpts`, and `toClassStringOpts(config)`. Consumed by `analyzer.ts`, `fixer.ts`, `deduplicator.ts`, `sorter.ts`, `merger.ts`, `typos.ts`. Internal — not in the public barrel. |

**I/O layer** (`src/io/` — all `node:fs` reads/writes): `analyzer.ts`, `fixer.ts`, `deduplicator.ts`, `sorter.ts`, `merger.ts`, `typos.ts`, `consistency.ts`, `config.ts`, `scanner.ts`. Each reads the file, delegates to the matching pure `core` function, and (for transforms) writes back when `count > 0`. `core/*.ts` re-export these so consumers and tests keep importing from `core/`.

**Consumers of core:**

- `src/cli/cli.ts` — `run(argv, cwd, sink?)`, the testable CLI core (no `process.exit`; injectable `sink`). Flags: `--fix`, `--dedup`, `--merge`, `--sort`, `--analyze`, `--typos`, `--watch`, `--reporter`. Pipeline order: fix → dedup → merge → sort. `--analyze` and `--typos` are standalone modes that short-circuit the per-file pipeline. **Mode precedence is fixed: `--analyze` > `--typos` > transform/check.** Exactly one mode runs; flags belonging to a lower-priority mode are ignored, not errored. `--watch` is only honored in transform/check mode (it has no effect with `--analyze` or `--typos`). `flagWarnings(flags)` (pure, order-stable, in `cli.ts`) computes a `Warning: …` line for every ignored flag; `run` emits them via `sink.error` before dispatching — warnings never alter the active mode or exit code. `src/cli/index.ts` is a thin bin wrapper that calls `run` and `process.exit`s. Config loaded via `loadConfig` (validated). Exits 1 on findings in check mode.
- `src/eslint/plugin.ts` — ESLint flat-config plugin. Rules: `no-arbitrary-canonical` (wraps `suggestCanonical`) and `no-conflicting-classes` (wraps `twMerge` via `createRequire`).

## Config

`tailwind-canonical.config.js` (optional, ESM, loaded at runtime from cwd):

```js
export default {
  customTextTokens: { 11: '2xs' },   // px → token name additions/overrides
  customSpacingTokens: { 14: '3.5' }, // px → spacing scale additions
  ignorePatterns: [/^text-/], // classes matching any pattern are never suggested
  sortOrder: ['display', 'spacing', 'colors'], // custom --sort category order
  extraColorFamilies: { brand: 'brand' }, // color → hue family for --analyze grouping
  extraScaleProperties: ['scroll-p'],     // extra scale prefixes for --analyze
}
```

`customTextTokens` merges with the built-in `TEXT_SIZE_MAP` in `rules.ts`. `customSpacingTokens` supplements the default ÷4 spacing logic. `sortOrder` is a `SortCategory[]`; omitted categories and unknown classes sort last. `ignorePatterns` is honored inside `suggestCanonical` (so CLI, analyzer, and the ESLint plugin all skip matching classes); lastIndex is reset so `/g` patterns stay deterministic. `extraColorFamilies`/`extraScaleProperties` feed `--analyze` via `toConsistencyOptions(config)` — they extend the built-in `consistency.ts` detection lexicons.

## Key invariants

- `suggestCanonical` returns `null` for non-divisible px values — they must be left untouched.
- `isCustomToken: true` on a `Suggestion` means the canonical name comes from config/non-built-in mapping; the CLI appends `[custom token]` to the output.
- The ESLint plugin does NOT use `analyzeFile`/`fixFile` — it calls `suggestCanonical` directly on AST node values.
- `deduplicator.ts` uses a generic `BoxFamily` system — add new box families (e.g. `margin-block`) by adding an entry to `FAMILIES` and keys to `SIDE_MAP`.
- `sorter.ts` uses named `SortCategory` values; `getCategory` returns a name (or `null` for unknown). Rank derives from index in the active order (`config.sortOrder` or `DEFAULT_SORT_ORDER`); omitted/unknown categories rank last. Adding a new category = add the name to the `SortCategory` union + `DEFAULT_SORT_ORDER` and a condition in `getCategory`.
- `merger.ts` uses dynamic `import('tailwind-merge')` — it is async; the ESLint rule uses synchronous `createRequire(import.meta.url)` instead.
- Suppression is line-based (offset-shift-safe since replacements never change newline count). `replaceClassStrings` takes an `isSuppressed(line)` predicate; all four `*File` transformers pass `makeLineSuppressor(content)`, and `analyzeFile` filters findings by suppressed line. Pragmas are matched as substrings, checking `disable-next-line` before `disable`.
- Tests use Node's built-in `node:test` runner with `tsx` for ESM TypeScript — no Jest, no Vitest.
- `src/index.ts` is the **public API barrel** — it exports ONLY the stable surface (rule engine, `*File` appliers + their pure twins, consistency/typo analysis, config loading, file discovery). Internal plumbing (`extractClassStrings`, `replaceClassStrings`, `ClassStringOpts`, `validateConfig`, `collectClasses`, `analyzeConsistencyFiles`, `makeLineSuppressor`, `getSuppressedLines`) is NOT in the barrel — import it by direct module path. The `./eslint` entry (`plugin.ts`) does not consume the barrel; it imports `suggestCanonical` directly.
- `pnpm knip` is enforced: it runs in CI (`.github/workflows/ci.yml`) and in the lefthook `pre-push` hook. Config in `knip.json` (`project: src/**/*.ts`; entries auto-detected from `package.json` exports/bin). Keep the tree free of unused exports — un-export (drop `export`) symbols only used internally rather than deleting them when they're still referenced.

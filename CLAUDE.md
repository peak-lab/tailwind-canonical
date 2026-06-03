# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build        # compile TypeScript → dist/
pnpm dev          # watch mode
pnpm test         # run all tests (tsx ESM runner, no build required)
pnpm typecheck    # type-check without emitting
```

Run a single test file:
```bash
node --import=tsx/esm --test src/core/rules.test.ts
```

## Architecture

This is a zero-dependency TypeScript library published as ESM (`"type": "module"`).
Outputs to `dist/` via `tsc`. Two public entry points: `.` and `./eslint`.

**Core pipeline** (`src/core/`):

| File | Role |
|---|---|
| `rules.ts` | Pure function `suggestCanonical(cls, config)` — the single source of truth for all replacement logic. No I/O. |
| `analyzer.ts` | Reads a file, extracts `className` attribute values via regex, maps each class through `suggestCanonical`, returns `Finding[]` with line/col. |
| `fixer.ts` | Reads a file, applies all `suggestCanonical` replacements in-place, writes back. |
| `deduplicator.ts` | `deduplicateClasses(str)` — pure expand-apply-collapse for p/m/border-width/inset box families. Display/position last-wins. `dedupeFile()` applies it. |
| `sorter.ts` | `sortClasses(str)` — stable sort by category (layout→position→display→flex/grid→sizing→border→spacing→typography→colors→effects→…→variants). `sortFile()` applies it. |
| `merger.ts` | `mergeFile()` — async; dynamically imports `tailwind-merge` (optional peer dep). |
| `scanner.ts` | Recursive directory walker — returns matching file paths. Ignores `node_modules`, `dist`, etc. |
| `consistency.ts` | `analyzeConsistency(fileClasses[])` — pure cross-file detectors: color-variant grouping (by property + hue family), scale inconsistency (spacing/gap/z), repeated class combinations. `analyzeConsistencyFiles()` reads files; `collectClasses()` extracts every class from content. No mutation. |
| `suppressions.ts` | `getSuppressedLines(content)` — 1-based line set from `tailwind-canonical-disable-next-line` / `disable`…`enable` pragma comments (substring match). `makeLineSuppressor()` + `lineAt()` feed the `isSuppressed` predicate. |

**Consumers of core:**

- `src/cli/index.ts` — CLI entry point. Flags: `--fix`, `--dedup`, `--merge`, `--sort`, `--analyze`. Pipeline order: fix → dedup → merge → sort. `--analyze` is a standalone cross-file mode (short-circuits the per-file pipeline; supports `--reporter json`). Loads optional `tailwind-canonical.config.js` from cwd via dynamic `import()`. Exits 1 on findings when in check mode.
- `src/eslint/plugin.ts` — ESLint flat-config plugin. Rules: `no-arbitrary-canonical` (wraps `suggestCanonical`) and `no-conflicting-classes` (wraps `twMerge` via `createRequire`).

## Config

`tailwind-canonical.config.js` (optional, ESM, loaded at runtime from cwd):

```js
export default {
  customTextTokens: { 11: '2xs' },   // px → token name additions/overrides
  customSpacingTokens: { 14: '3.5' }, // px → spacing scale additions
  ignorePatterns: [/^text-/], // classes matching any pattern are never suggested
  sortOrder: ['display', 'spacing', 'colors'], // custom --sort category order
}
```

`customTextTokens` merges with the built-in `TEXT_SIZE_MAP` in `rules.ts`. `customSpacingTokens` supplements the default ÷4 spacing logic. `sortOrder` is a `SortCategory[]`; omitted categories and unknown classes sort last. `ignorePatterns` is honored inside `suggestCanonical` (so CLI, analyzer, and the ESLint plugin all skip matching classes); lastIndex is reset so `/g` patterns stay deterministic.

## Key invariants

- `suggestCanonical` returns `null` for non-divisible px values — they must be left untouched.
- `isCustomToken: true` on a `Suggestion` means the canonical name comes from config/non-built-in mapping; the CLI appends `[custom token]` to the output.
- The ESLint plugin does NOT use `analyzeFile`/`fixFile` — it calls `suggestCanonical` directly on AST node values.
- `deduplicator.ts` uses a generic `BoxFamily` system — add new box families (e.g. `margin-block`) by adding an entry to `FAMILIES` and keys to `SIDE_MAP`.
- `sorter.ts` uses named `SortCategory` values; `getCategory` returns a name (or `null` for unknown). Rank derives from index in the active order (`config.sortOrder` or `DEFAULT_SORT_ORDER`); omitted/unknown categories rank last. Adding a new category = add the name to the `SortCategory` union + `DEFAULT_SORT_ORDER` and a condition in `getCategory`.
- `merger.ts` uses dynamic `import('tailwind-merge')` — it is async; the ESLint rule uses synchronous `createRequire(import.meta.url)` instead.
- Suppression is line-based (offset-shift-safe since replacements never change newline count). `replaceClassStrings` takes an `isSuppressed(line)` predicate; all four `*File` transformers pass `makeLineSuppressor(content)`, and `analyzeFile` filters findings by suppressed line. Pragmas are matched as substrings, checking `disable-next-line` before `disable`.
- Tests use Node's built-in `node:test` runner with `tsx` for ESM TypeScript — no Jest, no Vitest.

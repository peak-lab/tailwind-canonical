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

**Consumers of core:**

- `src/cli/index.ts` — CLI entry point. Flags: `--fix`, `--dedup`, `--merge`, `--sort`. Pipeline order: fix → dedup → merge → sort. Loads optional `tailwind-canonical.config.js` from cwd via dynamic `import()`. Exits 1 on findings when in check mode.
- `src/eslint/plugin.ts` — ESLint flat-config plugin. Rules: `no-arbitrary-canonical` (wraps `suggestCanonical`) and `no-conflicting-classes` (wraps `twMerge` via `createRequire`).

## Config

`tailwind-canonical.config.js` (optional, ESM, loaded at runtime from cwd):

```js
export default {
  customTextTokens: { 11: '2xs' },   // px → token name additions/overrides
  customSpacingTokens: { 14: '3.5' }, // px → spacing scale additions
  ignorePatterns: [],
}
```

`customTextTokens` merges with the built-in `TEXT_SIZE_MAP` in `rules.ts`. `customSpacingTokens` supplements the default ÷4 spacing logic.

## Key invariants

- `suggestCanonical` returns `null` for non-divisible px values — they must be left untouched.
- `isCustomToken: true` on a `Suggestion` means the canonical name comes from config/non-built-in mapping; the CLI appends `[custom token]` to the output.
- The ESLint plugin does NOT use `analyzeFile`/`fixFile` — it calls `suggestCanonical` directly on AST node values.
- `deduplicator.ts` uses a generic `BoxFamily` system — add new box families (e.g. `margin-block`) by adding an entry to `FAMILIES` and keys to `SIDE_MAP`.
- `sorter.ts` uses category numbers (0–500) for stable sort. Unknown classes get 500 (go last). Adding a new category = pick a number and add a condition in `getCategory`.
- `merger.ts` uses dynamic `import('tailwind-merge')` — it is async; the ESLint rule uses synchronous `createRequire(import.meta.url)` instead.
- Tests use Node's built-in `node:test` runner with `tsx` for ESM TypeScript — no Jest, no Vitest.

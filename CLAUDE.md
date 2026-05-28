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
| `scanner.ts` | Recursive directory walker — returns matching file paths. Ignores `node_modules`, `dist`, etc. |

**Consumers of core:**

- `src/cli/index.ts` — CLI entry point. Loads optional `tailwind-canonical.config.js` from cwd via dynamic `import()`. Exits 1 on findings when not in `--fix` mode.
- `src/eslint/plugin.ts` — ESLint flat-config plugin wrapping `suggestCanonical`. Handles `Literal` and `TemplateLiteral` AST nodes.

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
- Tests use Node's built-in `node:test` runner with `tsx` for ESM TypeScript — no Jest, no Vitest.

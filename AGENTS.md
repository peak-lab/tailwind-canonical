# AGENTS.md

## Project Overview

`tailwind-canonical` is a zero-dependency TypeScript library that lints and auto-fixes
Tailwind CSS arbitrary values (e.g. `text-[12px]`) that have canonical equivalents (`text-xs`).

Ships three artifacts from one codebase:

- A CLI binary (`tailwind-canonical`)
- A library API (`suggestCanonical`, `analyzeFile`, `fixFile`, `scanFiles`)
- An ESLint plugin (`tailwind-canonical/eslint`) — the only reason ESLint is a peer dep

## Tech Stack

- Node `>=22.6`, ESM-only (`"type": "module"`) — CI runs Node 22 and 24
- TypeScript `^6.0.3`, target ES2022, module NodeNext
- pnpm `11.4.0` (pinned via `packageManager` field)
- Biome `^2.5.11` — internal linter/formatter
- `node:test` + `tsx` `^4.23.13` — test runner (no Jest, no Vitest)
- Lefthook `^2.1.12` — git hook manager (pre-commit: biome + typecheck, pre-push: test + knip)
- knip `^6.34.0` — dead code/dependency detection (`pnpm knip`; enforced in CI and the pre-push hook)
- ESLint `>=8.0.0` — peer dep only, for plugin consumers

## Commands

```bash
pnpm build        # tsc → dist/
pnpm dev          # tsc --watch
pnpm test         # node --import=tsx/esm --test "src/**/*.test.ts"
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check src/
pnpm lint:fix     # biome check --write src/
```

Run a single test file:

```bash
node --import=tsx/esm --test src/core/rules.test.ts
```

## Architecture

```
src/
  cli/index.ts         # CLI entry: loads cwd config, drives analyzer/fixer
  eslint/plugin.ts     # Flat-config ESLint plugin — calls suggestCanonical on AST nodes
  core/                # Pure logic — zero node:fs
    rules.ts           # suggestCanonical(cls, config) → Suggestion | null
    lexicon.ts         # Tailwind color/property vocabulary
    class-strings.ts   # extract class strings from className/clsx/cva calls
    suppressions.ts    # tailwind-canonical-disable pragma handling
    config.ts          # config schema/merge logic
    analyzer.ts        # content → Finding[]
    fixer.ts           # arbitrary → canonical rewrite logic
    deduplicator.ts    # dedup + shorthand-collapse logic
    merger.ts          # tailwind-merge integration
    sorter.ts          # canonical class ordering
    consistency.ts     # cross-file consistency analysis
    typos.ts           # color-name typo detection
    scanner.ts         # target resolution helpers
  io/                  # Thin node:fs wrappers — one per side-effecting core/ module
    analyzer.ts config.ts consistency.ts deduplicator.ts fixer.ts
    merger.ts scanner.ts sorter.ts typos.ts
  index.ts             # Public library exports (barrel over core/)
```

**Key invariant**: `core/` is pure — no file under `src/core/` imports `node:fs`.
All file I/O lives in `src/io/` (9 wrappers, one per side-effecting `core/` module).
Each of those `core/X.ts` files re-exports its `io/X.ts` wrapper as its last line
(e.g. `fixer.ts` ends with `export { fixFile } from '../io/fixer.js';`), so the
public import path stays `core/` — consumers, and `src/index.ts`, never import
from `src/io/` directly.

## Patterns

### Adding a new canonical mapping

Edit `src/core/rules.ts` only. Three maps live there: `TEXT_SIZE_MAP`, `ROUNDED_MAP`,
and the implicit ÷4 spacing rule. Adding new dimensions (e.g. `opacity-[N]`) means
adding a new regex branch in `suggestCanonical`.

### Returning `null`

`suggestCanonical` returns `null` for non-canonical px values (e.g. `h-[22px]`).
**These must stay untouched** — they are valid Tailwind, just not divisible.
Tests in `src/core/rules.test.ts` assert this for several non-divisible inputs.

### `isCustomToken: true`

Set when the canonical name comes from user config (`customTextTokens`, `customSpacingTokens`)
or a non-built-in mapping. CLI appends `[custom token]` to the output line.

### ESLint plugin path

The plugin (`src/eslint/plugin.ts`) calls `suggestCanonical` directly on AST
`Literal` / `TemplateLiteral` nodes — there is no I/O on this path, so there is
nothing to share with `src/io/`. Don't refactor it to route through `src/io/`.

## Publishing

- `prepublishOnly` runs `pnpm build`
- `bin` field maps to `dist/cli/index.js`
- `exports` field exposes `.` and `./eslint`
- `pnpm-workspace.yaml` controls `allowBuilds` (esbuild needs `true` for tsx postinstall)

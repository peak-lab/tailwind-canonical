# AGENTS.md

## Project Overview

`tailwind-canonical` is a zero-dependency TypeScript library that lints and auto-fixes
Tailwind CSS arbitrary values (e.g. `text-[12px]`) that have canonical equivalents (`text-xs`).

Ships three artifacts from one codebase:

- A CLI binary (`tailwind-canonical`)
- A library API (`suggestCanonical`, `analyzeFile`, `fixFile`, `scanFiles`)
- An ESLint plugin (`tailwind-canonical/eslint`) — the only reason ESLint is a peer dep

## Tech Stack

- Node 24, ESM-only (`"type": "module"`)
- TypeScript `^6.0.0`, target ES2022, module NodeNext
- pnpm `11.4.0` (pinned via `packageManager` field)
- Biome `^2.4.16` — internal linter/formatter
- `node:test` + `tsx` — test runner (no Jest, no Vitest)
- Lefthook `^2.1.8` — git hook manager (pre-commit: biome + typecheck, pre-push: test)
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
  eslint/plugin.ts     # Flat-config ESLint plugin — wraps suggestCanonical
  core/
    rules.ts           # Pure logic: suggestCanonical(cls, config) → Suggestion | null
    analyzer.ts        # File → Finding[] (regex-based className extraction)
    fixer.ts           # File → in-place rewrite using suggestCanonical
    scanner.ts         # Recursive directory walker (extension filter)
  index.ts             # Public library exports
```

**Key invariant**: `rules.ts` has zero I/O. `analyzer.ts`, `fixer.ts`, `scanner.ts` do all the I/O.
Every consumer (CLI, ESLint plugin, future integrations) routes through `suggestCanonical`.

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

The plugin (`src/eslint/plugin.ts`) does NOT go through `analyzer.ts` / `fixer.ts`.
It calls `suggestCanonical` directly on AST `Literal` and `TemplateLiteral` nodes.
Don't refactor it to share I/O code — there is no I/O on the ESLint path.

## Publishing

- `prepublishOnly` runs `pnpm build`
- `bin` field maps to `dist/cli/index.js`
- `exports` field exposes `.` and `./eslint`
- `pnpm-workspace.yaml` controls `allowBuilds` (esbuild needs `true` for tsx postinstall)

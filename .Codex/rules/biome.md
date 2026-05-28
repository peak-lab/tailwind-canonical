# Biome Rules

## Proactive Behavior

When fixing lint or format errors in this repo, Codex must use Biome — never suggest
ESLint or Prettier commands. ESLint is present only as a peer dep for the shipped plugin
(`src/eslint/plugin.ts`), not for linting source code.

## Use Biome, Not ESLint

```bash
pnpm lint         # biome check src/
pnpm lint:fix     # biome check --write src/
```

Biome only scans `src/` (see `files.includes` in `biome.json`). `dist/` and `node_modules/`
are excluded via the `.gitignore` integration.

## Suppressing Biome Errors

Use inline `biome-ignore` comments, not `eslint-disable`:

```typescript
// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
while ((match = REGEX.exec(content)) !== null) { ... }
```

## Format on Write

The repo's Biome config formats with **2-space indent, single quotes, trailing commas**.
Do not introduce double quotes or tabs in `src/` — Biome will reject them in CI.

## CI Gate

`pnpm lint` runs in CI before `typecheck` and `test`. A Biome failure blocks the PR.
Run `pnpm lint:fix` locally before pushing.

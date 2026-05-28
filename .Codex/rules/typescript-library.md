# TypeScript Library Rules

## Proactive Behavior

When editing any file in `src/`, Codex must keep the following invariants intact —
breaking them silently breaks downstream consumers (CLI, library API, ESLint plugin).

## ESM-Only, NodeNext

All relative imports must use the `.js` extension, even for `.ts` files.

```typescript
// Correct — TS will resolve .ts, Node will resolve .js at runtime
import { suggestCanonical } from './rules.js';

// Wrong — NodeNext requires explicit .js extension
import { suggestCanonical } from './rules';
```

## Keep `rules.ts` Pure

`src/core/rules.ts` has zero I/O. No `readFileSync`, no `fetch`, no env access.
This file is the single source of truth for replacement logic and must be safely
callable from any context (CLI, ESLint plugin AST visitor, future browser usage).

## Don't Refactor the ESLint Plugin Into the I/O Path

`src/eslint/plugin.ts` operates on AST nodes, not files. It calls `suggestCanonical`
directly. Do not introduce `analyzeFile` or `fixFile` into the plugin — it would
break the ESLint contract (plugins must not touch the filesystem).

## `suggestCanonical` Returns `null` by Design

For non-divisible px values (e.g. `h-[22px]`, `px-[7px]`), `suggestCanonical` returns
`null` and the value is preserved untouched. This is contract, not a TODO. Tests in
`src/core/rules.test.ts` lock this behavior.

## Tests Use `node:test`, Not Jest/Vitest

When adding tests, follow the existing pattern:

```typescript
import assert from 'node:assert';
import { type TestContext, test } from 'node:test';

test('description', async (t: TestContext) => {
  await t.test('sub-case', () => {
    assert.deepEqual(actual, expected);
  });
});
```

The `t: TestContext` annotation is required — TS strict mode rejects implicit `any`.

## Public API Surface

`src/index.ts` is the library's public contract. Adding an export here is a
semver-meaningful change. Removing or renaming one is a breaking change.

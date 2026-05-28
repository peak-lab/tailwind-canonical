# tailwind-canonical

Lint and auto-fix Tailwind CSS arbitrary values that have canonical equivalents.

## Install

```bash
pnpm add -D tailwind-canonical
npm install -D tailwind-canonical
yarn add -D tailwind-canonical
```

## CLI

```bash
# Check
npx tailwind-canonical ./src

# Auto-fix
npx tailwind-canonical --fix ./src
```

## Output

```
  src/components/badge.tsx:12:18  text-[11px] → text-2xs [custom token]
  src/components/card.tsx:34:5   h-[64px] → h-16
  src/components/card.tsx:41:5   text-[12px] → text-xs

✖ Found 3 non-canonical classes
  Run with --fix to auto-replace
```

## Config

Create `tailwind-canonical.config.js` at the root:

```js
export default {
  customTextTokens: {
    10: '3xs',
    11: '2xs',
    13: 'xxs',
  },
}
```

## ESLint plugin

```js
// eslint.config.js
import tailwindCanonical from 'tailwind-canonical/eslint'

export default [
  {
    plugins: { 'tailwind-canonical': tailwindCanonical },
    rules: {
      'tailwind-canonical/no-arbitrary-canonical': 'warn',
    },
  },
]
```

## Pre-commit hook (Husky)

```bash
# .husky/pre-commit
npx tailwind-canonical ./src ./app
```

## What gets flagged

| Arbitrary | Canonical | Notes |
|---|---|---|
| `text-[12px]` | `text-xs` | Built-in |
| `text-[14px]` | `text-sm` | Built-in |
| `text-[11px]` | `text-2xs` | Custom token |
| `h-[64px]` | `h-16` | Spacing scale ÷4 |
| `w-[32px]` | `w-8` | Spacing scale ÷4 |
| `min-h-[56px]` | `min-h-14` | Spacing scale ÷4 |
| `max-w-[280px]` | `max-w-70` | Spacing scale ÷4 |

Non-divisible values (`h-[22px]`, `px-[7px]`) are left untouched.

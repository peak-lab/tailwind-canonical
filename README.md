# tailwind-canonical

Lint and auto-fix Tailwind CSS classes: arbitrary values → canonical, deduplication, shorthand collapsing, and class sorting.

## Install

```bash
pnpm add -D tailwind-canonical
npm install -D tailwind-canonical
yarn add -D tailwind-canonical
```

## CLI

```bash
# Check for non-canonical arbitrary values
npx tailwind-canonical ./src

# Auto-fix: arbitrary → canonical
npx tailwind-canonical --fix ./src

# Deduplicate and collapse shorthands
npx tailwind-canonical --dedup ./src

# Sort classes into canonical order
npx tailwind-canonical --sort ./src

# Resolve conflicts with tailwind-merge (requires: pnpm add -D tailwind-merge)
npx tailwind-canonical --merge ./src

# Combine: fix → dedup → merge → sort
npx tailwind-canonical --fix --dedup --merge --sort ./src

# Structured output for CI (check mode only)
npx tailwind-canonical --reporter json ./src
npx tailwind-canonical --reporter sarif ./src
```

## What each flag does

| Flag | What it fixes | Example |
|---|---|---|
| `--fix` | Arbitrary values → canonical tokens | `text-[12px]` → `text-xs` |
| `--dedup` | Redundant or conflicting classes | `flex block` → `block`, `px-4 py-4` → `p-4` |
| `--dedup` | Directional shorthand collapse | `border-t-2 border-b-2` → `border-y-2`, `top-4 bottom-4` → `inset-y-4` |
| `--sort` | Canonical class order | `text-sm flex p-4` → `flex p-4 text-sm` |
| `--merge` | tailwind-merge conflict resolution | `bg-red-500 bg-blue-500` → `bg-blue-500` |
| `--reporter json` | JSON output (check mode) or fix summary | machine-readable for CI pipelines |
| `--reporter sarif` | SARIF 2.1.0 output (check mode) | GitHub Code Scanning / VS Code |

## Structured output (`--reporter`)

```bash
# JSON — check mode: outputs findings, exits 1 if any found
npx tailwind-canonical --reporter json ./src
```
```json
{
  "files": 3,
  "total": 2,
  "findings": [
    { "file": "src/Button.tsx", "line": 12, "col": 17, "original": "text-[14px]", "canonical": "text-sm", "isCustomToken": false }
  ]
}
```

```bash
# JSON — fix mode: outputs summary of changes
npx tailwind-canonical --fix --reporter json ./src
```
```json
{ "files": 3, "changedFiles": ["src/Button.tsx"], "fixed": 1, "deduped": 0, "merged": 0, "sorted": 0 }
```

```bash
# SARIF — compatible with GitHub Code Scanning and VS Code Problem Matcher
npx tailwind-canonical --reporter sarif ./src > results.sarif
```

## Canonical class order (`--sort`)

`layout → position → display → flex/grid → sizing → border → spacing → typography → colors → effects → transitions → transforms → interactivity → a11y → variants`

```
// before
className="text-sm bg-red-500 flex h-10 w-full p-4 rounded"

// after
className="flex h-10 w-full rounded p-4 text-sm bg-red-500"
```

Variants (`hover:`, `sm:`, `focus:`) are sorted after base classes, with responsive breakpoints before state variants.

## Deduplication (`--dedup`)

### Exact duplicates and conflicts

```
flex flex flex         → flex
flex block             → block  (last wins)
relative absolute      → absolute
```

### Padding / margin shorthand collapse

```
px-4 py-4  → p-4
p-4 px-2   → py-4 px-2
pt-2 pb-2  → py-2
pl-4 pr-4  → px-4
mx-4 my-4  → m-4
```

### Border shorthand collapse

```
border-t-2 border-b-2 border-l-2 border-r-2  → border-2
border-t-2 border-b-2                          → border-y-2
border-l-4 border-r-4                          → border-x-4
```

### Inset shorthand collapse

```
top-4 right-4 bottom-4 left-4  → inset-4
top-4 bottom-4                  → inset-y-4
left-2 right-2                  → inset-x-2
```

## Arbitrary value detection (`--fix`)

| Arbitrary | Canonical | Notes |
|---|---|---|
| `text-[12px]` | `text-xs` | Built-in |
| `text-[0.75rem]` | `text-xs` | rem values |
| `h-[64px]` | `h-16` | Spacing scale ÷4 |
| `w-[50%]` | `w-1/2` | Percentage fractions |
| `opacity-[0.5]` | `opacity-50` | Opacity scale |
| `text-[11px]` | `text-2xs` | Custom token |

Non-divisible values (`h-[22px]`, `px-[7px]`) are left untouched.

## Config

Create `tailwind-canonical.config.js` at the root:

```js
export default {
  customTextTokens: {
    10: '3xs',
    11: '2xs',
    13: 'xxs',
  },
  customSpacingTokens: {
    14: '3.5',
  },
}
```

`customTextTokens` merges with the built-in text size map. `customSpacingTokens` supplements the default ÷4 spacing logic.

## ESLint plugin

```js
// eslint.config.js
import tailwindCanonical from 'tailwind-canonical/eslint'

export default [
  {
    plugins: { 'tailwind-canonical': tailwindCanonical },
    rules: {
      'tailwind-canonical/no-arbitrary-canonical': 'warn',
      // Optional: flag tailwind-merge conflicts (requires tailwind-merge peer dep)
      'tailwind-canonical/no-conflicting-classes': 'warn',
    },
  },
]
```

## Pre-commit hook (Husky / Lefthook)

```bash
# Lefthook: lefthook.yml
pre-commit:
  commands:
    tailwind:
      glob: "src/**/*.{tsx,jsx}"
      run: npx tailwind-canonical --fix --dedup --sort {staged_files}
      stage_fixed: true
```

```bash
# Husky: .husky/pre-commit
npx tailwind-canonical --fix --dedup --sort ./src ./app
```

## Programmatic API

```ts
import {
  suggestCanonical,   // pure: class string → suggestion or null
  analyzeFile,        // find non-canonical classes in a file
  fixFile,            // apply --fix in-place
  deduplicateClasses, // pure: deduplicate a class string
  dedupeFile,         // apply --dedup in-place
  sortClasses,        // pure: sort a class string
  sortFile,           // apply --sort in-place
  mergeFile,          // apply --merge in-place (requires tailwind-merge)
  scanFiles,          // recursive file scanner
} from 'tailwind-canonical'
```

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

# Glob patterns (quote to prevent shell expansion)
npx tailwind-canonical 'src/**/*.tsx'
npx tailwind-canonical 'src/**/*.{tsx,ts}'
npx tailwind-canonical 'src/**/*.tsx' '!src/generated/**'

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

# Cross-file consistency analysis
npx tailwind-canonical --analyze ./src

# Watch mode: re-run on every file save
npx tailwind-canonical --watch --fix --sort ./src

# Structured output for CI (check mode only)
npx tailwind-canonical --reporter json ./src
npx tailwind-canonical --reporter sarif ./src
```

## What each flag does

| Flag | What it fixes | Example |
|---|---|---|
| `--fix` | Arbitrary values → canonical tokens | `text-[12px]` → `text-xs` |
| `--dedup` | Redundant classes, conflicts, shorthand collapse | `flex block` → `block`, `px-4 py-4` → `p-4`, `border-t-2 border-b-2` → `border-y-2` |
| `--sort` | Canonical class order | `text-sm flex p-4` → `flex p-4 text-sm` |
| `--merge` | tailwind-merge conflict resolution | `bg-red-500 bg-blue-500` → `bg-blue-500` |
| `--analyze` | Cross-file consistency (color variants, scale drift, repeated patterns) | `Warning: 3 red color variants used for text: text-red-500, text-rose-500, text-red-600` |
| `--watch` | Re-run on every file save (debounced 50ms) | `[12:34:01] src/Button.tsx — 2 changes applied` |
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

## Typo detection (`--typos`)

Flags likely misspelled Tailwind color names (Levenshtein distance 1, low false-positive bias). Read-only.

```bash
npx tailwind-canonical --typos ./src
#   src/Card.tsx:3:17  text-gry-500 → text-gray-500 [typo]
#   src/Nav.tsx:8:12   bg-slte-100 → bg-slate-100 [typo]
```

Only color-property classes (`text-`, `bg-`, `border-`, …) are checked. Valid colors, non-color utilities (`text-center`), custom colors (`bg-brand-500`), and arbitrary values are never flagged. Pairs with `--reporter json`; exits `1` on findings.

## Suppression comments

Skip specific lines or blocks from check and all transforms (`--fix`, `--dedup`, `--merge`, `--sort`):

```jsx
{/* tailwind-canonical-disable-next-line */}
<div className="text-[13px]" />        {/* left untouched */}

{/* tailwind-canonical-disable */}
<div className="text-[13px] p-[7px]" /> {/* whole block untouched */}
<div className="m-[9px]" />
{/* tailwind-canonical-enable */}
```

The pragmas are matched as substrings, so any comment style works (`//`, `/* */`, `{/* */}`).

## Cross-file consistency (`--analyze`)

Detects semantic inconsistencies visible only at project scale — it never modifies files.

```bash
npx tailwind-canonical --analyze ./src
# Warning: 3 red color variants used for text: text-red-500 (4), text-rose-500 (1), text-red-600 (2)
# Warning: px inconsistency: px-4 (8 files) vs px-3 (2 files)
# Warning: z inconsistency: z-[100] (3 files) vs z-[200] (1 file) vs z-[50] (2 files)
```

Three detectors:

| Detector | What it flags |
|---|---|
| Color variants | Multiple shades/colors of the same hue family used for one property (`text`, `bg`, `border`, …) |
| Scale inconsistency | Competing values for the same spacing / `gap` / `z` property across files |
| Repeated patterns | Identical class combinations recurring across 3+ files |

Pairs with `--reporter json` for machine-readable output. Exits `1` when any inconsistency is found.

```bash
npx tailwind-canonical --analyze --reporter json ./src
```
```json
{
  "filesAnalyzed": 42,
  "colorVariants": [
    { "property": "text", "family": "red",
      "variants": [
        { "token": "red-500", "count": 4, "files": ["src/Alert.tsx"] },
        { "token": "rose-500", "count": 1, "files": ["src/Toast.tsx"] }
      ] }
  ],
  "scaleInconsistencies": [
    { "property": "px",
      "values": [
        { "value": "4", "count": 8, "files": ["src/Button.tsx"] },
        { "value": "3", "count": 2, "files": ["src/IconButton.tsx"] }
      ] }
  ],
  "combinations": []
}
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

### Custom order (`sortOrder`)

Override the category order via config. Categories you omit (and unknown classes) sort to the end, preserving their original relative order. Variants are always sorted after base classes regardless of order.

```js
// tailwind-canonical.config.js
export default {
  sortOrder: [
    'display',
    'position',
    'sizing',
    'spacing',
    'border',
    'typography',
    'colors',
    'effects',
  ],
}
```

Valid category names: `layout`, `position`, `inset`, `display`, `flex-grid`, `sizing`, `border`, `spacing`, `typography`, `colors`, `effects`, `transitions`, `transforms`, `interactivity`, `accessibility`. Omit `sortOrder` to use the default order above.

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
  },
  customSpacingTokens: {
    14: '3.5',
  },
  // Support non-React attribute patterns (default: ['className'])
  attributeNames: ['className', 'class', ':class', 'tw'],
  // Support utility function wrappers
  functionNames: ['cn', 'clsx', 'cva'],
  // Never suggest replacements for classes matching these patterns
  ignorePatterns: [/^font-/, /-\[var\(/],
}
```

`customTextTokens` merges with the built-in text size map. `customSpacingTokens` supplements the default ÷4 spacing logic. `ignorePatterns` makes `suggestCanonical` skip matching classes everywhere — CLI, analyzer, and the ESLint plugin.

`attributeNames` controls which HTML/JSX attributes are scanned (default: `['className']`). Use `['class']` for plain HTML/PHP/Jinja templates, `[':class']` for Vue, `['tw']` for styled-components.

`functionNames` enables scanning inside utility function calls like `cn(...)` and `clsx(...)`.

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

```yaml
# Lefthook: lefthook.yml
pre-commit:
  parallel: true
  commands:
    tailwind:
      glob: "src/**/*.{tsx,jsx}"
      run: npx tailwind-canonical --fix --dedup --sort {staged_files}
      stage_fixed: true
    lint:
      glob: "src/**/*.{ts,tsx,js,jsx,json}"
      run: npx biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true
```

```bash
# Husky: .husky/pre-commit
npx tailwind-canonical --fix --dedup --sort ./src ./app
```

## Dead code detection (knip)

```bash
pnpm knip
```

Detects unused exports, files, and dependencies. Config in `knip.json`.

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
  scanFiles,          // recursive file scanner (sync, dir/file targets)
  resolveTargets,     // async glob resolver with negation + brace expansion
} from 'tailwind-canonical'
```

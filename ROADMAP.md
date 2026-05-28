# Roadmap

## v0.1 — Arbitrary → Canonical (current)

Goal: flag and auto-fix Tailwind arbitrary pixel values that have a canonical equivalent.

- [x] CLI: `tailwind-canonical check ./src`
- [x] CLI: `tailwind-canonical --fix ./src`
- [x] Config: `tailwind-canonical.config.js` for custom tokens
- [x] ESLint plugin: `tailwind-canonical/no-arbitrary-canonical`
- [ ] Tests (unit + integration)
- [ ] CI (GitHub Actions)
- [ ] npm publish

**Rules in v0.1:**
- `text-[12px]` → `text-xs`, `text-[14px]` → `text-sm`, etc.
- `h-[64px]` → `h-16` (spacing ÷ 4)
- `rounded-[8px]` → `rounded-lg`

---

## v0.2 — rem + % + opacity support ✅

- [x] `text-[0.75rem]` → `text-xs`
- [x] `h-[4rem]` → `h-16`
- [x] `w-[50%]` → `w-1/2`
- [x] `w-[33.333%]` → `w-1/3`
- [x] `opacity-[0.5]` → `opacity-50`

---

## v0.3 — Class deduplication

Goal: detect redundant class combinations.

- `p-4 px-4` → `px-4 py-4` (px overrides p on x axis)
- `text-sm text-sm` → `text-sm` (exact duplicate)
- `m-4 mx-2` → `mx-2 my-4` (partial override)
- `flex block` → `block` (conflicting display)

---

## v0.4 — Class merging (shorthand)

Goal: collapse multiple directional utilities into shorthands.

- `pt-2 pb-2` → `py-2`
- `pl-4 pr-4` → `px-4`
- `mx-4 my-4` → `m-4`
- `border-t-2 border-b-2 border-l-2 border-r-2` → `border-2`

---

## v0.5 — Class sorting

Goal: enforce canonical class order without Prettier.

Order: layout → position → display → sizing → spacing → typography → colors → effects → variants

```
// before
className="text-sm bg-red-500 flex h-10 w-full p-4 rounded"

// after
className="flex h-10 w-full rounded p-4 text-sm bg-red-500"
```

- Works with Tailwind v4 (no config file needed)
- `--fix` rewrites class order in-place
- ESLint rule with autofix

---

## v1.0 — Full linter

- Biome plugin (GritQL, when stable)
- VS Code extension
- `// tailwind-canonical-disable` inline suppression
- `--reporter json` for CI integrations
- Watch mode: `tailwind-canonical --watch ./src`

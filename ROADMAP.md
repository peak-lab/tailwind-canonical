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

## v0.3 — Class deduplication ✅

Goal: detect redundant class combinations.

- [x] `p-4 px-4` → `p-4` (shorthand collapse via expand-apply-collapse)
- [x] `p-4 px-2` → `py-4 px-2` (partial override)
- [x] `text-sm text-sm` → `text-sm` (exact duplicate)
- [x] `m-4 mx-2` → `my-4 mx-2` (partial override)
- [x] `flex block` → `block` (conflicting display, last wins)
- [x] `relative absolute` → `absolute` (conflicting position, last wins)

---

## v0.4 — Class merging (shorthand) ✅

Goal: extend the expand-apply-collapse algorithm to all directional utility families.

- [x] `border-t-2 border-b-2 border-l-2 border-r-2` → `border-2`
- [x] `border-t-2 border-b-2` → `border-y-2`
- [x] `border-l-4 border-r-4` → `border-x-4`
- [x] `top-4 right-4 bottom-4 left-4` → `inset-4`
- [x] `top-4 bottom-4` → `inset-y-4`
- [x] `left-2 right-2` → `inset-x-2`

---

## v0.5 — Class sorting ✅

Goal: enforce canonical class order without Prettier.

Order: layout → position → display → flex/grid → sizing → border → spacing → typography → colors → effects → transitions → transforms → interactivity → a11y → variants

```
// before
className="text-sm bg-red-500 flex h-10 w-full p-4 rounded"

// after
className="flex h-10 w-full rounded p-4 text-sm bg-red-500"
```

- [x] `--sort` flag rewrites class order in-place
- [x] Stable sort (preserves relative order within same category)
- [x] Variants (hover:, sm:) sorted after base classes, responsive before state

---

## v1.0 — Full linter

- Biome plugin (GritQL, when stable)
- VS Code extension
- `// tailwind-canonical-disable` inline suppression
- `--reporter json` for CI integrations
- Watch mode: `tailwind-canonical --watch ./src`

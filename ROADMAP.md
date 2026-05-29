# Roadmap

## v0.1 — Arbitrary → Canonical ✅
- [x] `text-[12px]` → `text-xs`, `h-[64px]` → `h-16`, `rounded-[8px]` → `rounded-lg`
- [x] CLI `--fix`, ESLint plugin `no-arbitrary-canonical`, config file

## v0.2 — rem + % + opacity ✅
- [x] `text-[0.75rem]` → `text-xs`, `h-[4rem]` → `h-16`
- [x] `w-[50%]` → `w-1/2`, `opacity-[0.5]` → `opacity-50`

## v0.3 — Class deduplication ✅
- [x] `p-4 px-4` → `p-4`, `p-4 px-2` → `py-4 px-2`
- [x] `text-sm text-sm` → `text-sm`, `flex block` → `block`

## v0.4 — Extended shorthand collapse (border, inset) ✅
- [x] `border-t-2 border-b-2 border-l-2 border-r-2` → `border-2`
- [x] `top-4 right-4 bottom-4 left-4` → `inset-4`
- [x] Generic `BoxFamily` system (extensible)

## v0.5 — Class sorting ✅
- [x] `--sort` flag: layout → position → display → flex/grid → sizing → border → spacing → typography → colors → effects → variants
- [x] Stable sort, responsive before state variants

---

## v0.6 — Extended BoxFamily (gap, rounded, scroll)

- [ ] `gap-x-4 gap-y-4` → `gap-4`, `gap-4 gap-x-2` → `gap-y-4 gap-x-2`
- [ ] `rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-lg` → `rounded-lg`
- [ ] `rounded-tl-lg rounded-tr-lg` → `rounded-t-lg`
- [ ] `scroll-pt-4 scroll-pb-4` → `scroll-py-4` (scroll-p/m families)

---

## v0.7 — cn()/clsx() function call support

Goal: analyze string literals inside utility function calls — the dominant pattern in modern React.

- [ ] `cn('flex p-4', 'text-sm')` → `--fix`, `--dedup`, `--sort` all work
- [ ] Configurable function names: `functionNames: ['cn', 'clsx', 'cx', 'tv', 'cva']`
- [ ] ESLint rule support for cn()/clsx() literals

---

## v0.8 — CI/DX improvements

- [ ] `--reporter json` — structured output for GitHub Actions / Reviewdog
- [ ] Glob pattern support: `tailwind-canonical 'src/**/*.tsx' '!src/generated/**'`
- [ ] Inline suppression: `// tailwind-canonical-disable-next-line`
- [ ] `--watch` mode for development workflow

---

## v0.9 — Responsive cascade collapse

Goal: remove redundant responsive variants (Tailwind mobile-first cascade semantics).

- [ ] `sm:p-4 md:p-4 lg:p-4` → `p-4` (all breakpoints identical = use base)
- [ ] `sm:p-6 md:p-6` → `sm:p-6` (md inherits from sm via cascade)
- [ ] `p-4 sm:p-4` → `p-4` (sm: redundant when matches base)

---

## v1.0 — Full ecosystem

- [ ] Configurable attribute names: `attributeNames: ['className', 'class', ':class', 'tw']`
- [ ] Configurable sort order in `tailwind-canonical.config.js`
- [ ] VS Code extension (hover preview, inline fix)
- [ ] Biome plugin (GritQL, when stable)
- [ ] Cross-file consistency analysis (flag 3 different red shades for same intent)
- [ ] `// tailwind-canonical-disable` block suppression
- [ ] Unknown class detection (typo: `text-gry-500`)

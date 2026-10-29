# Roadmap

Text-size mappings listed below are historical capabilities. They now require
`allowTextSizeLineHeightChanges: true`; the default preserves text line-height.

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

## v0.6 — Extended BoxFamily (gap, rounded, scroll) ✅
- [x] `gap-x-4 gap-y-4` → `gap-4`, `gap-4 gap-x-2` → `gap-y-4 gap-x-2`
- [x] `rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-lg` → `rounded-lg`
- [x] `rounded-tl-lg rounded-tr-lg` → `rounded-t-lg`
- [x] `scroll-pt-4 scroll-pb-4` → `scroll-py-4` (scroll-p/m families)

## v0.7 — cn()/clsx() function call support ✅
- [x] `cn('flex p-4', 'text-sm')` → `--fix`, `--dedup`, `--sort` all work
- [x] Configurable function names: `functionNames: ['cn', 'clsx', 'cx', 'tv', 'cva']`
- [x] ESLint rule support for cn()/clsx() literals — #42

## v0.8 — CI/DX improvements ✅
- [x] `--reporter json` (+ `sarif`) — structured output for CI
- [x] Glob pattern support with negation + brace expansion
- [x] `--watch` mode for development workflow
- [x] Inline suppression: `// tailwind-canonical-disable-next-line` — #44

## v0.9 — Responsive cascade collapse ✅
- [x] `sm:p-4 md:p-4 lg:p-4` → `p-4` (all breakpoints identical = use base)
- [x] `sm:p-6 md:p-6` → `sm:p-6` (md inherits from sm via cascade)
- [x] `p-4 sm:p-4` → `p-4` (sm: redundant when matches base)

## v1.0 — Full ecosystem (in progress)
- [x] `--check` dry-run, `init` command, upward config resolution — #102, #103, #104
- [x] `tailwindVersion: 3` gating (no v4-only classes on v3)
- [x] Configurable CLI defaults (`defaultCommand`)
- [x] Configurable attribute names: `attributeNames: ['className', 'class', ':class', 'tw']`
- [x] Configurable sort order in `tailwind-canonical.config.js`
- [x] Cross-file consistency analysis (`--analyze`) — flag N shades for same intent
- [x] Block suppression: `// tailwind-canonical-disable` … `enable` — #44
- [x] Typo detection for color names (`text-gry-500`, `--typos`) — #45
- [ ] VS Code extension (hover preview, inline fix)
- [ ] Biome plugin (GritQL, when stable)

---

## Rule coverage (next)

Arbitrary values that still have no canonical suggestion:
- [x] Variants, important modifier and negative sign (`hover:p-[16px]`, `!p-[16px]`, `-mt-[8px]`) — #143
- [x] Rounded map is version-dependent (`rounded-[2px]` → `rounded-xs` on v4) — #144
- [x] Keyword values: `w-full`, `h-screen`, `rounded-full`, `aspect-video`, unitless zero — #145
- [x] 1px widths: `border`, `border-t`, `p-px`, `ring-1`, `outline-2` — #146
- [x] Unitless scales: `z-10`, `font-bold`, `leading-6`, `order-1`, `line-clamp-3` — #147
- [x] Transitions/transforms: `duration-200`, `scale-105`, `rotate-45`, `blur-*` — #148

---

## Hardening backlog ✅

Quality / robustness work tracked as issues (not version-gated):
- [x] Validate user config + stop swallowing load errors — #38
- [x] Refactor CLI into testable `run()` — #39
- [x] File I/O error handling + watch re-entrancy — #40
- [x] Multiline / template-literal / escaped-quote extraction — #41
- [x] ESLint schema aligned with `Config` + ignorePatterns — #42
- [x] analyzer + cli test coverage — #43
- [x] Share color/scale lexicons, config-extensible — #46
- [x] Linear dedupe + document gap family — #47

### Shipped fixes (v0.2.1)
- [x] Remove non-existent `xxs` text token — #37
- [x] ESLint autofix no longer corrupts classes (substring collision) — #35
- [x] Unify class extraction so `check` and `fix` agree — #36

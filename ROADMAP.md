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

## v0.6 — Extended BoxFamily (gap, rounded, scroll) ✅
- [x] `gap-x-4 gap-y-4` → `gap-4`, `gap-4 gap-x-2` → `gap-y-4 gap-x-2`
- [x] `rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-lg` → `rounded-lg`
- [x] `rounded-tl-lg rounded-tr-lg` → `rounded-t-lg`
- [x] `scroll-pt-4 scroll-pb-4` → `scroll-py-4` (scroll-p/m families)

## v0.7 — cn()/clsx() function call support ✅
- [x] `cn('flex p-4', 'text-sm')` → `--fix`, `--dedup`, `--sort` all work
- [x] Configurable function names: `functionNames: ['cn', 'clsx', 'cx', 'tv', 'cva']`
- [ ] ESLint rule support for cn()/clsx() literals — #42

## v0.8 — CI/DX improvements ✅
- [x] `--reporter json` (+ `sarif`) — structured output for CI
- [x] Glob pattern support with negation + brace expansion
- [x] `--watch` mode for development workflow
- [ ] Inline suppression: `// tailwind-canonical-disable-next-line` — #44

## v0.9 — Responsive cascade collapse ✅
- [x] `sm:p-4 md:p-4 lg:p-4` → `p-4` (all breakpoints identical = use base)
- [x] `sm:p-6 md:p-6` → `sm:p-6` (md inherits from sm via cascade)
- [x] `p-4 sm:p-4` → `p-4` (sm: redundant when matches base)

## v1.0 — Full ecosystem (in progress)
- [x] Configurable attribute names: `attributeNames: ['className', 'class', ':class', 'tw']`
- [x] Configurable sort order in `tailwind-canonical.config.js`
- [x] Cross-file consistency analysis (`--analyze`) — flag N shades for same intent
- [ ] Block suppression: `// tailwind-canonical-disable` … `enable` — #44
- [ ] Unknown class detection (typo: `text-gry-500`) — #45
- [ ] VS Code extension (hover preview, inline fix)
- [ ] Biome plugin (GritQL, when stable)

---

## Hardening backlog

Quality / robustness work tracked as issues (not version-gated):
- [ ] Validate user config + stop swallowing load errors — #38
- [ ] Refactor CLI into testable `run()` — #39
- [ ] File I/O error handling + watch re-entrancy — #40
- [ ] Multiline / template-literal / escaped-quote extraction — #41
- [ ] ESLint schema aligned with `Config` + ignorePatterns — #42
- [ ] analyzer + cli test coverage — #43
- [ ] Share color/scale lexicons, config-extensible — #46
- [ ] Linear dedupe + document gap family — #47

### Shipped fixes (v0.2.1)
- [x] Remove non-existent `xxs` text token — #37
- [x] ESLint autofix no longer corrupts classes (substring collision) — #35
- [x] Unify class extraction so `check` and `fix` agree — #36

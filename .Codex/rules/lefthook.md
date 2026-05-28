# Lefthook Rules

## Proactive Behavior

Hooks are installed via `pnpm install` (the `prepare` script runs `lefthook install`).
Never bypass them — `git commit --no-verify` or `git push --no-verify` is forbidden
unless the user explicitly asks for it.

## Pre-Commit

Runs in parallel on staged files:

- **biome** — `biome check --write` on staged `src/**` files (auto-stages fixes via `stage_fixed: true`)
- **typecheck** — `tsc --noEmit` (full repo, no glob filter beyond the trigger)

A failure blocks the commit. Fix the root cause, re-stage, retry.

## Pre-Push

- **test** — full `pnpm test` suite (61 tests, ~1s)

## Modifying Hooks

Edit `lefthook.yml`. After changes, run `pnpm exec lefthook install` to sync `.git/hooks/`.
Test before committing:

```bash
pnpm exec lefthook run pre-commit --all-files
pnpm exec lefthook run pre-push
```

## Why `prepare` Uses `|| true`

Lefthook needs the binary installed before `prepare` runs. On fresh CI clones the script
should not fail the install — `|| true` ensures `pnpm install` succeeds even if the hook
install step fails (CI does not need git hooks anyway).

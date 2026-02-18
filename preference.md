# Preference Profile

## Profile Name
- `high-autonomy-secure`

## Collaboration Style
- Hands-off by default.
- Agent drives implementation end-to-end and reports outcome.
- Agent should avoid unnecessary confirmation prompts during normal development work.

## Approval Boundaries
- Ask before deploy.
- Ask before production-impacting changes.
- Ask before destructive operations.

## Security Priorities
- Prevent all secret leakage to public repositories.
- Never commit `.env` files, tokens, API keys, credentials, or other sensitive values.
- Review staged/changed files for accidental secrets before finalizing.
- Keep sensitive values redacted in logs, screenshots, and shared output.
- Flag risky security patterns and propose safer alternatives.

## Quality Bar
- Prefer correctness, maintainability, and clear implementation over clever shortcuts.
- Run relevant validation checks when possible (lint/tests/type checks).
- Summarize outcomes with notable risks and follow-up actions.

## Project-Specific Rules
- Run `npm run test` and `npm run build` before finalizing changes.
- If available, also run `npm run lint` and `npm run typecheck`.
- Do not proceed with failed required checks unless explicitly approved.
- Never run `prisma db push` against production.
- Ask before migrations that alter existing tables or data.
- Require a rollback plan for schema changes.
- Never commit `.env*` files (except `.env.example`) or any secret values.
- Run secret checks on changed files before finalizing (for example `gitleaks`).
- Validate untrusted API input with `zod` at request boundaries.
- Do not expose stack traces, SQL details, or sensitive internals in client errors.
- Treat meal planner user/family/grocery data as sensitive and redact logs by default.
- Require review for new dependencies and prefer minimal, maintained packages.
- Avoid over-fetching and unnecessary renders; keep queries bounded and index-aware.
- For UI-heavy work, run Lighthouse or Web Vitals checks when feasible.

## Live Monitoring & Proactive Fixing
- Watch scope is errors only: runtime exceptions, failed API route execution, build failures, typecheck failures, and test failures.
- Do not auto-fix non-blocking lint/performance hints or warnings unless they are promoted to errors or explicitly requested.
- Use batched remediation windows every 20-30 minutes instead of per-error patching.
- Do not interrupt the user's active local dev server; run verification and watcher jobs separately.
- Default auto-fix surface is application code and tests only: `app/`, `components/`, `lib/`, `hooks/`, and test files.
- Ask before dependency, config, or toolchain churn when it is not strictly required for a blocking fix.

### Execution Preference
- Prefer repo-native watch scripts over ad-hoc one-off session commands.
- Continue honoring approval gates for deploy, production-impacting changes, and destructive operations.

### Preference Contract Directives
- `watch_scope=errors_only`
- `fix_cadence=batch_20_30m`
- `dev_server_policy=separate_port`
- `workflow=repo_watch_scripts`
- `auto_fix_surface=app_and_tests`

### Known Baseline Blockers
- Typecheck currently fails in `/Users/rtubbs/Dev/meal-planner/components/ui/chart.tsx`.
- Typecheck currently fails in `/Users/rtubbs/Dev/meal-planner/components/ui/resizable.tsx`.
- Lint currently has warnings only (no blocking errors).
- A local `next dev` process is running on port `3000` (PID `98168`); parallel starts in the same repo can hit `.next/dev/lock`.

## Build Scripts & Process
- Canonical scripts are defined in `/Users/rtubbs/Dev/meal-planner/package.json` and should be used consistently:
  - `npm run dev`
  - `npm run build`
  - `npm run start`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run db:generate`
  - `npm run db:migrate`
  - `npm run db:push`
- Standard local validation process before finalizing code:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Do not interrupt a user-owned active dev server process; run verification commands separately.
- For database work, run `npm run db:generate` after schema changes and use migrations intentionally. Never run `db:push` against production.

## Git Ignore Enforcement
- Keep local/test artifacts and non-public automation files excluded by default in `.gitignore`.
- Exclude Playwright artifacts: `.playwright/`, `.playwright-cli/`, `playwright-report/`, and `test-results/`.
- Exclude workflow files by default for this repo: `.github/workflows/`.
- If a file was already tracked before adding ignore rules, untrack it with `git rm --cached` so ignore rules take effect.

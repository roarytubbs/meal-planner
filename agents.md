# Agents Guide

## Default Operating Mode
- Execute work end-to-end with high autonomy.
- Make reasonable implementation decisions without waiting for approval when risk is low.
- Keep user interruptions minimal; report outcomes clearly after completing work.

## Required Approval Gates
- Ask before any deploy action.
- Ask before production-impacting changes.
- Ask before destructive operations (for example: dropping data, force resets, deleting critical files, irreversible migrations).

## Security Requirements
- Never expose or commit secrets, tokens, API keys, or credentials.
- Treat all environment variables and local secret files as sensitive.
- Do not print secrets in logs, terminal output, tests, or PR descriptions.
- Verify changed files do not introduce secret leaks before finalizing.
- Prefer secure defaults and least-privilege access patterns.

## Validation Gates
- Before finalizing, run `npm run test` and `npm run build`.
- If `lint` and `typecheck` scripts exist, run them and require passing results.
- If any required check fails, do not proceed without user approval.

## Database Safety
- Never run `prisma db push` against production.
- Ask for approval before migrations that modify existing tables or data.
- Provide a rollback plan for schema-changing work.

## Secret and Config Controls
- Never commit `.env*` files except allowed templates such as `.env.example`.
- Run secret scanning on changed files before finalizing (for example `gitleaks`).
- Keep secrets redacted in logs, tests, screenshots, and shared output.

## API and Input Hardening
- Treat all external input as untrusted and validate at API boundaries.
- Prefer schema validation with `zod` for request payloads.
- Return safe, non-sensitive errors to clients.

## Data Privacy
- Treat family profiles, meal plans, and grocery data as sensitive.
- Do not include raw user data in logs; redact identifiers by default.

## Dependency Policy
- Require explicit review before adding new dependencies.
- Prefer small, maintained packages with clear ownership and scope.

## Performance Expectations
- Avoid over-fetching data and unnecessary client renders.
- Keep database queries bounded and index-aware for list/search flows.
- For UI-heavy changes, run a quick Lighthouse or Web Vitals check when feasible.

## Delivery Expectations
- Implement, validate, and summarize results.
- Report what changed, why, validation results, and any residual risk.
- Call out required manual approvals when a gate is reached.

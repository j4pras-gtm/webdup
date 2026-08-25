# Sidekikz Builder

A meta-builder that turns a user-supplied reference URL into a rebranded static site preview hosted on a Sidekikz-controlled subdomain (`<project-slug>.app.sidekikz.com`).

Work is organized as **micro-builds** (B00–B08 foundation, then P1–P8 parallel lane). Each build is isolated: it has its own folder, status file, QA gate, and escalation path. A failure in one build never blocks another.

## Build policy (every build)

- **Max 5 attempts OR 5 minutes wall-clock**, whichever comes first.
- QA gate must pass before a build is marked `completed`.
- On exhaustion the build escalates to `manual_review/<build-id>/` with a dossier (`context.json`, `REVIEW.md`) and stops — it does not silently fail or block other builds.
- Every outcome is appended to `history/build_history.jsonl` for chat-switch continuity.

## Layout

```text
sidekikz-builder/
├── apps/
│   ├── builder/          # build runners (run-b00.js = bootstrap)
│   ├── dashboard/        # status dashboard (future)
│   └── preview-router/   # *.app.sidekikz.com routing (future)
├── packages/
│   ├── engine/           # runBuild(): retry cap, deadline, escalation
│   ├── contracts/        # JSON schemas + validator + mock fixtures
│   └── template/         # site template components (future)
├── jobs/                 # one folder per job/build (status.json, outputs/, qa/, logs/)
├── manual_review/        # escalation dossiers for blocked builds
├── history/              # build_history.jsonl, Session_summary.md, decision_log.md, checkpoints
├── exports/              # final static-site exports (gitignored)
└── qa/checks/            # reusable QA scripts; each returns {passed, checks_run, failures[]}
```

## Status model

`pending → in_progress → completed` (QA passed) or `in_progress → blocked_manual_review` (5 attempts / 5 min exhausted).

## Running builds

```bash
# Bootstrap (idempotent — safe to re-run)
node apps/builder/run-b00.js

# Verify core modules load
node -e "require('./packages/engine'); require('./packages/contracts'); console.log('ok')"
```

No external dependencies — plain Node.js (tested on Node 24).

## Contracts

Schemas live in `packages/contracts/schemas/` (job, build-status, build-result, brand, qa-report, manual-review). Mock fixtures carry `"mock": true` so downstream builds know to re-check against real output once the corresponding build runs.

## History & resuming

- `history/context_resume.md` — where the queue stands right now.
- `history/build_history.jsonl` — append-only event log (last line = latest).
- `history/Session_summary.md` — human-readable session handoff.
- `history/decision_log.md` — why decisions were made.

To resume after a chat switch: read `context_resume.md`, then the last line of `build_history.jsonl`, then the relevant `jobs/<build>/BUILD.md`.

## Current state

B00-bootstrap **completed** (attempt 1, all QA gates passed). Queue is idle, waiting for a reference URL to start B01-intake.

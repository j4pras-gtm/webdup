# Sidekikz Builder

A site-agnostic reconstruction engine that turns an authorized reference website into a **rebrandable, locally viewable, portable website artifact**.

The engine **understands** the source before it reproduces it. Deployment is *not* part of the engine — the artifact is portable and can later be delivered through optional adapters (local preview, ZIP/static export, GitHub-ready project, owned domain, Sidekikz-hosted page, or a downstream builder).

## Architecture (three phases)

```text
REFERENCE SITE
   ↓
PHASE 1 — ANALYZE        A01–A13 micro-builds → analysis package
   ↓
HITL REVIEW GATE         user confirms / narrows scope (confirmation record)
   ↓
PHASE 2 — EXTRACT        E01–E08 → confirmed reusable assets + replacement inputs
   ↓
PHASE 3 — BUILD          B01–B10 → portable static site
   ↓
PORTABLE ARTIFACT        exports/<slug>/  (locally viewable)
   ↓
OPTIONAL DELIVERY ADAPTER (local / download / repo / hosted / downstream)
```

Primary principle: **analyze first, extract second, build third.** The builder only generates what the confirmed analysis represents — it never fabricates missing UI, routes, content, or interactions.

Full specification: [`docs/product-spec-revised.md`](docs/product-spec-revised.md).
Current-vs-revised comparison: [`docs/gap-analysis-2026-08-26.md`](docs/gap-analysis-2026-08-26.md).

## Recon model (v2, 2026-08-27)

The *means* of Phase 1 is **agent-driven**: the frontier model picks its own tools (HTTP fetch, JS-bundle reading, API/RPC discovery, browser automation) and explores until every schema'd artifact is filled with evidence. The engine's durable value is the **governance shell** — contracts, QA gates, count consistency, anti-fabrication, HITL gate, history/escalation, portable artifact — not fixed DOM regexes.

Key addition: the recon must produce a **`data-source-decision.json`** for each content collection — where the complete data lives (DOM window vs. API/RPC), the exact endpoint, a field map, and a *verified* row count from an actual call. At the HITL gate the user approves which sources to extract through, opts in to PII per source, and accepts/declines generated route families (e.g. one detail page per data row). Extraction then fetches through approved endpoints only; prose stays placeholder regardless of source.

Protocol: [`docs/RECON.md`](docs/RECON.md). Proven end-to-end on monthlystaff.com: 272-profile directory extracted via one verified Supabase RPC call, 274 talent pages generated, full B01–B10 + QA green (`jobs/job-002`).

## Build policy (every micro-build)

- **Max 5 attempts OR 5 minutes wall-clock**, whichever comes first.
- QA gate must pass before a build is marked `completed`.
- On exhaustion the build escalates to `manual_review/<build-id>/` with a full dossier (`REVIEW.md`, `context.json`, `attempts.md`, `error.log`, `files_touched.txt`, `diff.patch`, `expected_output.md`, `artifacts/`) and stops — it does not silently fail or block other builds.
- Every outcome is appended to `history/build_history.jsonl` for chat-switch continuity.

## Layout

```text
sidekikz-builder/
├── apps/
│   ├── builder/          # build runners (bootstrap, per-job generators)
│   └── dashboard/        # status dashboard (future)
├── packages/
│   ├── engine/           # runBuild(): retry cap, deadline, QA hook, escalation
│   ├── contracts/        # JSON schemas + validator + mock fixtures
│   └── template/         # reusable site components (future)
├── jobs/                 # one folder per job; each job holds its A/E/B builds
│   └── <job_id>/
│       ├── job.json      # source URL, slug, brand, state
│       ├── analysis/     # Phase 1 outputs (sitemap, link graph, wireframes, …)
│       ├── extraction/   # Phase 2 outputs (confirmed assets, placeholder schema)
│       ├── builds/       # per-build folders: BUILD.md, status.json, outputs/, qa/, logs/
│       └── qa-report.json
├── manual_review/        # escalation dossiers for blocked builds
├── history/              # build_history.jsonl, Session_summary.md, decision_log.md, checkpoints
├── exports/              # portable build artifacts (gitignored)
├── docs/                 # product spec + gap analysis
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

No external dependencies — plain Node.js (tested on Node 24). Crawler approach: HTTP + DOM analysis first; rendered/browser capture added only where JS behavior requires it (per spec §32, not locked down).

## Contracts

Schemas live in `packages/contracts/schemas/`. Mock fixtures carry `"mock": true` so downstream builds can start before real upstream output exists; when the real output lands, downstream builds re-check for contract drift.

## History & resuming

- `history/context_resume.md` — where the queue stands right now.
- `history/build_history.jsonl` — append-only event log (last line = latest).
- `history/Session_summary.md` — human-readable session handoff.
- `history/decision_log.md` — why decisions were made.

To resume after a chat switch: read `context_resume.md`, then the last line of `build_history.jsonl`, then the relevant build's `BUILD.md`.

## Current state

Revised spec ingested (2026-08-26); gap analysis complete. Restructure in progress: R01-docs → R02-contracts → R03-engine → R04-analyze-builds (A01–A13) → R05-hitl → R06-extract → R07-build → R08-regression. See `history/context_resume.md` for the live queue.

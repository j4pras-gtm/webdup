# Context Resume

Last updated: 2026-08-26T08:55Z

## Current state
- Revised product spec ingested → `docs/product-spec-revised.md` (three-phase model: ANALYZE → HITL → EXTRACT → BUILD → portable artifact + optional delivery adapters).
- §33 comparison pass done → `docs/gap-analysis-2026-08-26.md`.
- job-001-monthlystaff: completed under OLD model; annotated as superseded (violates anti-fabrication + count-consistency rules; kept as regression fixture).

## Next build
- **R01-docs** (pending user approval of execution order in gap-analysis §10):
  rewrite README around portable-artifact model, remove `apps/preview-router/`, annotate job-001.
- Then R02-contracts → R03-engine → R04-analyze-builds (A01–A13) → R05-hitl → R06-extract → R07-build → R08-regression.

## Open decisions (need user)
1. Build dir convention: spec-literal `builds/<build_id>/` vs. current `jobs/<job>/<build>/` (gap-analysis recommends keeping jobs/ grouping).
2. Execution order R01–R08 as proposed?
3. Browser automation / crawler library — deferred per spec §32; start with HTTP+DOM analysis?

## Standing policy
- Max 5 attempts OR 5 minutes per build, then escalate to manual_review/.
- Invariants 1–10 from revised spec are non-negotiable.
- Commit + push after each completed build.

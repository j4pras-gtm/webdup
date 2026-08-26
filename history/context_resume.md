# Context Resume

Last updated: 2026-08-26T09:58Z

## Current state
- Revised product spec ingested → `docs/product-spec-revised.md` (three-phase model: ANALYZE → HITL → EXTRACT → BUILD → portable artifact + optional delivery adapters).
- §33 comparison pass done → `docs/gap-analysis-2026-08-26.md`.
- **R01-docs: COMPLETED** — README rewritten around portable-artifact model; `apps/preview-router/` removed; job-001 scripts + QA annotated as legacy/non-conformant examples; job-001 BUILD.md marked superseded (regression fixture).
- Confirmed decisions: keep `jobs/<job>/<build>/` layout; R01→R08 order approved; crawler = HTTP+DOM first, browser later.

## Next build
- **R02-contracts**: add 15 new schemas + mocks (sitemap, route-inventory, link-graph, redirect-map, dynamic-content-report, wireframe, content-schema, design-tokens, interaction-spec, component-inventory, reusable-assets, placeholder-map, integration-manifest, analysis-package, analysis-confirmation); modify build-status (+phase, +upstream_artifacts) and brand (personalization group); deprecate site_inventory.

## After R02
R03-engine (escalation dossier + QA hook) → R04-analyze-builds (A01–A13) → R05-hitl → R06-extract (E01–E08) → R07-build (B01–B10 + qa/gates library) → R08-regression (re-run monthlystaff.com; new QA must catch job-001's fabricated Load More + 8/272 count gap).

## Standing policy
- Max 5 attempts OR 5 minutes per build, then escalate to manual_review/.
- Invariants 1–10 from revised spec are non-negotiable.
- Commit + push after each completed build.

# Decision Log

### [2026-08-25 17:17 EST] â€” Scaffolding initiated
- Decision: bootstrap project structure with B00 before any site work
- Why: agent must not start work into a missing folder tree
- Impact: all subsequent builds assume this structure exists
- Supersedes: none

## 2026-08-25T22:04:25.266Z
- job-001: ingested monthlystaff.com; built static rebrand "Teamloop" in exports/teamloop/.
- Rebranded palette kept source design language (green #1dbf73 primary, ink #222325, cream #f7f7f2, Inter).
- QA 28/28 passed; no source content leaked (verified by qa/checks/job-001.js).

## 2026-08-26T08:55Z
- Ingested revised product spec (three-phase ANALYZE -> HITL -> EXTRACT -> BUILD + portable artifact / deployment adapters).
- Completed spec section 33 comparison: docs/gap-analysis-2026-08-26.md.
- Decisions pending user: builds/ vs jobs/ dir convention; R01-R08 execution order; crawler approach (deferred per spec 32).


## 2026-08-26T09:58Z
- R01-docs completed: README rewritten (portable artifact, no hosting coupling); apps/preview-router/ removed; job-001 generator/finalizer/QA marked legacy non-conformant examples.
- User confirmed: keep jobs/<job>/<build>/ layout; R01-R08 order approved; HTTP+DOM crawler first.


## 2026-08-26T10:10Z
- R02-contracts completed: 15 new analysis/extract/build contracts with mocks; build-status +phase/+upstream_artifacts; brand +personalization_group; site_inventory deprecated (superseded by sitemap+route-inventory). QA 71/71.


## 2026-08-26T10:25Z
- R03-engine completed: escalate() now writes full spec-29 dossier (REVIEW.md with 8 required sections, context.json, attempts.md, error.log, files_touched.txt, diff.patch, expected_output.md, artifacts/). runBuild() gained mandatory qa hook ù a build cannot be marked completed unless qa returns passed:true; legacy builds without a hook are flagged qa.skipped. QA 30/30.


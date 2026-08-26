# Handoff — Sidekikz Builder (2026-08-26)

**Repo:** `C:\Users\Nithin\OpenWorker\b37e34c0-416\sidekikz-builder` → https://github.com/j4pras-gtm/webdup (public, branch `main`, git identity `j4pras-gtm` / `j4pras@gmail.com`)
**Last commit:** `f2be589` (R07-build-builds). Working tree clean. `manual_review/` empty.

## One-paragraph status

The revised three-phase engine is **fully built and green**: ANALYZE (A01–A13) → HITL gate → EXTRACT (E01–E08) → BUILD (B01–B10) → portable artifact. Every phase is a set of independently recoverable micro-builds run through the shared engine (5 attempts / 5 min policy, mandatory QA hook, full §29 escalation dossier). All six QA gates pass: R02 73/73, R03 30/30, R04 57/57, R05 20/20, R06 25/25, R07 36/36 (241 total). **Only R08-regression remains.**

## What R08-regression must do

Re-run **https://monthlystaff.com/** through the full new pipeline as a fresh job (e.g. `job-002-monthlystaff`) and prove the anti-fabrication rules hold on a real site:

1. `B3.runAnalyzePhase(jobId, 'https://monthlystaff.com/')` (from `packages/analyze/builds3.js`).
2. `hitl.generateReviewReport(jobId)` → present `jobs/<job>/analysis/REVIEW.md` to the user; get their decision via `hitl.recordConfirmation(jobId, {decision, removed_pages?, removed_components?, user_supplied_data?})`. **Do not auto-confirm without the user** — this is the human gate.
3. `EX.runExtractPhase(jobId)` (`packages/extract/index.js`).
4. Write `jobs/<job>/build-config.json` with the user's brand (`{brand:{name, tagline?, footer_note?}}`) — `brand.name` is the one hard requirement; missing it must block at B10 (that's correct behavior, proven by the R07 negative test).
5. `BD.runBuildPhase(jobId, BD.loadConfig(jobId))` (`packages/build/index.js`).
6. Verify: artifact at `jobs/<job>/artifact/` opens locally (index.html + css/js/components); B10 QA passed; **count consistency held** (this is the exact failure mode of superseded job-001, which fabricated a "Load more" button and passed QA with 8/272 profiles).
7. Write `qa/checks/r08-regression.js` capturing the above as a repeatable gate (it may re-crawl live or snapshot pages into a fixture under `qa/fixtures/` for determinism — prefer snapshot so the gate is offline-runnable like R04–R07).
8. Commit + push, update history files (pattern below).

**Known risk:** monthlystaff.com's profile grid is JS-rendered; HTTP+DOM capture will see fewer items than the site advertises (spec §32: browser rendering deferred). If advertised vs captured counts diverge, A06 records it and the correct outcome is a flagged gap / manual review — **not** fabricating items or a Load More button. That is the regression the whole redesign exists to catch.

## Architecture map (what exists)

| Path | Role |
|---|---|
| `packages/engine/index.js` | `runBuild({id, jobId, goal, inputs, expectedOutput, validationCriteria, run, qa})` → `{ok, status, attempts, result, qa}`. QA hook mandatory (§27); on exhaustion `escalate()` writes full §29 dossier to `manual_review/<buildId>/` (context.json, REVIEW.md, attempts.md, error.log, files_touched.txt, diff.patch, expected_output.md, artifacts/) and returns `{ok:false, status:'blocked_manual_review', error, qa:lastQa}`. Constants `MAX_ATTEMPTS=5`, `MAX_MS=300000`. |
| `packages/contracts/` | 23 schemas (`schemas/*.schema.json`) + mocks (`mocks/*.mock.json`, each has `"mock":true`). `validate(name, obj)` → `{passed, errors[]}`. |
| `packages/analyze/lib/html.js` | Zero-dep mini HTML parser + selector engine (tag, .class, #id, [attr], [attr^=v], [attr*=v], descendant combinator, top-level comma OR). |
| `packages/analyze/lib/http.js` | fetch-based; internal URLs follow+record redirect chains; external URLs record-only (§21). |
| `packages/analyze/lib/crawl.js` | sitemap/robots parsing, link graph, boundary enforcement. |
| `packages/analyze/pipeline.js` | `runAnalyzeBuild`, `loadPages`, `writeArtifact`/`readArtifact` (artifacts in `jobs/<job>/analysis/`), `fetchInternalSafe`, `ensureJobDirs`. Crawled pages in `analysis/crawled/` + sidecar `.meta.json`. |
| `packages/analyze/builds.js` / `builds2.js` / `builds3.js` | A05–A08 / A09–A11 / A12–A13 + `runAnalyzePhase(jobId, url)` orchestrator. A07 wireframe sections carry `class` (used by B05 collection binding). |
| `packages/hitl/index.js` | `generateReviewReport` (REVIEW.md), `recordConfirmation` (confirmed/narrowed/skipped_draft; removals validated against analysis — no silent scope expansion), `requireConfirmed` (gate), `confirmedRoutes`. Record at `jobs/<job>/analysis/analysis-confirmation.json`. |
| `packages/extract/index.js` | E01–E08 + `runExtractPhase(jobId)`. Every build calls `hitl.requireConfirmed` first. Outputs in `jobs/<job>/extraction/`: confirmed-scope, structure/content/media/design assets, integration-manifest, placeholder-schema, extraction-manifest. Media is slot-only (`source_copied:false` invariant). |
| `packages/build/generate.js` | Staged generator: b01Shell…b09Preview. Artifact at `jobs/<job>/artifact/` (index.html per route, css/tokens.css, css/responsive.css, js/interactions.js, components/{header,footer,card}.html, manifest.json). Reads config via `readConfig(jobId)` from `jobs/<job>/build-config.json`. B05 binds dynamic collections to collection-role wireframe sections in document order. |
| `packages/build/lib/qa-gate.js` | `runBuildQA(jobId, manifest)` — route QA, anti-fabrication routes, interaction-mechanism QA, behavior match, **region-scoped count consistency**, required-placeholder check, source-host leak check, link QA (internal→generated routes, external→confirmed endpoints, asset refs→exist). |
| `packages/build/index.js` | B01–B10 stage table + `runBuildPhase(jobId, cfg)`; stops at first blocked stage. |
| `qa/checks/r0X-*.js` | Six gates, all self-contained: spin up a local http fixture server, run phases, assert, then clean up job dir + history lines + any `manual_review/` entries for their job id. |
| `apps/builder/*`, `qa/checks/job-001.js`, `jobs/job-001-monthlystaff/` | LEGACY/NON-CONFORMANT (old linear pipeline; fabricated Load More). Kept as regression fixtures only. |
| `docs/product-spec-revised.md` | The spec (1152 lines). Key sections: §10 count consistency, §18 HITL gate, §19–21 extract, §22–25 build/portable output, §23 anti-fabrication, §24 build QA, §26 deployment independence, §27 mandatory QA, §28 recoverability, §29 escalation dossier, §32 browser deferred. |

## Environment gotchas (Windows / PowerShell)

- No `&&` — chain with `;`. No `gh` CLI. Git present. Plain Node 18+, **zero npm dependencies** (keep it that way).
- Long inline `node -e "..."` scripts can time out in this shell — write a temp `.js` file, run it, delete it.
- After every completed micro-build: append one line to `history/build_history.jsonl`, append a dated entry to `history/decision_log.md`, refresh `history/_checkpoint_drafts.md` (one line: last done + next step) and `history/context_resume.md` (short paragraph). Then `git add -A; git commit -m "…"; git push`.
- CRLF warnings on commit are normal here.

## Standing constraints (do not relax)

Per-build 5-attempts/5-min escalation · builds isolated · append-only history + per-job status.json · **no copied content** (original placeholder copy only; no logos/imagery/text) · §23 anti-fabrication (missing info = flag gap → retry → manual review, never improvise) · §10 count consistency · §21 external endpoints record-only · §26 portable artifact is the product, hosting is an adapter · analyze-before-extract · preserve detected interaction mechanisms, don't substitute · every micro-build independently recoverable · QA mandatory.

## User decisions already made (don't re-ask)

Keep `jobs/<job>/<build>/` layout · start execution with R01-docs · HTTP+DOM crawling first, browser later · execution order R01→R08 approved · public GitHub repo OK · job-001 stays as superseded fixture.

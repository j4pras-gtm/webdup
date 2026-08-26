# Gap Analysis — Current Implementation vs. Revised Architecture

**Date:** 2026-08-26
**Inputs:** `docs/product-spec-revised.md` (revised spec) vs. repo state at commit `95938e8`
**Purpose:** Per spec §33 — compare before handing implementation changes to OpenWorker.

---

## 1. Current implementation inventory

| Area | What exists | State |
|---|---|---|
| `packages/engine/index.js` | `runBuild()` (5 attempts / 5 min cap), `escalate()`, `writeStatus()`, `appendHistory()`, constants | ✅ Working, generic |
| `packages/contracts/` | 6 schemas (job, build-status, build-result, brand, qa-report, manual-review) + minimal validator + 4 mock fixtures | ✅ Working, thin |
| `jobs/B00-bootstrap/` | Scaffolding build, completed, 24 inline QA checks | ✅ Complete |
| `jobs/job-001-monthlystaff/` | One-shot pipeline: fetch → hand-written generator → static site → 28-check QA | ⚠️ Complete but **non-conformant** (see §5) |
| `apps/builder/run-b00.js`, `build-job-001.js`, `finalize-job-001.js` | Bootstrap + job-001 generator + history finalizer | ⚠️ job-001 scripts are source-specific one-offs |
| `qa/checks/job-001.js` | 28 checks, all hard-coded to the Teamloop output | ⚠️ Not reusable across sites |
| `history/` | All 5 required files present and maintained | ✅ Conforms to spec §30 |
| `manual_review/` | Empty dir; engine writes `context.json` + `REVIEW.md` only | ⚠️ Dossier incomplete vs. spec §29 |
| `apps/dashboard/`, `apps/preview-router/`, `packages/template/` | Empty dirs | ➖ Future / some obsolete |
| `README.md` | Describes subdomain hosting as core purpose, old B00–B08/P1–P8 model | ❌ Prematurely hosting-coupled |

---

## 2. Retain as-is (conforms to revised spec)

1. **Engine policy** (`packages/engine`) — retry cap, deadline, isolation, escalation trigger. Spec §27/§29 keep exactly this model. Only extension needed: richer escalation dossier (§6 below).
2. **History & session memory** (`history/`) — all five files match spec §30 verbatim. Update cadence already correct.
3. **Contracts package pattern** — schemas + validator + `"mock": true` fixtures matches spec §28 mock-contract principle. Keep the mechanism; replace/extend the schema set.
4. **`jobs/B00-bootstrap`** — scaffolding remains valid under the new model (it creates shared dirs). Rename its BUILD.md framing only if the `jobs/` → `builds/` rename is adopted (§4).
5. **`.gitignore` excluding `exports/`** — still correct: outputs are artifacts, not source.

## 3. Remove / decouple (premature hosting coupling)

Per spec §25/§26/§32, hosting must be an adapter, not part of the engine:

1. **README.md line 1** — "…hosted on a Sidekikz-controlled subdomain" → rewrite around *portable locally-viewable artifact*; list delivery targets as optional adapters.
2. **`apps/preview-router/`** — delete the dir (or repurpose as `adapters/local-preview/`). Subdomain routing is explicitly out of scope until later.
3. **README layout section** — drop `*.app.sidekikz.com routing (future)`; add `adapters/` concept.
4. **No code changes needed** in engine/contracts — they never referenced hosting. Good.

## 4. Restructure / rename

1. **Build directory convention:** spec §28 says `/builds/<build_id>/`; current tree uses `jobs/<job>/<build>/`. Decision needed:
   - Option A (spec-literal): move to `builds/<build_id>/`, jobs become a logical grouping field in `status.json`.
   - Option B (pragmatic): keep `jobs/<job_id>/<build_id>/` — it already satisfies independence + recoverability, and groups a job's A/E/B builds naturally.
   - **Recommendation: Option B**, documented as a deliberate deviation (job-scoped builds make HITL scope-narrowing per §18 easier). Flag for user confirmation.
2. **Build ID namespace collision:** current "B01-intake" (old model) vs. new "B01-build-shell". Old IDs were never materialized as folders (only mentioned in context_resume), so adopt the new A/E/B numbering cleanly:
   - `A01…A13` analyze, `E01…E08` extract, `B01…B10` build. No legacy IDs to migrate.
3. **`apps/builder/build-job-001.js` + `finalize-job-001.js`** — keep as *reference examples* (they demonstrate the generator pattern) but mark them non-conformant; do not use as templates for new jobs. Move to `examples/legacy/` or leave in place with a header note.
4. **`qa/checks/job-001.js`** — same treatment: example, not a reusable gate. New QA must be analysis-driven (§7).

## 5. Non-conformance audit of job-001 (case study for the new rules)

job-001 predates the revised spec and violates several invariants — useful as the first test case for the new QA gates:

| Spec rule | job-001 behavior | Verdict |
|---|---|---|
| Invariant 4 — never fabricate | Generated a **"Load more talent" button**; source uses **infinite scroll** (`.infinite-scroll-sentinel`) | ❌ Fabricated control (spec §9 critical rule) |
| §10 Count consistency | Source advertises **272 profiles**; captured **8**; QA passed anyway | ❌ Materially incomplete collection silently passed |
| Invariant 1/2 — analyze before extract, confirm before extract | No analysis package, no HITL gate; went straight from fetch to build | ❌ Phases collapsed |
| §7 Link graph | Child routes `/talent/<slug>` discovered incidentally, not recorded as first-class routes | ⚠️ Partial |
| §8 External endpoints | WhatsApp/LinkedIn links were stripped rather than recorded as `record_only` endpoints feeding the placeholder map | ⚠️ Lost as integration inputs |
| §13 Design analysis | Tokens extracted ad hoc (good instinct) but not persisted as a contract artifact | ⚠️ Partial |

**Action:** do not delete job-001 — annotate `jobs/job-001-monthlystaff/BUILD.md` with a "superseded by revised spec" note listing these gaps. It becomes the regression fixture for the new anti-fabrication and count-consistency QA.

## 6. New micro-builds required

### Phase 1 — Analyze (all new)
`A01-intake` … `A13-analysis-synthesis` per spec §5. Each gets `BUILD.md`, `status.json`, `outputs/`, `qa/`, `logs/` under the job folder. Independently QA-able.

### HITL gate (new)
Not a build — a user review step between A13 and E01. Produces a **confirmation record** (confirmed scope, removed components/pages, accepted draft) stored in the job folder. Extraction may only start after it exists.

### Phase 2 — Extract (all new)
`E01-confirmed-scope` … `E08-extraction-QA` per spec §19.

### Phase 3 — Build (all new, replaces old B01–B08 intent)
`B01-build-shell` … `B10-final-QA` per spec §22.

### Engine-level additions (small)
- Escalation dossier expansion: `attempts.md`, `error.log`, `files_touched.txt`, `diff.patch`, `expected_output.md`, `artifacts/` (spec §29). Current `escalate()` writes only `context.json` + minimal `REVIEW.md`.
- Optional: `runBuild` should accept a `qa` hook so "complete without QA passing" is structurally impossible (spec §27 step 6/9).

## 7. Contracts: modify vs. add

### Modify
| Schema | Change |
|---|---|
| `site_inventory` | Superseded by `route_inventory` + `sitemap` (discovered/crawlable/excluded/restricted/canonical split, spec §6). Keep file, deprecate. |
| `brand` | Becomes the **personalization/brand group** inside the placeholder map (spec §16). Extend, don't replace. |
| `build-status` | Add `phase` (analyze/extract/build) and `upstream_artifacts[]` for drift re-checks (spec §28). |

### Add (new schemas)
`sitemap`, `route-inventory`, `link-graph`, `redirect-map`, `dynamic-content-report`, `wireframe`, `content-schema`, `design-tokens`, `interaction-spec`, `component-inventory`, `reusable-assets`, `placeholder-map`, `integration-manifest`, `analysis-package`, `analysis-confirmation` (HITL record).

Each ships with a `"mock": true` fixture so downstream builds can start before upstream real outputs exist (existing pattern).

## 8. QA gates that need to change

Current QA = artifact self-checks (tag balance, class coverage, leak scan). New QA must verify **artifact ↔ confirmed analysis**:

1. **Route QA** — every generated route ∈ confirmed route inventory; every confirmed route has a generated page (or explicit exclusion).
2. **Interaction QA** — every generated interaction ∈ interaction-spec.
3. **Dynamic-behavior QA** — generated collection mechanism === analyzed type (infinite scroll ⇒ no Load More button; etc.). *This check would have failed job-001.*
4. **Count-consistency QA** — captured vs. advertised counts reconciled or escalated. *Would have failed job-001.*
5. **Anti-fabrication QA** — flag any interactive component with no confirmed-analysis counterpart.
6. **Content QA** — no unresolved required placeholders.
7. **Asset QA** — source-restricted assets absent unless authorized.
8. **Link QA** — internal links resolve to generated routes; external links match user-provided/recorded endpoints.

Implementation shape: a generic `qa/gates/*.js` library driven by the analysis package, replacing per-site hard-coded scripts.

## 9. Untouched

- `packages/engine` core loop (extend only, per §6)
- `history/` system
- `manual_review/` location
- `.gitignore`
- `exports/` as local artifact root (now framed as "portable artifact", not "deployment")

## 10. Proposed execution order (for approval)

1. **R01-docs** — rewrite README around portable-artifact model; delete `apps/preview-router/`; annotate job-001 as superseded. *(no behavior change)*
2. **R02-contracts** — add the 15 new schemas + mocks; modify 3 existing; deprecate `site_inventory`.
3. **R03-engine** — expand escalation dossier; add QA hook to `runBuild`.
4. **R04-analyze-builds** — implement A01–A13 runners + per-build QA (this is the big lift; browser automation choice deferred per spec §32 — start with HTTP+DOM analysis, add rendered capture where required).
5. **R05-hitl** — confirmation-record contract + review rendering (markdown report first).
6. **R06-extract-builds** — E01–E08.
7. **R07-build-builds** — B01–B10 + generic QA gate library.
8. **R08-regression** — re-run job-001's source through the full A→HITL→E→B pipeline; new QA must catch the two known job-001 violations.

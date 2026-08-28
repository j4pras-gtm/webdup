# Recon Protocol — Agent-Driven Analysis (replaces fixed A01–A13 pipeline)

**Status:** v2 (2026-08-27). Supersedes the deterministic A01–A13 micro-build sequence for the *means* of analysis. The *outputs* (schema'd artifacts), the HITL gate, and all governance invariants are unchanged.

## Why this exists

The deterministic DOM-parsing pipeline fails on any site whose content is not in static HTML (SPA + API, infinite scroll, client-side rendering). A skill-driven run against monthlystaff.com mined the full 272-profile directory in one pass by reading the JS bundle, discovering a public Supabase RPC, and calling it — ~300 plain HTTP requests, zero scraping of 272 pages. The engine's durable value is **governance** (contracts, QA gates, count consistency, anti-fabrication, HITL, history/escalation, portable artifact) — not regexes that replace model judgment. Recon is therefore agent-driven; the engine enforces what the agent must prove.

## Division of labor

| Layer | Who | What |
|---|---|---|
| **Recon (agent)** | Frontier model, in-session | Picks the means: HTTP fetch, JS-bundle reading, API/RPC discovery, browser automation, sitemap/robots parsing. Explores until it can answer the questions below with evidence. |
| **Contracts (engine)** | `packages/contracts` | Every recon output must validate against its schema. No artifact, no progress. |
| **HITL gate (engine)** | `packages/hitl` | User confirms/narrows scope **and the data-source decision** before extraction. Narrowing only removes. |
| **Extract/Build (engine)** | `packages/extract`, `packages/build` | Deterministic, operate only on confirmed artifacts. Never re-crawl, never re-interpret. |

## Required outputs (all under `jobs/<job>/analysis/`)

The agent may use any intermediate notes it likes, but these artifacts are mandatory and schema-checked:

1. `intake.json` — source URL, authorization basis, scope statement.
2. `sitemap.json` — discovered / crawlable / excluded / restricted URLs.
3. `route-inventory.json` — every route: path, type, purpose.
4. `dynamic-content.json` — collections: region selector, behavior, captured count, advertised count, count_consistent, items (factual fields only).
5. `wireframes.json` — per-route section structure.
6. `content-schemas.json` — entity field templates.
7. `design-tokens.json` — colors, typography, spacing, radii, breakpoints.
8. `interactions.json` — observed interaction mechanisms (exact mechanism, no substitution).
9. `components.json` — reusable component inventory.
10. `placeholder-map.json` — personalization groups (draft).
11. `integration-manifest.json` — external endpoints, record-only (§21).
12. **`data-source-decision.json`** — NEW. The single most important artifact. See below.
13. `analysis-package.json` — synthesis + uncertainties.

## The data-source decision (`data-source-decision.json`)

For each content collection the recon found, the agent must decide **where the complete data lives** and record how it would be fetched. This is the artifact that closes §10 count-consistency gaps instead of escalating them.

Shape (per source):

```json
{
  "id": "talent-directory",
  "collection": "div.profile-card",
  "page_path": "/",
  "advertised_count": 272,
  "dom_captured_count": 24,
  "source_type": "api_rpc",            // dom | api_rpc | api_rest | api_graphql | pagination_dom | browser_rendered
  "endpoint": {
    "url": "https://<host>/rest/v1/rpc/<name>",
    "method": "POST",
    "headers": { "apikey": "<publishable key>" },
    "body": {},
    "auth_basis": "publishable/anon key embedded in client bundle"
  },
  "field_map": { "name": "name", "role": "title", "price": "monthly_rate", "location": "city", "skills": "skills", "detail_slug": "legacy_slugs" },
  "sample_rows": 2,                     // first N rows, for schema evidence only
  "verified_row_count": 272,            // agent actually called it and counted
  "prose_fields_excluded": ["about"],   // never extracted; stay placeholder
  "pii_fields": ["contact_email", "contact_phone"],  // require explicit HITL opt-in
  "generated_route_family": "/talent/{slug}"          // routes the build must generate from this data
}
```

Rules:

- **Record-only still applies to destinations** (§21): we record endpoints and fetch *data* through confirmed public/publishable interfaces; we never scrape third-party integration destinations (LinkedIn, WhatsApp, etc.).
- **Verified, not assumed:** `verified_row_count` must come from an actual call during recon. An unverified endpoint = uncertainty, not a decision.
- **PII is opt-in:** any `pii_fields` present in the data require an explicit user decision at the HITL gate before extraction carries them. Default: exclude.
- **Prose stays placeholder** regardless of source: `about`, bios, testimonials, legal text are never copied into the build. Factual listing fields (name, role, category, price, location, skills, counts) are data.
- **Generated route families:** if the data implies pages the crawl didn't visit (e.g. 272 profile pages when only 9 were crawled), declare the family pattern. The HITL gate decides whether the build generates them. This is *not* scope fabrication — the family is evidenced by the data itself (slugs present in rows) and by links observed in the DOM.

## Invariants (unchanged, enforced by engine QA)

- §4 analyze-before-extract · §9 preserve source behavior · §10 count consistency · §18 HITL narrowing-only · §21 record-only · §23 anti-fabrication · §26 deployment independence · §27 QA mandatory · §28 recoverability · §29 structured escalation.
- Per-build policy: max 5 attempts OR 5 minutes → `manual_review/`.
- History: append-only `build_history.jsonl`, per-job `status.json`.

## Escalation

If recon cannot verify a data source within policy (attempts/time), it writes the gap into `analysis-package.json` uncertainties with severity `high` and the job escalates at the HITL gate with a §29 dossier — including exactly what was tried, what was found, and what a frontier model needs to finish blind.

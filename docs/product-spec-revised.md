# Sidekikz Site Reconstruction — OpenWorker Product Specification
## Revised Idea-Stage / Micro-Build Architecture

**Status:** Product / architecture specification — idea stage  
**Execution model:** OpenWorker desktop agent running Qwen 3.8 MOE  
**Primary principle:** Analyze first, extract second, build third.  
**Output principle:** Build locally viewable, portable website assets first. Deployment is an adapter, not part of the reconstruction engine.

---

# 1. Product Intent

Build a site-agnostic system that accepts an authorized reference website and reconstructs a rebrandable version of that site.

The system must understand the source before attempting to reproduce it.

The objective is not simply to scrape HTML and copy CSS. The system should progressively understand:

- Site architecture
- Sitemap
- Page types
- Wireframes / page composition
- Content schema
- Component structure
- Internal link relationships
- Child/detail routes
- Dynamic content behavior
- Pagination behavior
- Redirect behavior
- Design system
- Reusable assets
- Source-restricted assets
- External integrations
- User-provided / replacement data
- Interaction behavior
- Accessibility / responsive characteristics where detectable

The resulting build should be a portable website artifact that can initially be viewed locally and can later be delivered through multiple deployment/export targets.

---

# 2. Core Architectural Principle

## Separate understanding from reconstruction and deployment

```text
REFERENCE SITE
     |
     v
PHASE 1 — ANALYZE
     |
     |  Understand source
     |  Produce source model
     v
HITL REVIEW GATE
     |
     |  Confirm / narrow scope
     v
PHASE 2 — EXTRACT ASSETS
     |
     |  Extract only confirmed reusable assets
     |  Structure replacement/content inputs
     v
PHASE 3 — BUILD
     |
     |  Generate portable website
     v
LOCAL PREVIEW / PORTABLE ARTIFACT
     |
     +----> Static HTML
     +----> ZIP / downloadable assets
     +----> GitHub-ready project
     +----> Owned-domain deployment
     +----> Sidekikz-hosted page
     +----> Lovable / other downstream builder
```

The Build phase must not assume a particular hosting destination.

The reconstruction engine understands the website. A separate delivery/deployment layer determines where the resulting artifact goes.

---

# 3. Site-Agnostic Requirement

The system must not be designed around one specific source website or one website pattern.

The Analyze phase must discover the source site's behavior rather than assume it.

Potential source patterns include:

- Static marketing sites
- SaaS websites
- Agency websites
- Portfolio sites
- Directories
- Marketplaces
- Catalogs
- Blogs
- Corporate sites
- Multi-page sites
- JavaScript-heavy applications
- Static HTML sites
- Numbered pagination
- Load-more interfaces
- Infinite-scroll collections
- Child/detail page structures
- Sites with redirects
- Sites with externally hosted integrations

A source site's behavior becomes an analyzed property.

For example:

```text
dynamic_behavior:
  type: infinite_scroll
```

The builder must not infer:

> "Every collection needs a Load More button."

Instead it must reconstruct the behavior recorded by the analysis.

---

# 4. Three-Phase Product Model

## Phase 1 — Analyze

Analyze the reference site before extracting reusable assets or building anything.

The Analyze phase should produce a sufficiently complete representation of the source to allow a human to understand what the system believes the site contains.

### Analyze responsibilities

1. Validate source URL and authorized scope.
2. Establish crawl boundary.
3. Discover sitemap and routes.
4. Build internal link graph.
5. Resolve internal redirects.
6. Record external endpoints without scraping them.
7. Detect page types.
8. Detect parent/child route relationships.
9. Detect dynamic content.
10. Classify pagination behavior.
11. Capture rendered page structure.
12. Infer wireframes.
13. Infer content/schema models.
14. Analyze design system.
15. Analyze interactions.
16. Identify reusable components.
17. Identify source-restricted elements.
18. Identify personalization/replacement fields.
19. Produce draft reusable-asset list.
20. Produce draft placeholder/personalization map.

### Important

Analyze is an understanding phase.

It should not silently compensate for missing information by inventing UI, content, routes, or interactions.

If the analysis is uncertain, it records uncertainty and confidence.

---

# 5. Analyze Micro-Builds

The Analyze phase itself must be divided into OpenWorker micro-builds.

A proposed sequence:

```text
A01-intake
  ↓
A02-scope-preflight
  ↓
A03-sitemap-discovery
  ↓
A04-link-graph
  ↓
A05-route-classification
  ↓
A06-dynamic-content-analysis
  ↓
A07-page-structure-analysis
  ↓
A08-schema-content-model
  ↓
A09-design-analysis
  ↓
A10-interaction-analysis
  ↓
A11-reusable-component-analysis
  ↓
A12-placeholder-personalization-analysis
  ↓
A13-analysis-synthesis
  ↓
HITL REVIEW
```

A01–A13 are conceptual build boundaries. The final implementation may split or merge them where necessary, but each must remain independently QA-able.

---

# 6. A03 — Sitemap Discovery

Discover routes using available source evidence:

- sitemap.xml
- robots.txt
- navigation
- internal links
- rendered DOM
- structured data
- route patterns

Do not assume the sitemap is complete.

Output should distinguish:

- discovered routes
- crawlable routes
- excluded routes
- restricted routes
- duplicate/canonical routes

---

# 7. A04 — Link Graph

Extract all relevant links, including links inside repeating components.

Do not limit discovery to:

- header navigation
- footer navigation
- sitemap links

Repeated cards are high-signal sources of child/detail routes.

For each discovered link, determine whether it is:

```text
internal-detail
internal-section
internal-route
external
restricted
```

### Parent → child relationships

Example:

```text
/
  └── profile-card
        └── /profiles/ava-chen
```

The child route becomes a first-class analyzed route.

### JS-attached links

If a card or component has no meaningful `<a href>` but is clickable through JavaScript:

1. Detect the interaction.
2. Follow it using the rendered/browser environment.
3. Capture the resulting destination.
4. Add it to the link graph.

Do not replace the destination with a guessed route.

---

# 8. Redirect Rules

For internal links:

```text
source URL
   ↓
redirect chain
   ↓
final canonical internal URL
   ↓
crawl/analyze
```

For external links:

```text
source URL
   ↓
redirect chain
   ↓
final external endpoint
   ↓
RECORD ONLY
```

The crawler must never scrape redirected external destinations.

### External endpoint examples

- LinkedIn
- WhatsApp
- Calendly
- Other booking systems
- Social profiles
- `mailto:`
- `tel:`

Store:

- source page
- anchor text
- original URL
- final URL
- redirect chain
- endpoint type
- classification
- treatment = `record_only`

External endpoints become inputs to the integration / placeholder analysis.

---

# 9. A06 — Dynamic Content Analysis

Dynamic collections must be explicitly classified.

Supported types:

```text
static
numbered_pagination
load_more
infinite_scroll
```

### Static

All expected items exist in the initial rendered page.

### Numbered pagination

Detect:

- page numbers
- `?page=`
- `/page/2`
- pagination navigation

Capture all pages until no new items appear.

### Load more

Detect an actual source control that appends additional items.

Click until:

- no new items appear, or
- the control disappears, or
- the source indicates completion.

### Infinite scroll

Detect items being appended in response to scrolling with no source "Load More" control.

Scroll and capture until the collection stabilizes.

A proposed stopping condition may use multiple consecutive scrolls with zero new items, but the exact implementation must be validated during the build.

### Critical rule

Do not confuse these mechanisms.

If the source uses infinite scroll, the generated site must not invent a Load More button.

If the source uses numbered pagination, do not replace it with infinite scroll.

If the source contains no pagination control, do not invent one to compensate for incomplete extraction.

---

# 10. Count Consistency

Analyze must compare:

- advertised counts
- structured counts
- captured item counts

Example:

```text
Source says: 272 profiles
Captured:      8 profiles
```

This is not an acceptable completed analysis.

The build must:

1. Flag the discrepancy.
2. Attempt the appropriate dynamic capture.
3. Re-run QA.
4. Escalate if unresolved.

Never silently pass a materially incomplete collection.

---

# 11. A07 — Page Structure / Wireframe Analysis

The system should produce a structural representation of each page.

The goal is closer to a machine-readable wireframe than a copied HTML document.

Example conceptual representation:

```text
HOME
├── Header
├── Hero
│   ├── Eyebrow
│   ├── Heading
│   ├── Supporting copy
│   └── CTA
├── Trust / metric block
├── Repeating collection
│   └── Profile card
├── Services
├── Testimonial section
└── Footer
```

For each route, capture:

- page type
- ordered sections
- section relationships
- recurring components
- content fields
- interaction points
- responsive behavior where detectable

---

# 12. A08 — Schema / Content Model Analysis

Understand the data model behind the visual site.

Example:

```json
{
  "entity": "profile",
  "fields": [
    "name",
    "role",
    "skills",
    "location",
    "rate",
    "bio",
    "portfolio",
    "contact"
  ]
}
```

The objective is to separate:

```text
STRUCTURE
DESIGN
CONTENT
DATA
INTEGRATIONS
```

This is essential for rebranding and replacing source-specific information.

---

# 13. A09 — Design Analysis

Do not merely copy the source stylesheet.

Analyze:

- colors
- typography
- font families
- font weights
- spacing
- grid
- container widths
- radii
- shadows
- borders
- breakpoints
- component-level styling
- visual hierarchy

Produce a design-token representation where possible.

The copied CSS can remain source evidence, but the token layer becomes the reusable/rebrandable representation.

---

# 14. A10 — Interaction Analysis

Record actual detected behavior.

Examples:

```text
navigation:
  type: sticky
  mobile_behavior: hamburger

profile_collection:
  type: infinite_scroll

profile_card:
  click_target: detail_route

hero:
  CTA:
    type: external_endpoint
```

The interaction specification is a source-of-truth artifact for Build QA.

---

# 15. A11 — Reusable Component Analysis

Analyze all detected sections/components and produce a draft recommendation.

Example:

```text
hero-split       → core_reusable
profile-card     → core_reusable
talent-grid      → core_reusable
testimonial      → review
source-logo      → source_restricted
```

Every recommendation should include confidence.

Low-confidence inferences should be surfaced to the user.

---

# 16. A12 — Placeholder / Personalization Analysis

Identify fields that the new site must receive from the user.

Example groups:

### Brand

```text
displayName
logo
primaryColor
fonts
```

### Contact / integrations

```text
whatsappLink
linkedinUrl
bookingUrl
contactEmail
```

### Content

```text
profiles
services
testimonials
```

### Legal

```text
privacyPolicy
terms
```

Source-restricted content should not silently become reusable content.

---

# 17. A13 — Analysis Synthesis

Combine all Analyze outputs into a coherent analysis package.

Conceptual output:

```text
analysis/
  sitemap.json
  route-inventory.json
  link-graph.json
  redirect-map.json
  dynamic-content-report.json
  wireframes/
  schemas/
  design-tokens.json
  interaction-spec.json
  component-inventory.json
  reusable-assets-draft.json
  placeholder-map-draft.json
  analysis-summary.md
```

This package becomes the input to the HITL gate.

---

# 18. HITL Review Gate

The user reviews the Analyze result before extraction begins.

The review should show:

### Site structure

- Sitemap
- Routes
- Page types
- Wireframes

### Reusable assets

- Component inventory
- Recommended reuse classification
- Confidence
- Source-restricted flags

### Personalization

- Fields the user needs to supply
- Detected integrations
- Content collections
- Legal fields

### User actions

The user can:

- Confirm
- Narrow scope
- Remove components
- Remove pages
- Skip the review and accept the draft

The confirmation should not silently expand the system's understanding of the source.

If something genuinely absent from the analysis is required, the appropriate response is to re-run Analyze against the relevant source.

---

# 19. Phase 2 — Extract Assets

Phase 2 operates only on the **confirmed analysis package**.

It must not independently reinterpret the source.

Conceptual micro-builds:

```text
E01-confirmed-scope
  ↓
E02-structure-assets
  ↓
E03-content-assets
  ↓
E04-media-assets
  ↓
E05-design-assets
  ↓
E06-integration-manifest
  ↓
E07-placeholder-schema
  ↓
E08-extraction-QA
```

The exact extraction implementation remains open at this stage.

---

# 20. Source-Restricted Content

The system must distinguish reusable structure from source-specific content.

Do not reuse without authorization:

- Logos
- Brand marks
- Testimonials
- Legal text
- Tracking IDs
- Proprietary imagery
- Source-specific contact information
- Other restricted content

The analysis should identify these items and route them into the replacement / approval model.

---

# 21. External Integrations

External integrations are **record-only endpoints**.

The system can record:

```text
WhatsApp
LinkedIn
Calendly
Social profiles
mailto
tel
external booking links
```

But the crawler must not scrape their destination pages.

The resulting integration manifest feeds the personalization map.

---

# 22. Phase 3 — Build

Build consumes:

```text
confirmed analysis
+
confirmed reusable assets
+
user-supplied replacement data
+
build configuration
```

It does not consume assumptions about a particular source website.

Conceptual micro-builds:

```text
B01-build-shell
  ↓
B02-build-components
  ↓
B03-inject-design
  ↓
B04-inject-content
  ↓
B05-build-routes
  ↓
B06-build-interactions
  ↓
B07-build-responsive
  ↓
B08-build-static
  ↓
B09-local-preview
  ↓
B10-final-QA
```

These are conceptual boundaries and can be refined during implementation.

---

# 23. Anti-Fabrication Rule

This is a core Build constraint.

The builder may only generate:

- components represented in the confirmed analysis
- interactions represented in the interaction specification
- routes represented in the confirmed route inventory
- content represented in the extracted/user-supplied content model
- design behavior represented in the confirmed design model

It must not invent missing UI to compensate for incomplete source data.

Forbidden examples:

- Inventing a Load More button
- Inventing pagination
- Inventing profile pages
- Inventing testimonials
- Inventing CTA destinations
- Inventing content
- Inventing source interactions

If required source information is missing:

```text
DO NOT IMPROVISE
      ↓
FLAG GAP
      ↓
QA FAILURE / RETRY
      ↓
MANUAL REVIEW IF UNRESOLVED
```

---

# 24. Build QA

QA must verify the generated artifact against the confirmed analysis.

Examples:

### Route QA

Every generated route corresponds to a confirmed route/page model.

### Interaction QA

Every generated interaction corresponds to an analyzed interaction.

### Dynamic behavior QA

The generated collection mechanism matches the source interaction specification.

### Content QA

No unresolved required placeholders remain.

### Anti-fabrication QA

Generated interactive components that have no corresponding source/confirmed specification are flagged.

### Asset QA

Source-restricted assets are absent unless explicitly authorized.

### Link QA

Internal links resolve to generated routes.

External links resolve to the user-provided or confirmed endpoints.

---

# 25. Portable Output Model

The default Build result is a **locally viewable website**.

The architecture should not hard-code a hosting provider.

The artifact should remain portable enough to support future adapters.

Potential delivery targets:

```text
LOCAL
  └── local preview

DOWNLOAD
  ├── ZIP
  └── Static HTML

REPOSITORY
  └── GitHub-ready project

HOSTED
  ├── owned domain/subpage
  ├── Sidekikz-hosted page
  └── other hosting provider

DOWNSTREAM BUILDER
  └── Lovable or another compatible project/import flow
```

These are delivery options, not separate reconstruction engines.

---

# 26. Deployment Adapter Principle

Do not make the core Build phase responsible for:

- DNS
- Cloudflare
- Sidekikz subdomains
- hosting providers
- GitHub deployment
- Lovable deployment

Instead:

```text
CORE RECONSTRUCTION
        |
        v
PORTABLE BUILD ARTIFACT
        |
        +---- Deployment Adapter A
        +---- Deployment Adapter B
        +---- Export Adapter
        +---- Repository Adapter
```

This keeps the product open-ended.

---

# 27. OpenWorker Micro-Build Protocol

Every micro-build follows the same protocol.

```text
1. Read BUILD.md
2. Read required contracts
3. Set status = in_progress
4. Execute work
5. Write outputs
6. Run QA
7. Record result
8. Checkpoint
9. Continue if passed
10. Retry if failed and within limits
11. Escalate if limits reached
```

A build must never be marked complete without QA passing.

---

# 28. Independence Between Builds

A failed build must not unnecessarily block unrelated work.

Every build has:

```text
/builds/<build_id>/
  BUILD.md
  status.json
  outputs/
  qa/
  logs/
```

Where a real upstream artifact is unavailable but the downstream build can still work against a defined contract, use a mock contract.

When the real output becomes available, the downstream build must re-check for contract drift.

---

# 29. Manual Review Escalation

The existing escalation model remains:

```text
attempts >= 5
OR
elapsed >= 5 minutes
```

Whichever occurs first triggers manual review.

The micro-build stops.

Other independent builds continue.

Manual review package:

```text
/manual_review/<build_id>/
  REVIEW.md
  context.json
  attempts.md
  error.log
  files_touched.txt
  diff.patch
  expected_output.md
  artifacts/
```

`REVIEW.md` must allow a frontier model to solve the issue without needing the original conversation.

It must contain:

- Build goal
- Inputs
- Expected output contract
- Current failure
- All attempts
- Relevant artifacts
- Exact unresolved question/action
- Validation criteria

---

# 30. Context and Session Memory

Maintain:

```text
/history/
  Session_summary.md
  _checkpoint_drafts.md
  build_history.jsonl
  decision_log.md
  context_resume.md
```

Update after every completed or blocked micro-build.

When switching chats:

```text
context_resume.md
        ↓
Session_summary.md
        ↓
build history
        ↓
resume next unblocked build
```

The context system remains independent of the website-generation logic.

---

# 31. Key Product Invariants

These should be treated as non-negotiable principles throughout implementation.

### Invariant 1 — Analyze before extract

Do not extract reusable assets based on an incomplete understanding of the source.

### Invariant 2 — Confirm before extraction

Phase 2 operates on the confirmed Analyze output.

### Invariant 3 — Build from evidence

Build only from confirmed source models, extracted assets, and user-provided replacement data.

### Invariant 4 — Never fabricate

Missing information is a QA failure or manual-review condition, not an invitation to improvise.

### Invariant 5 — Preserve source behavior

Reproduce the detected interaction mechanism rather than substituting a more convenient mechanism.

### Invariant 6 — External endpoints are record-only

Never scrape external integration destinations.

### Invariant 7 — Deployment is independent

The reconstruction engine produces portable artifacts. Hosting is a downstream concern.

### Invariant 8 — Every micro-build is independently recoverable

A failed build should not corrupt or block unrelated builds.

### Invariant 9 — QA is mandatory

No build is complete without passing its defined QA contract.

### Invariant 10 — Frontier escalation is structured

A manual-review package must contain enough context for a frontier model to solve the problem blind.

---

# 32. Current Product Boundary

At this stage, do **not** lock down:

- Specific frontend framework
- Specific crawler implementation
- Specific browser automation library
- Specific hosting provider
- Sidekikz subdomain architecture
- Lovable integration implementation
- Exact export format
- Exact number of micro-builds
- Exact UI for HITL

Those are implementation decisions to be made after the architecture is accepted.

The important decision now is the separation:

```text
ANALYZE
   ↓
HITL
   ↓
EXTRACT
   ↓
BUILD
   ↓
PORTABLE ARTIFACT
   ↓
OPTIONAL DELIVERY ADAPTER
```

---

# 33. Immediate Next Design Step

Before asking OpenWorker to implement this specification, review the actual current OpenWorker-generated project.

The next pass should compare:

```text
CURRENT IMPLEMENTATION
        vs
THIS REVISED ARCHITECTURE
```

and identify:

- Existing micro-builds that can be retained
- Existing builds that need to be renamed/restructured
- New Analyze builds required
- Existing contracts that need modification
- New contracts required
- QA gates that need to change
- What should remain untouched
- What should be removed because it prematurely couples the system to hosting

Only after that comparison should implementation changes be handed to OpenWorker.

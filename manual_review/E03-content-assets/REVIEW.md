# Manual review: E03-content-assets

## Build goal
Extract content schemas as field-level templates + factual listing data (names/roles/prices/locations/skills; prose stays placeholder).

## Inputs
{
  "job_id": "job-002"
}

## Expected output contract
Extract content schemas as field-level templates + factual listing data (names/roles/prices/locations/skills; prose stays placeholder).

## Current failure
QA failed: pii approved but no contact data extracted: api.talent-directory

## All attempts
- attempt 1 @ 2026-08-28T03:14:55.745Z: QA failed: pii approved but no contact data extracted: api.talent-directory
- attempt 2 @ 2026-08-28T03:14:55.951Z: QA failed: pii approved but no contact data extracted: api.talent-directory
- attempt 3 @ 2026-08-28T03:14:56.057Z: QA failed: pii approved but no contact data extracted: api.talent-directory
- attempt 4 @ 2026-08-28T03:14:56.212Z: QA failed: pii approved but no contact data extracted: api.talent-directory
- attempt 5 @ 2026-08-28T03:14:56.302Z: QA failed: pii approved but no contact data extracted: api.talent-directory

## Relevant artifacts
- manual_review/E03-content-assets/artifacts/ (copy of build outputs, if any)
- jobs/job-002/E03-content-assets/ (BUILD.md, status.json, outputs/, qa/, logs/)

## Exact unresolved question / action
What root cause should be fixed before re-triggering this build?

## Validation criteria
QA hook returns passed:true

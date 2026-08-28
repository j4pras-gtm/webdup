# Manual review: A06-dynamic-content-analysis

## Build goal
Detect dynamic/repeating content regions; classify behavior; record advertised vs captured counts (count consistency).

## Inputs
{
  "job_id": "job-002"
}

## Expected output contract
Detect dynamic/repeating content regions; classify behavior; record advertised vs captured counts (count consistency).

## Current failure
isCardGroup is not defined

## All attempts
- attempt 1 @ 2026-08-28T00:50:00.577Z: isCardGroup is not defined
- attempt 2 @ 2026-08-28T00:50:00.753Z: isCardGroup is not defined
- attempt 3 @ 2026-08-28T00:50:00.938Z: isCardGroup is not defined
- attempt 4 @ 2026-08-28T00:50:01.164Z: isCardGroup is not defined
- attempt 5 @ 2026-08-28T00:50:01.343Z: isCardGroup is not defined

## Relevant artifacts
- manual_review/A06-dynamic-content-analysis/artifacts/ (copy of build outputs, if any)
- jobs/job-002/A06-dynamic-content-analysis/ (BUILD.md, status.json, outputs/, qa/, logs/)

## Exact unresolved question / action
What root cause should be fixed before re-triggering this build?

## Validation criteria
QA hook returns passed:true

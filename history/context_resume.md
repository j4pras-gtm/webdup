# Context Resume

Last updated: 2026-08-25T22:04:25.265Z

## Current state
- job-001-monthlystaff: **completed** (source monthlystaff.com → rebrand "Teamloop")
- Site output: exports/teamloop/ (index.html, css/styles.css, js/main.js)
- QA: 28/28 passed (jobs/job-001-monthlystaff/qa-report.json)

## Next build
- None queued. Awaiting next user URL for a new job folder.
- When a new URL arrives: create jobs/job-NNN-<slug>/ with job.json + status.json,
  run intake → build → QA, then commit.

## Standing policy
- Max 5 attempts OR 5 minutes per build, then escalate to manual_review/.
- No copied content: original placeholder copy only.
- Commit + push after each completed build.

# Decision Log

### [2026-08-25 17:17 EST] — Scaffolding initiated
- Decision: bootstrap project structure with B00 before any site work
- Why: agent must not start work into a missing folder tree
- Impact: all subsequent builds assume this structure exists
- Supersedes: none

## 2026-08-25T22:04:25.266Z
- job-001: ingested monthlystaff.com; built static rebrand "Teamloop" in exports/teamloop/.
- Rebranded palette kept source design language (green #1dbf73 primary, ink #222325, cream #f7f7f2, Inter).
- QA 28/28 passed; no source content leaked (verified by qa/checks/job-001.js).

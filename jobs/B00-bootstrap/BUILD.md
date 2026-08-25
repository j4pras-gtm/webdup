# B00-bootstrap

Goal: create the complete Sidekikz Builder project structure before any site-generation work.

## Scope
- Folder tree: apps/{dashboard,preview-router}, packages/{template,contracts}, jobs, manual_review, history, exports, qa/checks
- Seed history files (context_resume, build_history.jsonl, Session_summary, _checkpoint_drafts, decision_log)
- Seed 4 mock contract JSON files (mock: true)
- QA gates per spec; escalate to manual_review on failure

## Policy
Max 5 attempts OR 5 minutes, whichever first. Isolated: never blocks other builds.

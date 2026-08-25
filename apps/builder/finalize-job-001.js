'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

// 1. append history
const hist = path.join(ROOT, 'history', 'build_history.jsonl');
const now = new Date().toISOString();
const entry = {
  build_id: 'job-001-full-pipeline',
  job_id: 'job-001-monthlystaff',
  status: 'completed',
  attempts: 1,
  source: 'https://monthlystaff.com/',
  rebrand: 'Teamloop',
  started_at: '2026-08-25T21:45:00Z',
  ended_at: now,
  qa: { passed: true, checks_run: 28, failures: [] },
  outputs: ['exports/teamloop/index.html', 'exports/teamloop/css/styles.css', 'exports/teamloop/js/main.js'],
};
fs.appendFileSync(hist, JSON.stringify(entry) + '\n');

// 2. context_resume — next build state
const resume = path.join(ROOT, 'history', 'context_resume.md');
fs.writeFileSync(resume, `# Context Resume

Last updated: ${new Date().toISOString()}

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
`);

// 3. decision log
const dl = path.join(ROOT, 'history', 'decision_log.md');
const line = `\n## ${new Date().toISOString()}\n- job-001: ingested monthlystaff.com; built static rebrand "Teamloop" in exports/teamloop/.\n- Rebranded palette kept source design language (green #1dbf73 primary, ink #222325, cream #f7f7f2, Inter).\n- QA 28/28 passed; no source content leaked (verified by qa/checks/job-001.js).\n`;
fs.appendFileSync(dl, line);

console.log('history updated');

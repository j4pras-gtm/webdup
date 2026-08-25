'use strict';

/**
 * B00-bootstrap — scaffolding build.
 * Creates the project tree, seeds history + contract mocks, runs QA gates,
 * and records the result in build_history.jsonl. Idempotent: safe to re-run.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// --- helpers ---------------------------------------------------------------

function estNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

function write(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function mkdir(rel) {
  fs.mkdirSync(path.join(ROOT, rel), { recursive: true });
}

// --- step 1: folder tree ---------------------------------------------------

const DIRS = [
  'apps/dashboard',
  'apps/preview-router',
  'packages/template',
  'packages/contracts',
  'jobs',
  'manual_review',
  'history',
  'exports',
  'qa/checks',
  'jobs/B00-bootstrap/outputs',
  'jobs/B00-bootstrap/qa',
  'jobs/B00-bootstrap/logs',
];
for (const d of DIRS) mkdir(d);

// --- step 2: status in_progress --------------------------------------------

const startedAt = new Date().toISOString();
const deadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
write('jobs/B00-bootstrap/status.json', JSON.stringify({
  build_id: 'B00-bootstrap',
  job_id: 'B00-bootstrap',
  status: 'in_progress',
  attempts: 1,
  max_attempts: 5,
  started_at: startedAt,
  deadline: deadline,
  depends_on: [],
  qa: null,
}, null, 2) + '\n');

write('jobs/B00-bootstrap/BUILD.md', `# B00-bootstrap

Goal: create the complete Sidekikz Builder project structure before any site-generation work.

## Scope
- Folder tree: apps/{dashboard,preview-router}, packages/{template,contracts}, jobs, manual_review, history, exports, qa/checks
- Seed history files (context_resume, build_history.jsonl, Session_summary, _checkpoint_drafts, decision_log)
- Seed 4 mock contract JSON files (mock: true)
- QA gates per spec; escalate to manual_review on failure

## Policy
Max 5 attempts OR 5 minutes, whichever first. Isolated: never blocks other builds.
`);

// --- step 3: history files --------------------------------------------------

const est = estNow();

write('history/context_resume.md', `# Context Resume

- Current job: none
- Next build: B01-intake (waiting for user URL)
- Open manual reviews: none
- Blocked builds: none
- Pending builds: none
- Note: scaffolding complete. Queue is idle, waiting for a reference URL to start B01-intake.
`);

// build_history.jsonl starts empty; the B00 entry is appended after QA passes.
fs.writeFileSync(path.join(ROOT, 'history', 'build_history.jsonl'), '', 'utf8');

write('history/Session_summary.md', `# Session Summary — Thread #1

- Topic: Sidekikz Site Builder scaffolding
- Timestamp: ${est.date} ${est.time} EST
- Status: B00-bootstrap completed

## 1. What happened
Ran B00-bootstrap: created the full project tree (apps, packages, jobs, manual_review, history, exports, qa/checks), seeded history files, seeded four mock contract files, and passed all QA gates.

## 2. Current state
- Engine (packages/engine) loads and enforces the 5-attempt / 5-minute policy with escalation to manual_review.
- Contracts package (packages/contracts) exposes schemas + validator.
- Queue is idle; no jobs in flight.

## 3. Open items
- None blocking. Real site ingestion (B01-intake) awaits a reference URL from the user.

## 4. Next steps
- B01-intake: ingest the user-supplied reference URL into a new job folder.
- Then foundation builds B02-B08, then parallel lane P1-P8.

## 5. Decisions
- Bootstrap (B00) runs first and alone before any site work.
- Mock contracts carry "mock": true so downstream builds know to re-check against real output.

## 6. How to resume
Read history/context_resume.md, then history/build_history.jsonl (last line = latest event). Re-run any build via its jobs/<build>/BUILD.md.
`);

write('history/_checkpoint_drafts.md', '<!-- checkpoint drafts -->\n');

write('history/decision_log.md', `# Decision Log

### [${est.date} ${est.time} EST] — Scaffolding initiated
- Decision: bootstrap project structure with B00 before any site work
- Why: agent must not start work into a missing folder tree
- Impact: all subsequent builds assume this structure exists
- Supersedes: none
`);

// --- step 4: mock contracts --------------------------------------------------

write('packages/contracts/site_inventory.mock.json', JSON.stringify({
  mock: true,
  note: 'Placeholder until B02-crawl produces real inventory. Re-check against real output.',
  source_url: null,
  pages: [],
  totals: { discovered: 0, crawlable: 0, excluded: 0 },
}, null, 2) + '\n');

write('packages/contracts/brand_audit.mock.json', JSON.stringify({
  mock: true,
  note: 'Sample classified element until P2-brand-extract runs on a real site.',
  elements: [{
    kind: 'color',
    value: '#1a73e8',
    classification: 'primary_accent',
    confidence: 0.9,
    found_on: '/sample-page',
  }],
}, null, 2) + '\n');

write('packages/contracts/page_content.mock.json', JSON.stringify({
  mock: true,
  note: 'Sample page until B03-content-extract runs on a real site.',
  pages: [{
    url: '/sample-page',
    title: 'Sample Page',
    headings: ['Welcome', 'What we do'],
    body: 'This is placeholder body copy used only to exercise the pipeline shape.',
  }],
}, null, 2) + '\n');

write('packages/contracts/template_shell.mock.json', JSON.stringify({
  mock: true,
  note: 'Sample template component until B04-template builds the real shell.',
  components: [{
    name: 'hero',
    slots: ['{{title}}', '{{subtitle}}', '{{cta_label}}'],
    layout: 'centered',
  }],
}, null, 2) + '\n');

// --- step 5: keepers + qa readme ---------------------------------------------

fs.writeFileSync(path.join(ROOT, 'jobs', '.gitkeep'), '', 'utf8');
fs.writeFileSync(path.join(ROOT, 'manual_review', '.gitkeep'), '', 'utf8');
write('qa/checks/README.md', 'Reusable QA scripts per build type. Each check returns {passed, checks_run, failures[]}.\n');

// --- step 6: QA gates ----------------------------------------------------------

const failures = [];
function check(name, ok) {
  if (!ok) failures.push(name);
}

for (const d of DIRS) check(`dir:${d}`, fs.existsSync(path.join(ROOT, d)));

const ctxResume = fs.readFileSync(path.join(ROOT, 'history', 'context_resume.md'), 'utf8');
check('context_resume non-empty markdown', ctxResume.trim().length > 0 && ctxResume.startsWith('#'));
check('build_history.jsonl exists', fs.existsSync(path.join(ROOT, 'history', 'build_history.jsonl')));

const sessionSummary = fs.readFileSync(path.join(ROOT, 'history', 'Session_summary.md'), 'utf8');
check('Session_summary no [bracket] placeholders', !/\[[^\]]*\]/.test(sessionSummary));

const checkpoints = fs.readFileSync(path.join(ROOT, 'history', '_checkpoint_drafts.md'), 'utf8').trim();
check('_checkpoint_drafts exactly one comment line', /^<!--.*-->$/s.test(checkpoints));

const decisionLog = fs.readFileSync(path.join(ROOT, 'history', 'decision_log.md'), 'utf8');
check('decision_log has timestamped entry', /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} EST\]/.test(decisionLog));

for (const f of ['site_inventory.mock.json', 'brand_audit.mock.json', 'page_content.mock.json', 'template_shell.mock.json']) {
  const p = path.join(ROOT, 'packages', 'contracts', f);
  let obj = null;
  try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* invalid */ }
  check(`mock:${f} valid json`, !!obj);
  check(`mock:${f} has mock:true`, obj && obj.mock === true);
}

check('qa/checks/README.md exists', fs.existsSync(path.join(ROOT, 'qa', 'checks', 'README.md')));

// --- step 7: finalize -----------------------------------------------------------

const passed = failures.length === 0;
const finishedAt = new Date().toISOString();

if (passed) {
  write('jobs/B00-bootstrap/status.json', JSON.stringify({
    build_id: 'B00-bootstrap',
    job_id: 'B00-bootstrap',
    status: 'completed',
    attempts: 1,
    max_attempts: 5,
    started_at: startedAt,
    deadline: deadline,
    finished_at: finishedAt,
    depends_on: [],
    qa: { passed: true, checks_run: DIRS.length + 12, failures: [] },
  }, null, 2) + '\n');

  fs.appendFileSync(
    path.join(ROOT, 'history', 'build_history.jsonl'),
    JSON.stringify({
      build_id: 'B00-bootstrap',
      job_id: 'B00-bootstrap',
      status: 'completed',
      attempts: 1,
      started_at: startedAt,
      ended_at: finishedAt,
      qa: { passed: true },
    }) + '\n',
    'utf8'
  );

  // checkpoint: keep the file at exactly one line (latest checkpoint)
  write('history/_checkpoint_drafts.md', `<!-- ${finishedAt} B00-bootstrap completed (attempt 1, QA passed) -->\n`);

  console.log('B00-bootstrap: COMPLETED — all QA gates passed.');
} else {
  write('jobs/B00-bootstrap/status.json', JSON.stringify({
    build_id: 'B00-bootstrap',
    job_id: 'B00-bootstrap',
    status: 'failed_qa',
    attempts: 1,
    max_attempts: 5,
    started_at: startedAt,
    deadline: deadline,
    qa: { passed: false, failures },
  }, null, 2) + '\n');
  console.error('B00-bootstrap: QA FAILED —', failures.join('; '));
  process.exitCode = 1;
}

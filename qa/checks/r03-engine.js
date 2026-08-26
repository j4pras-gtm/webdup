'use strict';
/** R03-engine QA: engine loads; QA hook gates completion; escalation writes full dossier. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const eng = require(path.join(ROOT, 'packages', 'engine'));

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail: detail || '' }); }

// 1. exports intact
for (const k of ['runBuild', 'escalate', 'writeStatus', 'appendHistory', 'ROOT', 'MAX_ATTEMPTS', 'MAX_MS']) {
  check('export: ' + k, typeof eng[k] !== 'undefined');
}
check('MAX_ATTEMPTS === 5', eng.MAX_ATTEMPTS === 5);
check('MAX_MS === 300000', eng.MAX_MS === 300000);

// 2. QA hook blocks completion (build succeeds but QA fails -> retry -> escalate)
(async () => {
  const jobDir = path.join(ROOT, 'jobs', 'qa-r03-test', 'R03-qa-hook-test');
  fs.mkdirSync(jobDir, { recursive: true });
  const mrDir = path.join(ROOT, 'manual_review', 'R03-qa-hook-test');

  let runs = 0;
  const res = await eng.runBuild({
    id: 'R03-qa-hook-test',
    jobId: 'qa-r03-test',
    goal: 'QA hook test',
    inputs: { n: 1 },
    expectedOutput: 'result === "ok" AND qa passes',
    validationCriteria: 'runBuild returns ok:false because qa.passed is false on every attempt',
    run: async () => { runs++; return 'ok'; },
    qa: () => ({ passed: false, checks_run: 1, failures: ['deliberate failure'] }),
  });
  check('QA-failing build does not complete', res.ok === false && res.status === 'blocked_manual_review');
  check('retried all 5 attempts', runs === 5, String(runs));

  // 3. full dossier present (spec §29)
  for (const f of ['REVIEW.md', 'context.json', 'attempts.md', 'error.log', 'files_touched.txt', 'diff.patch', 'expected_output.md']) {
    check('dossier file: ' + f, fs.existsSync(path.join(mrDir, f)));
  }
  check('dossier dir: artifacts/', fs.existsSync(path.join(mrDir, 'artifacts')));
  const review = fs.readFileSync(path.join(mrDir, 'REVIEW.md'), 'utf8');
  for (const h of ['## Build goal', '## Inputs', '## Expected output contract', '## Current failure', '## All attempts', '## Relevant artifacts', '## Exact unresolved question / action', '## Validation criteria']) {
    check('REVIEW.md section: ' + h, review.includes(h));
  }
  check('REVIEW.md lists 5 attempts', (review.match(/attempt \d/g) || []).length >= 5);

  // 4. passing QA completes on first attempt
  let runs2 = 0;
  const res2 = await eng.runBuild({
    id: 'R03-qa-pass-test',
    jobId: 'qa-r03-test',
    run: async () => { runs2++; return 'ok'; },
    qa: () => ({ passed: true, checks_run: 1, failures: [] }),
  });
  check('QA-passing build completes attempt 1', res2.ok === true && res2.attempts === 1 && runs2 === 1);

  // 5. legacy build (no qa hook) still completes, flagged skipped
  const res3 = await eng.runBuild({
    id: 'R03-legacy-test',
    jobId: 'qa-r03-test',
    run: async () => 'legacy',
  });
  check('legacy build completes with qa.skipped', res3.ok === true && res3.qa && res3.qa.skipped === true);

  // cleanup test fixtures
  fs.rmSync(path.join(ROOT, 'jobs', 'qa-r03-test'), { recursive: true, force: true });
  fs.rmSync(mrDir, { recursive: true, force: true });

  let pass = 0;
  for (const c of checks) {
    console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
    if (c.ok) pass++;
  }
  console.log('\n' + pass + '/' + checks.length + ' checks passed');
  process.exit(pass === checks.length ? 0 : 1);
})();

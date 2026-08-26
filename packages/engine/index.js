'use strict';

/**
 * Sidekikz Builder — build engine (revised spec, R03).
 *
 * Policy per build: max 5 attempts OR 5 minutes wall-clock, whichever first.
 * On exhaustion the build escalates to manual_review/<buildId>/ with a full
 * dossier (spec §29) and stops. Builds are isolated: a failure in one never
 * blocks another.
 *
 * QA is mandatory (spec §27): a build that provides a `qa` hook cannot be
 * marked completed unless the hook returns {passed: true}. A build without a
 * qa hook is legacy and is recorded with qa.skipped = true.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_ATTEMPTS = 5;
const MAX_MS = 5 * 60 * 1000; // 5 minutes

function nowIso() {
  return new Date().toISOString();
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function appendJsonl(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(data) + '\n', 'utf8');
}

function writeStatus(build, status, attempts, extra) {
  const file = path.join(ROOT, 'jobs', build.jobId || build.id, build.id, 'status.json');
  writeJson(file, Object.assign({
    build_id: build.id,
    job_id: build.jobId || build.id,
    status: status,
    attempts: attempts,
    ts: nowIso(),
  }, extra || {}));
}

function appendHistory(build, status, attempts, extra) {
  appendJsonl(path.join(ROOT, 'history', 'build_history.jsonl'), Object.assign({
    build_id: build.id,
    job_id: build.jobId || build.id,
    status: status,
    attempts: attempts,
    ts: nowIso(),
  }, extra || {}));
}

// ---------------------------------------------------------------------------
// Escalation dossier (spec §29)
// ---------------------------------------------------------------------------

/** Files modified under the job dir since `sinceMs` (fallback file-touch list). */
function touchedFilesSince(jobDir, sinceMs) {
  const out = [];
  if (!fs.existsSync(jobDir)) return out;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          if (fs.statSync(p).mtimeMs >= sinceMs) out.push(p.replace(ROOT + path.sep, ''));
        } catch (_) { /* ignore */ }
      }
    }
  })(jobDir);
  return out.sort();
}

function gitDiffPatch() {
  try {
    return execSync('git diff HEAD', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      || '(no uncommitted changes)';
  } catch (_) {
    return '(git diff unavailable — not a repository or no HEAD)';
  }
}

function copyArtifacts(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return false;
  fs.mkdirSync(destDir, { recursive: true });
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const s = path.join(dir, e.name);
      const d = path.join(destDir, e.name);
      if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s); }
      else fs.copyFileSync(s, d);
    }
  })(srcDir);
  return true;
}

/**
 * Write the full manual-review dossier for a failed build.
 *
 * @param {object} build { id, jobId, run, goal?, inputs?, expectedOutput?, validationCriteria? }
 * @param {number} attempts
 * @param {Error|string} error
 * @param {Array<{attempt:number, ts:string, error:string}>} attemptLog
 */
function escalate(build, attempts, error, attemptLog) {
  const id = build.id;
  const jobId = build.jobId || build.id;
  const dir = path.join(ROOT, 'manual_review', id);
  fs.mkdirSync(dir, { recursive: true });
  const errText = error ? String(error.message || error) : 'max attempts or deadline reached';
  const log = attemptLog || [];

  // context.json
  writeJson(path.join(dir, 'context.json'), {
    build_id: id,
    job_id: jobId,
    status: 'blocked_manual_review',
    attempts: attempts,
    error: errText,
    ts: nowIso(),
  });

  // REVIEW.md — must let a frontier model solve the issue blind (spec §29)
  const review = [
    '# Manual review: ' + id,
    '',
    '## Build goal',
    build.goal || '(not recorded — see jobs/' + jobId + '/' + id + '/BUILD.md)',
    '',
    '## Inputs',
    build.inputs ? JSON.stringify(build.inputs, null, 2) : '(not recorded)',
    '',
    '## Expected output contract',
    build.expectedOutput || '(not recorded — see BUILD.md "Done condition")',
    '',
    '## Current failure',
    errText,
    '',
    '## All attempts',
    log.length ? log.map(a => '- attempt ' + a.attempt + ' @ ' + a.ts + ': ' + a.error).join('\n') : '- (no attempt log)',
    '',
    '## Relevant artifacts',
    '- manual_review/' + id + '/artifacts/ (copy of build outputs, if any)',
    '- jobs/' + jobId + '/' + id + '/ (BUILD.md, status.json, outputs/, qa/, logs/)',
    '',
    '## Exact unresolved question / action',
    build.unresolvedQuestion || 'What root cause should be fixed before re-triggering this build?',
    '',
    '## Validation criteria',
    build.validationCriteria || '(not recorded — re-run the build\'s QA gate; it must pass)',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'REVIEW.md'), review, 'utf8');

  // attempts.md
  fs.writeFileSync(path.join(dir, 'attempts.md'),
    '# Attempts: ' + id + '\n\n' +
    (log.length ? log.map(a => '## Attempt ' + a.attempt + ' — ' + a.ts + '\n\n' + a.error + '\n').join('\n') : '(none recorded)\n'),
    'utf8');

  // error.log
  fs.writeFileSync(path.join(dir, 'error.log'),
    '[' + nowIso() + '] ' + errText + '\n' +
    log.map(a => '[' + a.ts + '] attempt ' + a.attempt + ': ' + a.error).join('\n') + '\n',
    'utf8');

  // files_touched.txt
  const jobDir = path.join(ROOT, 'jobs', jobId);
  const touched = (build.filesTouched && typeof build.filesTouched === 'function')
    ? build.filesTouched()
    : touchedFilesSince(jobDir, Date.now() - MAX_MS);
  fs.writeFileSync(path.join(dir, 'files_touched.txt'), (touched.length ? touched : ['(none detected)']).join('\n') + '\n', 'utf8');

  // diff.patch
  fs.writeFileSync(path.join(dir, 'diff.patch'), gitDiffPatch(), 'utf8');

  // expected_output.md
  fs.writeFileSync(path.join(dir, 'expected_output.md'),
    (build.expectedOutput || '(not recorded)') + '\n', 'utf8');

  // artifacts/ (always present per spec §29; populated when outputs exist)
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  const hasArtifacts = copyArtifacts(path.join(jobDir, id, 'outputs'), path.join(dir, 'artifacts'));
  if (!hasArtifacts) {
    fs.writeFileSync(path.join(dir, 'artifacts', 'README.txt'),
      '(no build outputs to copy at escalation time)\n', 'utf8');
  }

  writeStatus(build, 'blocked_manual_review', attempts, { blocked_reason: errText });
  appendHistory(build, 'blocked_manual_review', attempts, { error: errText });
  return { ok: false, status: 'blocked_manual_review', attempts: attempts, error: errText };
}

// ---------------------------------------------------------------------------
// Build runner
// ---------------------------------------------------------------------------

/**
 * Run a build with the standard policy.
 *
 * @param {object} build
 *   { id, jobId,
 *     run: async (attempt:number) => result,
 *     qa?:  (result) => {passed:boolean, checks_run?:number, failures?:string[]},
 *     goal?, inputs?, expectedOutput?, validationCriteria?, unresolvedQuestion?,
 *     filesTouched?: () => string[] }
 * @returns {Promise<{ok:boolean, status:string, attempts:number, result?:any, qa?:object}>}
 */
async function runBuild(build) {
  const startedAt = Date.now();
  let lastError = null;
  const attemptLog = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt >= MAX_MS) {
      return escalate(build, attempt, new Error('5-minute deadline exceeded'), attemptLog);
    }
    try {
      const result = await build.run(attempt);

      // QA gate (spec §27): a build never completes without QA passing.
      let qa;
      if (typeof build.qa === 'function') {
        qa = await build.qa(result);
        if (!qa || qa.passed !== true) {
          const msg = 'QA failed: ' + ((qa && qa.failures && qa.failures.join('; ')) || 'qa hook did not return passed:true');
          lastError = new Error(msg);
          attemptLog.push({ attempt, ts: nowIso(), error: msg });
          writeStatus(build, 'retrying', attempt, { error: msg, qa: qa || null });
          appendHistory(build, 'retrying', attempt, { error: msg, qa: qa || null });
          continue;
        }
      } else {
        qa = { passed: true, skipped: true }; // legacy build without a qa hook
      }

      writeStatus(build, 'completed', attempt, { result: result, qa: qa });
      appendHistory(build, 'completed', attempt, { result: result, qa: qa });
      return { ok: true, status: 'completed', attempts: attempt, result: result, qa: qa };
    } catch (err) {
      lastError = err;
      const msg = String(err.message || err);
      attemptLog.push({ attempt, ts: nowIso(), error: msg });
      writeStatus(build, 'retrying', attempt, { error: msg });
      appendHistory(build, 'retrying', attempt, { error: msg });
    }
  }
  return escalate(build, MAX_ATTEMPTS, lastError, attemptLog);
}

module.exports = { runBuild, escalate, writeStatus, appendHistory, ROOT, MAX_ATTEMPTS, MAX_MS };

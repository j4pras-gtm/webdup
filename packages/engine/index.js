'use strict';

/**
 * Sidekikz Builder — build engine.
 *
 * Policy per build: max 5 attempts OR 5 minutes wall-clock, whichever first.
 * On exhaustion the build escalates to manual_review/<buildId>/ and stops.
 * Builds are isolated: a failure in one never blocks another.
 */

const fs = require('fs');
const path = require('path');

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

function escalate(build, attempts, error) {
  const dir = path.join(ROOT, 'manual_review', build.id);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    build_id: build.id,
    job_id: build.jobId || build.id,
    status: 'blocked_manual_review',
    attempts: attempts,
    error: error ? String(error.message || error) : 'max attempts or deadline reached',
    ts: nowIso(),
  };
  writeJson(path.join(dir, 'context.json'), payload);
  fs.writeFileSync(path.join(dir, 'REVIEW.md'),
    '# Manual review: ' + build.id + '\n\n' +
    '- Attempts: ' + attempts + '\n' +
    '- Error: ' + payload.error + '\n' +
    '- Next question: what root cause should be fixed before re-triggering this build?\n',
    'utf8');
  writeStatus(build, 'blocked_manual_review', attempts, { blocked_reason: payload.error });
  appendHistory(build, 'blocked_manual_review', attempts, { error: payload.error });
  return { ok: false, status: 'blocked_manual_review', attempts: attempts, error: payload.error };
}

/**
 * Run a build with the standard policy.
 *
 * @param {object} build { id, jobId, run: (attempt:number)=>any }
 * @returns {Promise<{ok:boolean, status:string, attempts:number}>}
 */
async function runBuild(build) {
  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt >= MAX_MS) {
      return escalate(build, attempt, new Error('5-minute deadline exceeded'));
    }
    try {
      const result = await build.run(attempt);
      writeStatus(build, 'completed', attempt, { result: result });
      appendHistory(build, 'completed', attempt, { result: result });
      return { ok: true, status: 'completed', attempts: attempt, result: result };
    } catch (err) {
      lastError = err;
      writeStatus(build, 'retrying', attempt, { error: String(err.message || err) });
      appendHistory(build, 'retrying', attempt, { error: String(err.message || err) });
    }
  }
  return escalate(build, MAX_ATTEMPTS, lastError);
}

module.exports = { runBuild, escalate, writeStatus, appendHistory, ROOT, MAX_ATTEMPTS, MAX_MS };

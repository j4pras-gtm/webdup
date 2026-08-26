'use strict';
/**
 * Build phase (revised spec §22–§25): B01–B10 micro-builds producing the
 * portable artifact. Consumes confirmed analysis + extracted assets +
 * user-supplied data + build config. Anti-fabrication enforced at B10 via
 * the generic QA gate (§23/§24).
 */

const fs = require('fs');
const path = require('path');
const engine = require('../engine');
const hitl = require('../hitl');
const P = require('../analyze/pipeline');
const G = require('./generate');
const QA = require('./lib/qa-gate');

const ROOT = P.ROOT;

function loadConfig(jobId) {
  const f = path.join(P.jobDir(jobId), 'build-config.json');
  const cfg = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  cfg.job_id = jobId;
  cfg.brand = cfg.brand || {};
  return cfg;
}

/**
 * Run one build micro-build. QA hooks receive (result, jobId).
 */
async function runBuildStage(jobId, buildId, goal, work, qa) {
  hitl.requireConfirmed(jobId); // gate: builds need confirmed analysis
  const dir = path.join(P.jobDir(jobId), buildId);
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'qa'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'BUILD.md'), '# ' + buildId + '\n\n' + goal + '\n\nPhase: build. Inputs: confirmed analysis + extracted assets + user data + config.\n', 'utf8');
  const res = await engine.runBuild({
    id: buildId, jobId, goal, inputs: { job_id: jobId },
    expectedOutput: goal.split('\n')[0], validationCriteria: 'QA hook returns passed:true',
    run: async () => work(jobId), qa: (result) => qa(result, jobId),
  });
  fs.writeFileSync(path.join(dir, 'qa', 'report.json'), JSON.stringify(res.qa || res, null, 2) + '\n', 'utf8');
  return res;
}

function readManifest(jobId) {
  return JSON.parse(fs.readFileSync(path.join(G.artifactDir(jobId), 'manifest.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// Stage table: [buildId, goal, work(jobId), qa(result, jobId)]
// ---------------------------------------------------------------------------
const STAGES = [
  ['B01-build-shell', 'Create the portable artifact shell (dir structure + manifest).',
    (j) => G.b01Shell(j),
    (r) => ({ passed: !!(r && r.manifestFile === 'manifest.json'), checks_run: 1, failures: r ? [] : ['no shell'] })],

  ['B02-build-components', 'Generate reusable components (header/footer/card) from confirmed wireframe roles.',
    (j) => G.b02Components(j),
    (r, j) => {
      const fails = [];
      for (const name of ['header', 'footer', 'card']) {
        if (!fs.existsSync(path.join(G.artifactDir(j), 'components', name + '.html'))) fails.push('missing component: ' + name);
      }
      return { passed: fails.length === 0, checks_run: 3, failures: fails };
    }],

  ['B03-inject-design', 'Emit tokens.css from the confirmed design-token layer.',
    (j) => G.b03Design(j),
    (r) => ({ passed: !!(r && r.colors > 0), checks_run: 1, failures: r ? [] : ['no colors'] })],

  ['B04-inject-content', 'Fill placeholders from user-supplied data; record unresolved required fields.',
    (j) => G.b04Content(j),
    (r) => ({ passed: !!(r && typeof r.filled === 'object'), checks_run: 1, failures: r ? [] : ['no content step'] })],

  ['B05-build-routes', 'Render every confirmed route from its wireframe (no invented pages).',
    (j) => G.b05Routes(j),
    (r, j) => {
      const scope = hitl.requireConfirmed(j).confirmed_scope;
      const fails = [];
      for (const rt of scope.routes) if (!r.rendered.some(x => x.path === rt)) fails.push('confirmed route not rendered: ' + rt);
      return { passed: fails.length === 0, checks_run: 1, failures: fails };
    }],

  ['B06-build-interactions', 'Emit interactions.js containing ONLY mechanisms present in the confirmed interaction spec.',
    (j) => G.b06Interactions(j),
    (r, j) => {
      const inter = P.readArtifact(j, 'interactions.json') || { interactions: [] };
      const known = new Set(inter.interactions.map(i => i.mechanism));
      const fails = (r.mechanisms || []).filter(m => !known.has(m));
      return { passed: fails.length === 0, checks_run: 1, failures: fails.map(m => 'fabricated mechanism: ' + m) };
    }],

  ['B07-build-responsive', 'Emit responsive.css using only confirmed breakpoints.',
    (j) => G.b07Responsive(j),
    (r) => ({ passed: !!(r && typeof r.breakpoints === 'number'), checks_run: 1, failures: r ? [] : ['no responsive step'] })],

  ['B08-build-static', 'Finalize the artifact manifest (routes/components/interactions/collections/external links).',
    (j) => G.b08Static(j),
    (r) => {
      const fails = [];
      if (!(r.manifest.routes || []).length) fails.push('manifest has no routes');
      if (r.manifest.portable !== true) fails.push('manifest not marked portable');
      return { passed: fails.length === 0, checks_run: 2, failures: fails };
    }],

  ['B09-local-preview', 'Verify the artifact is locally viewable: every referenced local asset exists.',
    (j) => G.b09Preview(j),
    (r) => ({ passed: !!r.ok, checks_run: 1, failures: (r.missing || []).map(m => 'missing local asset: ' + m) })],

  ['B10-final-QA', 'Run the generic Build QA gate against the confirmed analysis (route/interaction/dynamic/content/asset/link/anti-fabrication).',
    (j) => readManifest(j),
    (m, j) => QA.runBuildQA(j, m)],
];

async function runBuildPhase(jobId, cfg) {
  const results = {};
  const completed = [];
  for (const [id, goal, work, qa] of STAGES) {
    const res = await runBuildStage(jobId, id, goal, work, qa);
    results[id] = res;
    if (res.ok) completed.push(id);
    else return { completed, blocked: id, results };
  }
  return { completed, results };
}

module.exports = { ROOT, loadConfig, runBuildStage, runBuildPhase, STAGES };

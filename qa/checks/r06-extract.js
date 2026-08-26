'use strict';
/** R06-extract-builds QA: E01–E08 operate only on confirmed analysis; manifest consistent. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const B3 = require(path.join(ROOT, 'packages', 'analyze', 'builds3'));
const hitl = require(path.join(ROOT, 'packages', 'hitl'));
const EX = require(path.join(ROOT, 'packages', 'extract'));
const contracts = require(path.join(ROOT, 'packages', 'contracts'));

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

(async () => {
  const cardBlock = Array.from({ length: 4 }, (_, i) => `<div class="profile-card"><h3>Person ${i + 1}</h3><img src="/img/p${i}.png" alt=""><a href="/profiles/person-${i}">View</a></div>`).join('');
  const pages = {
    '/': `<!doctype html><html><head><title>Fixture Co</title><style>body{color:#111;border-radius:8px}</style></head><body>
      <header><a class="logo" href="/"><img src="/img/logo.png" alt="Fixture Co"></a><nav><a href="/">Home</a><a href="/services">Services</a></nav></header>
      <main><section class="hero"><h1>We do things</h1><p>Tagline.</p></section><section class="grid">${cardBlock}</section></main>
      <footer><p>Footer</p><a href="https://www.linkedin.com/company/fixture">LinkedIn</a></footer></body></html>`,
    '/services': '<!doctype html><html><head><title>Services</title></head><body><header><nav><a href="/">Home</a></nav></header><main><h1>Services</h1></main><footer><p>F</p></footer></body></html>',
    '/robots.txt': 'User-agent: *\n',
    '/sitemap.xml': '<urlset><url><loc>http://127.0.0.1:PORT/</loc></url><url><loc>http://127.0.0.1:PORT/services</loc></url></urlset>',
  };
  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    if (pages[p] !== undefined) { res.writeHead(200); res.end(pages[p]); } else { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  pages['/sitemap.xml'] = pages['/sitemap.xml'].replace(/PORT/g, String(server.address().port));

  const jobId = 'qa-r06-extract';
  const an = await B3.runAnalyzePhase(jobId, origin + '/');
  check('analyze completed (prereq)', an.completed.length === 13, 'completed=' + an.completed.length);

  // narrow scope: drop /services — extraction must respect that
  hitl.generateReviewReport(jobId);
  hitl.recordConfirmation(jobId, { decision: 'narrowed', removed_pages: ['/services'], user_supplied_data: { brand_name: 'NewCo' } });

  // gate: extract before confirmation is impossible (already confirmed here; test on fresh job instead)
  const outcome = await EX.runExtractPhase(jobId);
  check('extract phase: all 8 completed', outcome.completed.length === 8, 'completed=' + outcome.completed.length + (outcome.blocked ? ' blocked at ' + outcome.blocked : ''));
  if (outcome.blocked) {
    try { console.log(fs.readFileSync(path.join(ROOT, 'manual_review', outcome.blocked, 'error.log'), 'utf8').slice(0, 500)); } catch (_) {}
  }

  const readX = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'jobs', jobId, 'extraction', f), 'utf8'));
  if (!outcome.blocked) {
    const scope = readX('confirmed-scope.json');
    check('E01: narrowed routes only', JSON.stringify(scope.routes) === JSON.stringify(['/']));
    check('E01: user data carried', scope.user_supplied_data.brand_name === 'NewCo');

    const struct = readX('structure-assets.json');
    check('E02: structure only for confirmed route', struct.assets.every(a => a.route === '/') && struct.assets.length === 1);
    check('E02: headings placeholderized', !JSON.stringify(struct.assets).includes('We do things'));

    const content = readX('content-assets.json');
    check('E03: content schemas extracted', content.assets.some(a => a.kind === 'content_schema' && a.entity === 'site-copy'));
    check('E03: examples placeholderized', !JSON.stringify(content.assets).includes('Person 1'));

    const media = readX('media-assets.json');
    check('E04: media slots only (no copied bytes)', media.assets.length > 0 && media.assets.every(a => a.source_copied === false));
    check('E04: logo slot present', media.assets.some(a => a.slot === 'logo'));

    const design = readX('design-assets.json');
    check('E05: token layer rebrandable', design.assets[0].rebrandable === true && design.assets[0].colors.length > 0);

    const integ = readX('integration-manifest.json');
    check('E06: endpoints record-only', integ.endpoints.every(e => e.treatment === 'record_only') && integ.endpoints.length >= 1);

    const ph = readX('placeholder-schema.json');
    check('E07: finalized (draft:false)', ph.draft === false);
    check('E07: required fields listed', ph.required_fields.length > 0);

    const man = readX('extraction-manifest.json');
    check('E08: manifest validates', contracts.validate('extraction-manifest', man).passed);
    check('E08: no high-severity gaps', man.gaps.filter(g => g.severity === 'high').length === 0, JSON.stringify(man.gaps));
    check('E08: counts consistent', man.counts.structure === struct.assets.length && man.counts.media === media.assets.length && man.counts.design === design.assets.length);
  }

  // per-build status files
  for (const id of outcome.completed) {
    const sf = path.join(ROOT, 'jobs', jobId, id, 'status.json');
    check('status.json: ' + id, fs.existsSync(sf) && JSON.parse(fs.readFileSync(sf, 'utf8')).status === 'completed');
  }

  server.close();

  // cleanup
  fs.rmSync(path.join(ROOT, 'jobs', jobId), { recursive: true, force: true });
  const mrRoot = path.join(ROOT, 'manual_review');
  if (fs.existsSync(mrRoot)) for (const d of fs.readdirSync(mrRoot)) {
    try { const ctx = JSON.parse(fs.readFileSync(path.join(mrRoot, d, 'context.json'), 'utf8')); if (ctx.job_id === jobId) fs.rmSync(path.join(mrRoot, d), { recursive: true, force: true }); } catch (_) {}
  }
  const hf = path.join(ROOT, 'history', 'build_history.jsonl');
  fs.writeFileSync(hf, fs.readFileSync(hf, 'utf8').trim().split('\n').filter(l => !l.includes(jobId)).join('\n') + '\n');

  let pass = 0;
  for (const c of checks) {
    console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
    if (c.ok) pass++;
  }
  console.log('\n' + pass + '/' + checks.length + ' checks passed');
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('QA crashed:', e); process.exit(1); });

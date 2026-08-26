'use strict';
/** R05-hitl QA: review report generation + confirmation record + gate enforcement. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const hitl = require(path.join(ROOT, 'packages', 'hitl'));
const B3 = require(path.join(ROOT, 'packages', 'analyze', 'builds3'));

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

(async () => {
  // fixture site (same shape as R04)
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

  const jobId = 'qa-r05-hitl';
  const outcome = await B3.runAnalyzePhase(jobId, origin + '/');
  check('analyze phase completed (prereq)', outcome.completed.length === 13, 'completed=' + outcome.completed.length);

  // 1. review report
  const rel = hitl.generateReviewReport(jobId);
  check('report path', rel === 'analysis/REVIEW.md');
  const md = fs.readFileSync(path.join(ROOT, 'jobs', jobId, rel), 'utf8');
  for (const h of ['# Analysis Review — ' + jobId, '## Site structure', '### Routes', '## Reusable assets', '## Personalization — what you need to supply', 'Detected integrations']) {
    check('REVIEW.md has: ' + h, md.includes(h));
  }
  check('REVIEW.md lists /services route', md.includes('/services'));
  check('REVIEW.md lists linkedin endpoint', md.includes('linkedin'));

  // 2. gate blocks before confirmation
  let threw = false;
  try { hitl.requireConfirmed(jobId); } catch (_) { threw = true; }
  check('gate blocks before confirmation', threw);

  // 3. invalid decision rejected
  threw = false;
  try { hitl.recordConfirmation(jobId, { decision: 'banana' }); } catch (_) { threw = true; }
  check('invalid decision rejected', threw);

  // 4. narrowing cannot add scope (removal of unknown page rejected)
  threw = false;
  try { hitl.recordConfirmation(jobId, { decision: 'narrowed', removed_pages: ['/not-in-analysis'] }); } catch (_) { threw = true; }
  check('cannot remove page not in analysis', threw);

  // 5. valid narrowed confirmation
  const rec = hitl.recordConfirmation(jobId, { decision: 'narrowed', removed_pages: ['/services'], user_supplied_data: { brand_name: 'NewCo' }, note: 'drop services' });
  check('confirmation recorded', rec.decision === 'narrowed');
  check('confirmed_scope excludes removed route', !rec.confirmed_scope.routes.includes('/services') && rec.confirmed_scope.routes.includes('/'));
  check('removed_pages recorded', rec.removed_pages.includes('/services'));
  check('user_supplied_data recorded', rec.user_supplied_data.brand_name === 'NewCo');

  // 6. gate passes after confirmation
  const got = hitl.requireConfirmed(jobId);
  check('gate passes after confirmation', got.job_id === jobId);
  check('confirmedRoutes returns narrowed list', JSON.stringify(hitl.confirmedRoutes(jobId)) === JSON.stringify(['/']));

  // 7. persisted record validates against schema
  const contracts = require(path.join(ROOT, 'packages', 'contracts'));
  const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'jobs', jobId, 'analysis', 'analysis-confirmation.json'), 'utf8'));
  check('on-disk record validates', contracts.validate('analysis-confirmation', onDisk).passed);

  server.close();

  // cleanup
  fs.rmSync(path.join(ROOT, 'jobs', jobId), { recursive: true, force: true });
  const mrRoot = path.join(ROOT, 'manual_review');
  if (fs.existsSync(mrRoot)) {
    for (const d of fs.readdirSync(mrRoot)) {
      try {
        const ctx = JSON.parse(fs.readFileSync(path.join(mrRoot, d, 'context.json'), 'utf8'));
        if (ctx.job_id === jobId) fs.rmSync(path.join(mrRoot, d), { recursive: true, force: true });
      } catch (_) { /* not ours */ }
    }
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

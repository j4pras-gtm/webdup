'use strict';
/** R07-build-builds QA: B01–B10 portable artifact + generic QA gate (incl. negative anti-fabrication test). */
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const B3 = require(path.join(ROOT, 'packages', 'analyze', 'builds3'));
const hitl = require(path.join(ROOT, 'packages', 'hitl'));
const EX = require(path.join(ROOT, 'packages', 'extract'));
const BD = require(path.join(ROOT, 'packages', 'build'));

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || '' }); }

function startFixture() {
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
  return new Promise(r => server.listen(0, '127.0.0.1', () => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    pages['/sitemap.xml'] = pages['/sitemap.xml'].replace(/PORT/g, String(server.address().port));
    r({ server, origin });
  }));
}

async function runPipeline(jobId, origin, { confirm, config }) {
  await B3.runAnalyzePhase(jobId, origin + '/');
  hitl.generateReviewReport(jobId);
  hitl.recordConfirmation(jobId, confirm);
  await EX.runExtractPhase(jobId);
  fs.writeFileSync(path.join(ROOT, 'jobs', jobId, 'build-config.json'), JSON.stringify(config, null, 2), 'utf8');
  return BD.runBuildPhase(jobId, BD.loadConfig(jobId));
}

function cleanup(jobId) {
  fs.rmSync(path.join(ROOT, 'jobs', jobId), { recursive: true, force: true });
  const mrRoot = path.join(ROOT, 'manual_review');
  if (fs.existsSync(mrRoot)) for (const d of fs.readdirSync(mrRoot)) {
    try { const ctx = JSON.parse(fs.readFileSync(path.join(mrRoot, d, 'context.json'), 'utf8')); if (ctx.job_id === jobId) fs.rmSync(path.join(mrRoot, d), { recursive: true, force: true }); } catch (_) {}
  }
}

(async () => {
  const { server, origin } = await startFixture();

  // ================= POSITIVE: full pipeline =================
  const jobId = 'qa-r07-build';
  const outcome = await runPipeline(jobId, origin, {
    confirm: { decision: 'confirmed' },
    config: { job_id: jobId, brand: { name: 'NewCo', tagline: 'Fresh tagline' } },
  });
  check('build phase: all 10 completed', outcome.completed.length === 10, 'completed=' + outcome.completed.length + (outcome.blocked ? ' blocked at ' + outcome.blocked : ''));
  if (outcome.blocked) {
    try { console.log(fs.readFileSync(path.join(ROOT, 'manual_review', outcome.blocked, 'error.log'), 'utf8').slice(0, 600)); } catch (_) {}
  }

  const artDir = path.join(ROOT, 'jobs', jobId, 'artifact');
  if (!outcome.blocked) {
    // artifact structure
    for (const f of ['index.html', 'services/index.html', 'css/tokens.css', 'css/responsive.css', 'js/interactions.js', 'components/header.html', 'components/footer.html', 'components/card.html', 'manifest.json']) {
      check('artifact has ' + f, fs.existsSync(path.join(artDir, f)));
    }
    const m = JSON.parse(fs.readFileSync(path.join(artDir, 'manifest.json'), 'utf8'));
    check('manifest portable', m.portable === true);
    check('manifest routes = confirmed routes', m.routes.length === 2 && m.routes.every(r => ['/','/services'].includes(r.path)));

    const home = fs.readFileSync(path.join(artDir, 'index.html'), 'utf8');
    // anti-fabrication: no copied source copy
    check('no copied source prose (We do things)', !home.includes('We do things'));
    check('no copied source title (Fixture Co)', !home.includes('Fixture Co'));
    check('factual listing name rendered (Person 1)', home.includes('Person 1'));
    // user brand injected
    check('brand name injected', home.includes('NewCo'));
    check('tagline injected', home.includes('Fresh tagline'));
    // count consistency: exactly 4 captured cards rendered
    const cardCount = (home.match(/class="card"/g) || []).length;
    check('count consistency: 4 cards rendered (captured=4)', cardCount === 4, 'rendered=' + cardCount);
    // external link preserved verbatim (record-only endpoint)
    check('external endpoint linked verbatim', home.includes('https://www.linkedin.com/company/fixture'));
    // no source host leak
    check('no source host in artifact', !home.includes(new URL(origin).host));
    // logo slot present, not copied
    check('logo slot present', home.includes('[LOGO]') && !home.includes('/img/logo.png'));

    // per-build status files
    for (const id of outcome.completed) {
      const sf = path.join(ROOT, 'jobs', jobId, id, 'status.json');
      check('status.json: ' + id, fs.existsSync(sf) && JSON.parse(fs.readFileSync(sf, 'utf8')).status === 'completed');
    }
  }
  cleanup(jobId);

  // ================= NEGATIVE: missing required brand data must block =================
  const jobId2 = 'qa-r07-negative';
  const neg = await runPipeline(jobId2, origin, {
    confirm: { decision: 'confirmed' },
    config: { job_id: jobId2, brand: {} }, // no display name
  });
  check('negative: phase blocked at B10-final-QA', neg.blocked === 'B10-final-QA', 'blocked=' + neg.blocked);
  const b10 = neg.results['B10-final-QA'];
  check('negative: escalated to manual review', b10.status === 'blocked_manual_review');
  check('negative: failure names the gap', (b10.qa ? b10.qa.failures : []).some(f => f.includes('brand.displayName')), JSON.stringify(b10.qa || {}));
  const mrDir = path.join(ROOT, 'manual_review', 'B10-final-QA');
  check('negative: dossier REVIEW.md exists', fs.existsSync(path.join(mrDir, 'REVIEW.md')));
  check('negative: dossier context.json exists', fs.existsSync(path.join(mrDir, 'context.json')));
  cleanup(jobId2);

  server.close();

  // history cleanup
  const hf = path.join(ROOT, 'history', 'build_history.jsonl');
  fs.writeFileSync(hf, fs.readFileSync(hf, 'utf8').trim().split('\n').filter(l => !l.includes('qa-r07')).join('\n') + '\n');

  let pass = 0;
  for (const c of checks) {
    console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
    if (c.ok) pass++;
  }
  console.log('\n' + pass + '/' + checks.length + ' checks passed');
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('QA crashed:', e); process.exit(1); });

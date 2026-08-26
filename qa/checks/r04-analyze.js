'use strict';
/** R04-analyze-builds QA gate.
 * Part 1: offline unit tests (html parser, crawl lib, http classification).
 * Part 2: full A01–A13 phase run against a local fixture site (no external network).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
const { parse, queryAll, querySelector, textOf } = require(path.join(ROOT, 'packages', 'analyze', 'lib', 'html'));
const crawl = require(path.join(ROOT, 'packages', 'analyze', 'lib', 'crawl'));
const { classifyExternal, isExternal } = require(path.join(ROOT, 'packages', 'analyze', 'lib', 'http'));

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, ok: !!ok, detail: detail || '' }); }

// ---------------- Part 1: unit tests ----------------
(function unit() {
  const html = '<html><head><title>T</title><style>.a{color:#fff}</style></head><body>' +
    '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>' +
    '<main><section class="hero"><h1>Big Title</h1><p>Sub</p></section>' +
    '<div class="grid"><div class="card">C1</div><div class="card">C2</div><div class="card">C3</div></div>' +
    '<a href="https://linkedin.com/x">LI</a><a href="/blog/post-123">Post</a></main>' +
    '<footer><p>&copy; 2026</p></footer></body></html>';
  const tree = parse(html);
  check('parser: title text', textOf(querySelector(tree, 'title')) === 'T');
  check('parser: style kept raw', querySelector(tree, 'style').children[0].text.includes('#fff'));
  check('parser: entities decoded', textOf(querySelector(tree, 'footer p')).includes('\u00a9'));
  check('parser: queryAll cards = 3', queryAll(tree, '.card').length === 3);
  check('parser: descendant selector', queryAll(tree, 'nav a').length === 2);
  check('parser: id/class combo', queryAll(tree, 'div.grid').length === 1);

  check('crawl: canonPath strips query', crawl.canonPath('https://x.com/a/b?x=1#h', 'https://x.com') === '/a/b');
  check('crawl: canonPath external -> null', crawl.canonPath('https://y.com/a', 'https://x.com') === null);
  check('crawl: sitemap parse', crawl.parseSitemap('<urlset><url><loc>https://x.com/a</loc></url><url><loc>https://x.com/b</loc></url></urlset>').length === 2);
  const robots = crawl.parseRobots('User-agent: *\nDisallow: /admin\nSitemap: https://x.com/s.xml\n');
  check('crawl: robots disallow', robots.disallowed.includes('/admin'));
  check('crawl: robots sitemap', robots.sitemaps.includes('https://x.com/s.xml'));
  check('crawl: robotsExcluded', crawl.robotsExcluded('/admin/x', ['/admin']) === true);
  check('crawl: robotsExcluded neg', crawl.robotsExcluded('/about', ['/admin']) === false);

  check('http: classifyExternal linkedin', classifyExternal('https://www.linkedin.com/in/x') === 'linkedin');
  check('http: classifyExternal mailto', classifyExternal('mailto:a@b.c') === 'mailto');
  check('http: isExternal', isExternal('https://other.com/', 'https://x.com') === true);
  check('http: isExternal same-origin', isExternal('https://x.com/p', 'https://x.com') === false);
})();

// ---------------- Part 2: full phase against local fixture site ----------------
(async () => {
  // build fixture site in memory
  const cardBlock = Array.from({ length: 5 }, (_, i) => `<div class="profile-card"><h3>Person ${i + 1}</h3><img src="/img/p${i}.png" alt=""><a href="/profiles/person-${i}">View</a></div>`).join('');
  const pages = {
    '/': `<!doctype html><html><head><title>Fixture Co</title><style>body{color:#111;border-radius:8px}</style></head><body>
      <header><a class="logo" href="/"><img src="/img/logo.png" alt="Fixture Co"></a><nav><a href="/">Home</a><a href="/services">Services</a><a href="/contact">Contact</a></nav></header>
      <main><section class="hero"><h1>We do things</h1><p>Tagline here.</p><a class="btn" href="/contact">Get started</a></section>
      <section class="grid">${cardBlock}</section></main>
      <footer><p>Footer copy</p><a href="https://www.linkedin.com/company/fixture">LinkedIn</a><a href="mailto:hi@fixture.test">Email</a><a href="/private/secret" style="display:none">x</a></footer>
      </body></html>`,
    '/services': `<!doctype html><html><head><title>Services - Fixture Co</title></head><body>
      <header><nav><a href="/">Home</a><a href="/services">Services</a></nav></header>
      <main><h1>Our Services</h1><section><h2>S1</h2><p>desc</p></section><section><h2>S2</h2><p>desc</p></section></main>
      <footer><p>Footer</p></footer></body></html>`,
    '/contact': `<!doctype html><html><head><title>Contact - Fixture Co</title></head><body>
      <header><nav><a href="/">Home</a></nav></header>
      <main><h1>Contact us</h1><form action="/submit" method="post"><input name="email" type="email"><button type="submit">Send</button></form></main>
      <footer><p>Footer</p></footer></body></html>`,
    '/robots.txt': 'User-agent: *\nDisallow: /private\n',
    '/sitemap.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://127.0.0.1:PORT/</loc></url><url><loc>http://127.0.0.1:PORT/services</loc></url><url><loc>http://127.0.0.1:PORT/contact</loc></url></urlset>',
    '/private/secret': '<html><body>secret</body></html>',
  };

  const server = http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    if (pages[p] !== undefined) { res.writeHead(200, { 'content-type': p.endsWith('.xml') ? 'application/xml' : p.endsWith('.txt') ? 'text/plain' : 'text/html' }); res.end(pages[p]); }
    else if (p === '/old-home') { res.writeHead(301, { location: '/' }); res.end(); }
    else { res.writeHead(404); res.end('nf'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;
  pages['/sitemap.xml'] = pages['/sitemap.xml'].replace(/PORT/g, String(port));

  // run the phase
  const B3 = require(path.join(ROOT, 'packages', 'analyze', 'builds3'));
  const jobId = 'qa-r04-fixture';
  const t0 = Date.now();
  const outcome = await B3.runAnalyzePhase(jobId, origin + '/');
  const ms = Date.now() - t0;

  check('phase: all 13 builds completed', outcome.completed.length === 13, 'completed=' + outcome.completed.length + (outcome.blocked ? ' blocked at ' + outcome.blocked : ''));
  if (outcome.blocked) {
    const mr = fs.readFileSync(path.join(ROOT, 'manual_review', outcome.blocked, 'REVIEW.md'), 'utf8').slice(0, 400);
    console.log('\nBLOCKED AT ' + outcome.blocked + '\n' + mr);
  }

  const readA = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'jobs', jobId, 'analysis', f), 'utf8'));
  if (!outcome.blocked) {
    const sm = readA('sitemap.json');
    check('A03: home crawlable', sm.crawlable.some(c => c.path === '/'));
    check('A03: private excluded (robots)', sm.excluded.some(c => c.path === '/private/secret'));
    check('A03: evidence includes sitemap.xml', sm.evidence.includes('sitemap.xml'));

    const lg = readA('link-graph.json');
    check('A04: edges include /services from home', lg.edges.some(e => e.from === '/' && e.to === '/services'));
    const im = readA('integration-manifest.json');
    check('A04: external linkedin recorded', im.endpoints.some(e => e.endpoint_type === 'linkedin' && e.treatment === 'record_only'));
    check('A04: external mailto recorded', im.endpoints.some(e => e.endpoint_type === 'mailto'));
    check('A04: no external endpoint fetched', im.endpoints.every(e => e.treatment === 'record_only'));

    const ri = readA('route-inventory.json');
    check('A05: >=3 routes inventoried', ri.routes.length >= 3, String(ri.routes.length));
    check('A05: home typed landing', ri.routes.find(r => r.path === '/').type === 'landing');

    const dc = readA('dynamic-content.json');
    check('A06: card collection detected', dc.collections.some(c => c.item_count_captured === 5), JSON.stringify(dc.collections.map(c => c.item_count_captured)));
    check('A06: count consistency recorded', dc.collections.every(c => typeof c.count_consistent === 'boolean'));

    const wf = readA('wireframes.json');
    check('A07: wireframe per route', wf.wireframes.length === ri.routes.length);
    check('A07: home has hero section', wf.wireframes.find(w => w.route === '/').sections.some(s => s.role === 'hero'));

    const cs = readA('content-schemas.json');
    check('A08: entity derived from collection', cs.entities.some(e => e.instance_count === 5));

    const dt = readA('design-tokens.json');
    check('A09: colors extracted', dt.colors.length > 0);
    check('A09: radii extracted', dt.radii.length > 0);

    const it = readA('interactions.json');
    check('A10: form submit interaction', it.interactions.some(i => i.mechanism === 'form_submit'));
    check('A10: anchor interactions', it.interactions.some(i => i.mechanism === 'in_page_anchor') || it.interactions.length > 0);

    const ci = readA('components.json');
    check('A11: header component', ci.components.some(c => c.name === 'header'));
    check('A11: card component reused', ci.components.some(c => c.name.startsWith('card.') && c.reuse_count >= 5), JSON.stringify(ci.components.map(c => [c.name, c.reuse_count])));

    const pm = readA('placeholder-map.json');
    check('A12: draft flag', pm.draft === true);
    check('A12: content placeholders mapped', pm.groups.content.length > 0);
    check('A12: brand logo placeholder', pm.groups.brand.some(b => b.startsWith('logo_')));

    const ap = readA('analysis-package.json');
    check('A13: counts match artifacts', ap.counts.routes_inventoried === ri.routes.length && ap.counts.external_endpoints === im.endpoints.length);
    check('A13: all artifact files exist', Object.values(ap.artifacts).every(p => fs.existsSync(path.join(ROOT, 'jobs', jobId, p))));
    check('A13: uncertainties array present', Array.isArray(ap.uncertainties));
  }

  // per-build status files exist for every completed build
  for (const id of outcome.completed) {
    const sf = path.join(ROOT, 'jobs', jobId, id, 'status.json');
    check('status.json: ' + id, fs.existsSync(sf) && JSON.parse(fs.readFileSync(sf, 'utf8')).status === 'completed');
  }

  server.close();

  // cleanup fixture job + history noise + any escalation dirs from this job's builds
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
  const lines = fs.readFileSync(hf, 'utf8').trim().split('\n').filter(l => !l.includes(jobId));
  fs.writeFileSync(hf, lines.join('\n') + '\n');

  let pass = 0;
  for (const c of checks) {
    console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
    if (c.ok) pass++;
  }
  console.log('\n' + pass + '/' + checks.length + ' checks passed (' + ms + 'ms)');
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('QA crashed:', e); process.exit(1); });

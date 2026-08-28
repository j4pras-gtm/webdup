'use strict';
/**
 * Analyze phase pipeline (revised spec §4–§17): A01–A13 micro-builds.
 * Each build runs through the engine (5 attempts / 5 min / QA hook / escalation).
 * HTTP+DOM analysis only; rendered/browser capture is a later extension (§32).
 */

const fs = require('fs');
const path = require('path');
const engine = require('../engine');
const contracts = require('../contracts');
const { parse, queryAll, querySelector, textOf } = require('./lib/html');
const { fetchInternal, recordExternal } = require('./lib/http');

/** Fetch with a soft failure: returns {ok:false} instead of throwing (for optional evidence). */
async function fetchInternalSafe(url) {
  try { return await fetchInternal(url, { maxHops: 2 }); }
  catch (_) { return { ok: false, status: 0 }; }
}
const crawl = require('./lib/crawl');

const ROOT = engine.ROOT;

// ---------------------------------------------------------------------------
// Job helpers
// ---------------------------------------------------------------------------

function jobDir(jobId) { return path.join(ROOT, 'jobs', jobId); }
function analysisDir(jobId) { return path.join(jobDir(jobId), 'analysis'); }
function buildDir(jobId, buildId) { return path.join(jobDir(jobId), buildId); }

function ensureJobDirs(jobId) {
  for (const d of [jobDir(jobId), analysisDir(jobId), path.join(jobDir(jobId), 'extraction')]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function writeArtifact(jobId, name, data) {
  const file = path.join(analysisDir(jobId), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', 'utf8');
  return 'analysis/' + name;
}

function readArtifact(jobId, name) {
  const file = path.join(analysisDir(jobId), name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Run one analyze micro-build through the engine with a QA hook. */
async function runAnalyzeBuild(jobId, buildId, goal, work, qa) {
  const dir = buildDir(jobId, buildId);
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'qa'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'BUILD.md'),
    '# ' + buildId + '\n\n' + goal + '\n\nPhase: analyze. Policy: 5 attempts / 5 min, QA mandatory.\n', 'utf8');

  const res = await engine.runBuild({
    id: buildId,
    jobId: jobId,
    goal: goal,
    inputs: { job_id: jobId },
    expectedOutput: goal.split('\n')[0],
    validationCriteria: 'QA hook returns passed:true',
    run: async () => work(),
    qa: qa,
  });

  // persist QA report next to the build
  fs.writeFileSync(path.join(dir, 'qa', 'report.json'), JSON.stringify(res.qa || res, null, 2) + '\n', 'utf8');
  return res;
}

// ---------------------------------------------------------------------------
// A01-intake
// ---------------------------------------------------------------------------

async function a01Intake(jobId, sourceUrl) {
  ensureJobDirs(jobId);
  const jobFile = path.join(jobDir(jobId), 'job.json');
  let job = {};
  if (fs.existsSync(jobFile)) job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  job.source_url = sourceUrl;
  job.phase = 'analyze';
  job.created_at = job.created_at || new Date().toISOString();
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2) + '\n', 'utf8');

  return runAnalyzeBuild(jobId, 'A01-intake',
    'Validate source URL and record intake metadata.',
    async () => {
      const u = new URL(sourceUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error('unsupported protocol: ' + u.protocol);
      const probe = await fetchInternal(sourceUrl, { maxHops: 3 });
      if (!probe.ok) throw new Error('source unreachable: HTTP ' + probe.status);
      return { url: sourceUrl, origin: u.origin, status: probe.status, finalUrl: probe.finalUrl, chain: probe.chain };
    },
    (r) => ({ passed: !!r && r.status >= 200 && r.status < 400, checks_run: 1, failures: [] })
  );
}

// ---------------------------------------------------------------------------
// A02-scope-preflight
// ---------------------------------------------------------------------------

async function a02ScopePreflight(jobId) {
  const job = JSON.parse(fs.readFileSync(path.join(jobDir(jobId), 'job.json'), 'utf8'));
  const origin = new URL(job.source_url).origin;

  return runAnalyzeBuild(jobId, 'A02-scope-preflight',
    'Establish crawl boundary: robots.txt + sitemap.xml discovery (record-only evidence).',
    async () => {
      const robotsRes = await fetchInternal(origin + '/robots.txt', { maxHops: 2 });
      const robots = robotsRes.ok ? crawl.parseRobots(robotsRes.body) : { disallowed: [], sitemaps: [], appliesToAll: true, found: false };
      robots.found = robotsRes.ok;

      const sitemapUrls = [...new Set(robots.sitemaps.length ? robots.sitemaps : [origin + '/sitemap.xml'])];
      const sitemaps = [];
      for (const su of sitemapUrls.slice(0, 3)) {
        const r = await fetchInternal(su, { maxHops: 2 });
        if (r.ok && /xml/i.test(r.contentType || r.body.slice(0, 200))) {
          sitemaps.push({ url: su, routes: crawl.parseSitemap(r.body) });
        }
      }
      return { origin, robots, sitemaps, boundary: { max_pages: 40, same_origin_only: true } };
    },
    (r) => ({ passed: !!r && !!r.origin, checks_run: 1, failures: [] })
  ).then(res => { if (res.ok) writeArtifact(jobId, 'a02-scope.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A03-sitemap-discovery
// ---------------------------------------------------------------------------

async function a03SitemapDiscovery(jobId) {
  const job = JSON.parse(fs.readFileSync(path.join(jobDir(jobId), 'job.json'), 'utf8'));
  const origin = new URL(job.source_url).origin;
  const preflight = readArtifact(jobId, 'a02-scope.json');

  return runAnalyzeBuild(jobId, 'A03-sitemap-discovery',
    'Discover routes from all evidence sources; classify discovered/crawlable/excluded/restricted/canonical.',
    async () => {
      const home = await fetchInternal(job.source_url);
      if (!home.ok) throw new Error('home fetch failed: HTTP ' + home.status);
      const tree = parse(home.body);
      const navLinks = queryAll(tree, 'nav a[href], header a[href], footer a[href]');
      const allLinks = queryAll(tree, 'a[href]');

      const discovered = new Map(); // path -> {evidence:Set}
      const addRoute = (p, ev) => {
        if (!p) return;
        if (!discovered.has(p)) discovered.set(p, new Set());
        discovered.get(p).add(ev);
      };

      for (const s of (preflight ? preflight.sitemaps : [])) {
        for (const loc of s.routes) {
          // Sitemaps may reference a mirror/origin alias (e.g. a staging host).
          // Take the path component; if it's on another origin, treat it as an
          // equivalent path on our origin (recorded as evidence 'sitemap.xml').
          let p = null;
          try { p = new URL(loc).pathname; } catch (_) { p = loc; }
          if (!p.startsWith('/')) p = '/' + p;
          if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
          if (p) addRoute(p, 'sitemap.xml');
        }
      }
      for (const a of navLinks) { const p = crawl.canonPath(a.attrs.href, origin); if (p) addRoute(p, 'navigation'); }
      for (const a of allLinks) { const p = crawl.canonPath(a.attrs.href, origin); if (p) addRoute(p, 'internal_links'); }
      addRoute('/', 'rendered_dom');

      const disallowed = preflight && preflight.robots ? preflight.robots.disallowed : [];
      const out = { source_url: job.source_url, evidence: [], discovered: [], crawlable: [], excluded: [], restricted: [], canonical: [] };
      for (const [p, evs] of discovered) {
        out.evidence = [...new Set([...out.evidence, ...evs])];
        const entry = { path: p, evidence: [...evs] };
        if (/\.(png|jpe?g|gif|svg|webp|css|js|pdf|ico)(\?|$)/i.test(p)) { out.excluded.push(Object.assign(entry, { reason: 'asset' })); continue; }
        if (crawl.robotsExcluded(p, disallowed)) { out.excluded.push(Object.assign(entry, { reason: 'robots_disallow' })); continue; }
        if (/\/(auth|login|signin|signup|register|checkout|admin|dashboard)(\/|$|\?)/i.test(p)) { out.restricted.push(Object.assign(entry, { reason: 'auth_or_private' })); continue; }
        out.crawlable.push(entry);
      }
      // canonical dedupe: strip trailing-slash variants already handled by canonPath
      out.discovered = out.crawlable.concat(out.excluded, out.restricted).map(e => e.path);
      return out;
    },
    (r) => {
      const v = contracts.validate('sitemap', r);
      const fails = v.errors.slice();
      if (!r.crawlable.some(c => c.path === '/')) fails.push('home route not crawlable');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeArtifact(jobId, 'sitemap.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A04-link-graph (+ redirect resolution, external endpoints record-only)
// ---------------------------------------------------------------------------

async function a04LinkGraph(jobId) {
  const job = JSON.parse(fs.readFileSync(path.join(jobDir(jobId), 'job.json'), 'utf8'));
  const origin = new URL(job.source_url).origin;
  const sitemap = readArtifact(jobId, 'sitemap.json');

  return runAnalyzeBuild(jobId, 'A04-link-graph',
    'Crawl in-scope pages, extract all links (incl. repeating components), resolve internal redirects, record external endpoints (never fetched).',
    async () => {
      const crawlable = (sitemap ? sitemap.crawlable.map(c => c.path) : ['/']).slice(0, 40);
      const pages = [];
      const redirectEntries = [];
      const errors = [];

      for (const p of crawlable) {
        const r = await fetchInternal(origin + p);
        if (!r.ok) { errors.push({ path: p, status: r.status }); continue; }
        if (r.chain.length > 1) redirectEntries.push({ source_url: p, chain: r.chain, final_url: r.finalUrl, scope: 'internal', treatment: 'crawl' });
        pages.push({ url: r.finalUrl, origin, path: p, html: r.body, tree: parse(r.body) });
      }
      if (!pages.length) throw new Error('no pages crawled');

      const { edges, externalEndpoints } = crawl.buildLinkGraph(pages);
      // buildLinkGraph already emits spec-8 manifest entries (record-only)
      const extManifest = externalEndpoints;

      // save raw crawled pages for downstream builds (source evidence)
      const evidenceDir = path.join(analysisDir(jobId), 'crawled');
      fs.mkdirSync(evidenceDir, { recursive: true });
      for (const pg of pages) {
        const safe = pg.path.replace(/[\\/]/g, '_') || '_home';
        fs.writeFileSync(path.join(evidenceDir, safe + '.html'), pg.html, 'utf8');
        fs.writeFileSync(path.join(evidenceDir, safe + '.meta.json'), JSON.stringify({ path: pg.path, url: pg.url }), 'utf8');
      }

      return {
        pages_crawled: pages.length,
        page_paths: pages.map(p => p.path),
        errors,
        edges,
        redirect_entries: redirectEntries,
        external_endpoints: extManifest,
      };
    },
    (r) => {
      const lg = contracts.validate('link-graph', { edges: r.edges });
      const rm = contracts.validate('redirect-map', { entries: r.redirect_entries });
      const im = contracts.validate('integration-manifest', { endpoints: r.external_endpoints });
      const fails = [...lg.errors, ...rm.errors, ...im.errors];
      if (!r.pages_crawled) fails.push('no pages crawled');
      return { passed: fails.length === 0, checks_run: 3, failures: fails };
    }
  ).then(res => {
    if (res.ok) {
      writeArtifact(jobId, 'link-graph.json', { edges: res.result.edges });
      writeArtifact(jobId, 'redirect-map.json', { entries: res.result.redirect_entries });
      writeArtifact(jobId, 'integration-manifest.json', { endpoints: res.result.external_endpoints });
      writeArtifact(jobId, 'crawl-log.json', { pages_crawled: res.result.pages_crawled, page_paths: res.result.page_paths, errors: res.result.errors });
    }
    return res;
  });
}

module.exports = {
  ROOT, jobDir, analysisDir, buildDir, ensureJobDirs, writeArtifact, readArtifact, runAnalyzeBuild, fetchInternalSafe,
  a01Intake, a02ScopePreflight, a03SitemapDiscovery, a04LinkGraph,
};

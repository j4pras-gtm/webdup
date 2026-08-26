'use strict';
/**
 * Generic Build QA gate (revised spec §23 anti-fabrication + §24 Build QA).
 * Verifies a generated artifact against the CONFIRMED analysis. Pure function:
 * takes the artifact manifest + job artifacts, returns {passed, checks_run, failures}.
 */

const fs = require('fs');
const path = require('path');
const P = require('../../analyze/pipeline');
const EX = require('../../extract');

const ROOT = P.ROOT;

/**
 * @param {string} jobId
 * @param {object} artifact { dir, routes:[{path,file}], components:[], interactions:[], collections:[{route,region,count,behavior}], externalLinks:[url] }
 */
function runBuildQA(jobId, artifact) {
  const fails = [];
  let checks = 0;
  const ap = P.readArtifact(jobId, 'analysis-package.json');
  const scope = EX.readExtraction(jobId, 'confirmed-scope.json');
  const ri = P.readArtifact(jobId, 'route-inventory.json') || { routes: [] };
  const inter = P.readArtifact(jobId, 'interactions.json') || { interactions: [] };
  const dyn = P.readArtifact(jobId, 'dynamic-content.json') || { collections: [] };
  const integ = P.readArtifact(jobId, 'integration-manifest.json') || { endpoints: [] };
  const ph = EX.readExtraction(jobId, 'placeholder-schema.json') || { groups: {} };
  const artDir = path.join(ROOT, 'jobs', jobId, artifact.dir);

  // ---- Route QA: every generated route corresponds to a confirmed route ----
  checks++;
  const confirmedRoutes = new Set(scope ? scope.routes : []);
  for (const r of artifact.routes) {
    if (!confirmedRoutes.has(r.path)) fails.push('route not in confirmed scope: ' + r.path);
    if (!fs.existsSync(path.join(artDir, r.file))) fails.push('missing route file: ' + r.file);
  }
  // every confirmed route must be generated (no silent omission)
  for (const rt of confirmedRoutes) {
    if (!artifact.routes.some(r => r.path === rt)) fails.push('confirmed route not generated: ' + rt);
  }

  // ---- Anti-fabrication: no invented routes ----
  checks++;
  const knownRoutes = new Set(ri.routes.map(x => x.path));
  for (const r of artifact.routes) if (!knownRoutes.has(r.path)) fails.push('fabricated route (not in analysis): ' + r.path);

  // ---- Interaction QA: every generated interaction corresponds to an analyzed one ----
  checks++;
  const knownMechanisms = new Set(inter.interactions.map(i => i.mechanism));
  for (const m of artifact.interactions) {
    if (!knownMechanisms.has(m)) fails.push('fabricated interaction mechanism: ' + m);
  }

  // ---- Dynamic behavior QA: collection mechanism matches source spec ----
  checks++;
  const dynByRoute = {};
  for (const c of dyn.collections) (dynByRoute[c.page_path] = dynByRoute[c.page_path] || []).push(c);
  for (const col of artifact.collections) {
    const src = (dynByRoute[col.route] || []).find(c => c.region_selector === col.region);
    if (!src) { fails.push('collection not in analysis: ' + col.route + '/' + col.region); continue; }
    if (col.behavior !== src.behavior) fails.push('behavior mismatch ' + col.route + '/' + col.region + ': built ' + col.behavior + ' vs source ' + src.behavior);
  }

  // ---- Count consistency (§10): rendered items must equal captured items per collection ----
  checks++;
  for (const r of artifact.routes) {
    const html = fs.readFileSync(path.join(artDir, r.file), 'utf8');
    for (const src of (dynByRoute[r.path] || []).filter(c => c.behavior === 'static')) {
      const m = html.match(new RegExp('data-region="' + src.region_selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
      if (!m) { fails.push('collection region not rendered: ' + r.path + '/' + src.region_selector); continue; }
      // count cards inside this section: from its tag to the next </section>
      const start = html.indexOf(m[0]);
      const end = html.indexOf('</section>', start);
      const chunk = html.slice(start, end === -1 ? undefined : end);
      const rendered = (chunk.match(/class="card"/g) || []).length;
      if (rendered !== src.item_count_captured) {
        fails.push('count mismatch ' + r.path + '/' + src.region_selector + ': rendered ' + rendered + ' vs captured ' + src.item_count_captured);
      }
    }
  }

  // ---- Content QA: no unresolved required placeholders ----
  // Only the brand display name is a hard user requirement. Colors/fonts are
  // auto-derived from the confirmed token layer; logos are media slots.
  checks++;
  const supplied = (scope && scope.user_supplied_data) || {};
  let cfgBrand = {};
  try { cfgBrand = (JSON.parse(fs.readFileSync(path.join(ROOT, 'jobs', jobId, 'build-config.json'), 'utf8')).brand) || {}; } catch (_) { /* no config */ }
  const brandName = supplied.displayName || cfgBrand.name || cfgBrand.displayName;
  if (!brandName) fails.push('unresolved required placeholder: brand.displayName (supply brand.name in build-config or user_supplied_data)');

  // ---- Asset QA: source-restricted assets absent ----
  checks++;
  const allHtml = artifact.routes.map(r => fs.readFileSync(path.join(artDir, r.file), 'utf8')).join('\n');
  // no source domain references leaked into markup
  if (ap && ap.source_url) {
    const host = new URL(ap.source_url).host;
    if (allHtml.includes(host)) fails.push('source host leaked into artifact: ' + host);
  }

  // ---- Link QA: internal links resolve; external links match confirmed endpoints ----
  checks++;
  const genPaths = new Set(artifact.routes.map(r => r.path));
  const extUrls = new Set(integ.endpoints.map(e => e.original_url));
  for (const r of artifact.routes) {
    const html = fs.readFileSync(path.join(artDir, r.file), 'utf8');
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      const href = m[1];
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      if (/^https?:\/\//.test(href)) {
        if (!extUrls.has(href)) fails.push('external link not in confirmed endpoints: ' + href + ' (on ' + r.path + ')');
      } else {
        let p = href.split('?')[0].split('#')[0];
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|json|woff2?)$/i.test(p)) {
          // asset reference — must exist in the artifact
          if (!fs.existsSync(path.join(artDir, p.replace(/^\//, '')))) fails.push('referenced asset missing: ' + p + ' (on ' + r.path + ')');
        } else if (!genPaths.has(p)) {
          fails.push('internal link does not resolve to a generated route: ' + p + ' (on ' + r.path + ')');
        }
      }
    }
  }

  return { passed: fails.length === 0, checks_run: checks, failures: fails };
}

module.exports = { runBuildQA, ROOT };

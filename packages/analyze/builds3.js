'use strict';
/** Analyze phase builds A12–A13 + the runAnalyzePhase orchestrator (revised spec §4–§17). */

const fs = require('fs');
const path = require('path');
const contracts = require('../contracts');
const { queryAll, textOf } = require('./lib/html');
const P = require('./pipeline');
const B = require('./builds');

const ROOT = P.ROOT;

// ---------------------------------------------------------------------------
// A12-placeholder-map-draft
// ---------------------------------------------------------------------------

async function a12Placeholders(jobId) {
  return P.runAnalyzeBuild(jobId, 'A12-placeholder-map-draft',
    'Map every source content slot to a placeholder key; no copied copy/logos/imagery.',
    async () => {
      const pages = B.loadPages(jobId);
      const groups = { brand: ['displayName', 'logo', 'primaryColor', 'fonts'], contact_integrations: [], content: [], legal: [] };
      let n = 0;
      for (const pg of pages) {
        const base = pg.path.replace(/[\/.]/g, '_').replace(/^_/, '') || 'home';
        // headings -> copy placeholders (original text NOT copied)
        for (const h of queryAll(pg.tree, 'h1, h2, h3')) {
          if (!textOf(h)) continue;
          groups.content.push('copy.' + base + '.' + h.tag + '-' + (n++));
        }
        // images -> image placeholders (source imagery NOT copied)
        for (const img of queryAll(pg.tree, 'img')) {
          groups.content.push('image.' + base + '-' + (n++));
        }
        // logo
        if (queryAll(pg.tree, 'header img, [class*="logo"] img, [class*="logo"] svg')[0]) {
          groups.brand.push('logo_' + base);
        }
      }
      return { draft: true, groups };
    },
    (r) => {
      const v = contracts.validate('placeholder-map', r);
      const fails = v.errors.slice();
      const total = Object.values(r.groups).reduce((a, g) => a + g.length, 0);
      if (!total) fails.push('no placeholders mapped');
      if (r.draft !== true) fails.push('must be marked draft');
      return { passed: v.passed && fails.length === 0, checks_run: 3, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'placeholder-map.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A13-analysis-synthesis
// ---------------------------------------------------------------------------

async function a13Synthesis(jobId) {
  return P.runAnalyzeBuild(jobId, 'A13-analysis-synthesis',
    'Assemble the confirmed analysis package from all prior artifacts; record gaps and confidence.',
    async () => {
      const job = JSON.parse(fs.readFileSync(path.join(P.jobDir(jobId), 'job.json'), 'utf8'));
      const read = (f) => P.readArtifact(jobId, f);
      const sitemap = read('sitemap.json') || { crawlable: [], excluded: [], restricted: [] };
      const routes = read('route-inventory.json') || { routes: [] };
      const dyn = read('dynamic-content.json') || { collections: [] };
      const wire = read('wireframes.json') || { wireframes: [] };
      const schemas = read('content-schemas.json') || { entities: [] };
      const tokens = read('design-tokens.json');
      const inter = read('interactions.json') || { interactions: [] };
      const comps = read('components.json') || { components: [] };
      const ph = read('placeholder-map.json') || { groups: {} };
      const ext = read('integration-manifest.json') || { endpoints: [] };
      const lg = read('link-graph.json') || { edges: [] };
      const rm = read('redirect-map.json') || { entries: [] };

      // gaps -> uncertainties (anti-fabrication: missing info is recorded, never invented)
      const uncertainties = [];
      if (!routes.routes.length) uncertainties.push({ area: 'routes', description: 'no routes inventoried', severity: 'high' });
      if (!dyn.collections.length) uncertainties.push({ area: 'dynamic_content', description: 'no dynamic regions detected (site may be fully static)', severity: 'low' });
      if (!inter.interactions.length) uncertainties.push({ area: 'interactions', description: 'no interactions detected', severity: 'medium' });
      if (!tokens || !tokens.colors || !tokens.colors.length) uncertainties.push({ area: 'design_tokens', description: 'no design tokens extracted', severity: 'high' });
      const phTotal = Object.values(ph.groups).reduce((a, g) => a + g.length, 0);
      if (!phTotal) uncertainties.push({ area: 'placeholders', description: 'no placeholders mapped', severity: 'high' });
      // count consistency: advertised vs captured for every dynamic collection
      for (const c of dyn.collections) {
        if (c.item_count_advertised != null && c.item_count_advertised !== c.item_count_captured) {
          uncertainties.push({ area: 'count_consistency', description: c.page_path + ' ' + c.region_selector + ': advertised ' + c.item_count_advertised + ' vs captured ' + c.item_count_captured, severity: 'high' });
        }
      }

      return {
        job_id: jobId,
        source_url: job.source_url,
        artifacts: {
          sitemap: 'analysis/sitemap.json',
          link_graph: 'analysis/link-graph.json',
          redirect_map: 'analysis/redirect-map.json',
          integration_manifest: 'analysis/integration-manifest.json',
          route_inventory: 'analysis/route-inventory.json',
          dynamic_content: 'analysis/dynamic-content.json',
          wireframes: 'analysis/wireframes.json',
          content_schemas: 'analysis/content-schemas.json',
          design_tokens: 'analysis/design-tokens.json',
          interactions: 'analysis/interactions.json',
          components: 'analysis/components.json',
          placeholder_map: 'analysis/placeholder-map.json',
        },
        uncertainties,
        counts: {
          crawlable_routes: sitemap.crawlable.length,
          excluded_routes: (sitemap.excluded || []).length,
          restricted_routes: (sitemap.restricted || []).length,
          routes_inventoried: routes.routes.length,
          dynamic_collections: dyn.collections.length,
          wireframes: wire.wireframes.length,
          content_entities: schemas.entities.length,
          interactions: inter.interactions.length,
          components: comps.components.length,
          placeholders: phTotal,
          external_endpoints: ext.endpoints.length,
          link_edges: lg.edges.length,
          redirect_entries: rm.entries.length,
        },
      };
    },
    (r) => {
      const v = contracts.validate('analysis-package', r);
      const fails = v.errors.slice();
      // every referenced artifact must exist on disk (paths are job-relative)
      for (const [k, p] of Object.entries(r.artifacts)) {
        if (!fs.existsSync(path.join(P.jobDir(jobId), p))) fails.push('missing artifact file: ' + p);
      }
      // count consistency: counts must match actual artifact contents
      const routes = P.readArtifact(jobId, 'route-inventory.json');
      if (routes && r.counts.routes_inventoried !== routes.routes.length) fails.push('counts.routes_inventoried mismatch');
      const ext = P.readArtifact(jobId, 'integration-manifest.json');
      if (ext && r.counts.external_endpoints !== ext.endpoints.length) fails.push('counts.external_endpoints mismatch');
      return { passed: v.passed && fails.length === 0, checks_run: 3, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'analysis-package.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const ORDER = [
  ['A01-intake', (j, u) => P.a01Intake(j, u)],
  ['A02-scope-preflight', (j) => P.a02ScopePreflight(j)],
  ['A03-sitemap-discovery', (j) => P.a03SitemapDiscovery(j)],
  ['A04-link-graph', (j) => P.a04LinkGraph(j)],
  ['A05-route-inventory', (j) => B.a05RouteInventory(j)],
  ['A06-dynamic-content-analysis', (j) => B.a06DynamicContent(j)],
  ['A07-page-wireframes', (j) => B.a07Wireframes(j)],
  ['A08-content-schemas', (j) => B.a08ContentSchemas(j)],
  ['A09-design-tokens', (j) => require('./builds2').a09DesignTokens(j)],
  ['A10-interaction-specs', (j) => require('./builds2').a10Interactions(j)],
  ['A11-component-inventory', (j) => require('./builds2').a11Components(j)],
  ['A12-placeholder-map-draft', (j) => a12Placeholders(j)],
  ['A13-analysis-synthesis', (j) => a13Synthesis(j)],
];

/**
 * Run the full Analyze phase for a job. Stops at the first build that does not
 * complete (escalated to manual review) — isolation means other jobs are fine.
 * @returns {{completed:string[], blocked?:string, results:object}}
 */
async function runAnalyzePhase(jobId, sourceUrl) {
  const results = {};
  const completed = [];
  for (const [id, fn] of ORDER) {
    const res = await fn(jobId, sourceUrl);
    results[id] = res;
    if (res.ok) completed.push(id);
    else {
      return { completed, blocked: id, results };
    }
  }
  return { completed, results };
}

module.exports = { a12Placeholders, a13Synthesis, runAnalyzePhase, ORDER };

'use strict';
/**
 * Extract phase (revised spec §19–§21): E01–E08 micro-builds.
 * Operates ONLY on the confirmed analysis package (HITL gate enforced).
 * It never re-crawls or re-interprets the source — it derives reusable,
 * rebrandable assets from what the user already confirmed.
 */

const fs = require('fs');
const path = require('path');
const engine = require('../engine');
const contracts = require('../contracts');
const hitl = require('../hitl');
const P = require('../analyze/pipeline');

const ROOT = P.ROOT;

function extractionDir(jobId) { return path.join(P.jobDir(jobId), 'extraction'); }
function writeExtraction(jobId, name, data) {
  const file = path.join(extractionDir(jobId), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return 'extraction/' + name;
}
function readExtraction(jobId, name) {
  const f = path.join(extractionDir(jobId), name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/**
 * Zero-dep HTTPS/HTTP JSON fetch with redirect following. Used ONLY for
 * HITL-approved data sources (confirmed-scope data_sources). Never for
 * arbitrary URLs.
 */
function fetchJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const doReq = (u) => {
      const req = lib.request(u, { method, headers: { 'user-agent': 'sidekikz-builder/1.0', ...headers }, timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, u).toString();
          return doReq(next);
        }
        let d = '';
        res.setEncoding('utf8');
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('timeout', () => req.destroy(new Error('fetch timeout: ' + u)));
      req.on('error', reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    };
    doReq(url);
  });
}

/** Run one extract micro-build; enforces the HITL gate first. */
async function runExtractBuild(jobId, buildId, goal, work, qa) {
  hitl.requireConfirmed(jobId); // gate: no extraction without confirmation
  const dir = path.join(P.jobDir(jobId), buildId);
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'qa'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'BUILD.md'), '# ' + buildId + '\n\n' + goal + '\n\nPhase: extract. Source: confirmed analysis only.\n', 'utf8');
  const res = await engine.runBuild({
    id: buildId, jobId, goal, inputs: { job_id: jobId },
    expectedOutput: goal.split('\n')[0], validationCriteria: 'QA hook returns passed:true',
    run: async () => work(), qa,
  });
  fs.writeFileSync(path.join(dir, 'qa', 'report.json'), JSON.stringify(res.qa || res, null, 2) + '\n', 'utf8');
  return res;
}

// ---------------------------------------------------------------------------
// E01-confirmed-scope
// ---------------------------------------------------------------------------
async function e01ConfirmedScope(jobId) {
  return runExtractBuild(jobId, 'E01-confirmed-scope',
    'Materialize the confirmed scope (routes/components/collections/endpoints) as the single source of truth for extraction.',
    async () => {
      const conf = hitl.requireConfirmed(jobId);
      const ap = P.readArtifact(jobId, 'analysis-package.json');
      return {
        job_id: jobId,
        decision: conf.decision,
        confirmed_at: conf.confirmed_at,
        routes: conf.confirmed_scope.routes,
        components: conf.confirmed_scope.components,
        dynamic_collections: conf.confirmed_scope.dynamic_collections,
        external_endpoints: conf.confirmed_scope.external_endpoints,
        data_sources: conf.confirmed_scope.data_sources || [],
        generated_route_families: conf.confirmed_scope.generated_route_families || [],
        removed_pages: conf.removed_pages,
        removed_components: conf.removed_components,
        user_supplied_data: conf.user_supplied_data,
        source_url: ap.source_url,
      };
    },
    (r) => {
      const fails = [];
      if (!r.routes.length) fails.push('no confirmed routes');
      if (!Array.isArray(r.components)) fails.push('components not array');
      // scope must be a subset of the analysis (no silent expansion)
      const ap = P.readArtifact(jobId, 'analysis-package.json');
      const ri = P.readArtifact(jobId, 'route-inventory.json') || { routes: [] };
      const known = new Set(ri.routes.map(x => x.path));
      for (const rt of r.routes) if (!known.has(rt)) fails.push('route not in analysis: ' + rt);
      return { passed: fails.length === 0, checks_run: 3, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'confirmed-scope.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E02-structure-assets
// ---------------------------------------------------------------------------
async function e02StructureAssets(jobId) {
  return runExtractBuild(jobId, 'E02-structure-assets',
    'Extract reusable page/section structure (wireframes) for confirmed routes only.',
    async () => {
      const scope = readExtraction(jobId, 'confirmed-scope.json');
      if (!scope) throw new Error('run E01 first');
      const wire = P.readArtifact(jobId, 'wireframes.json') || { wireframes: [] };
      const assets = wire.wireframes
        .filter(w => scope.routes.includes(w.route))
        .map(w => ({
          asset: 'structure.' + w.route.replace(/[\/]/g, '-').replace(/^-/, ''),
          kind: 'structure',
          route: w.route,
          page_type: w.page_type,
          sections: w.sections.map(s => ({ id: s.id, role: s.role, heading: s.heading ? '<heading-placeholder>' : null, data_bindings: s.data_bindings })),
          confidence: w.confidence,
        }));
      return { draft: false, assets };
    },
    (r) => {
      const v = contracts.validate('reusable-assets', r);
      const fails = v.errors.slice();
      if (!r.assets.length) fails.push('no structure assets extracted');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'structure-assets.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E03-content-assets
// ---------------------------------------------------------------------------
async function e03ContentAssets(jobId) {
  return runExtractBuild(jobId, 'E03-content-assets',
    'Extract content schemas as field-level templates + factual listing data (names/roles/prices/locations/skills; prose stays placeholder).',
    async () => {
      const cs = P.readArtifact(jobId, 'content-schemas.json') || { entities: [] };
      const dyn = P.readArtifact(jobId, 'dynamic-content.json') || { collections: [] };
      const scope = readExtraction(jobId, 'confirmed-scope.json');

      const assets = cs.entities.map(e => ({
        asset: 'content.' + e.entity_name,
        kind: 'content_schema',
        entity: e.entity_name,
        instance_count: e.instance_count,
        fields: e.fields.map(f => ({ name: f.name, type: f.type, required: f.required, example: '<placeholder>' })),
        confidence: e.confidence,
      }));

      // Factual listing data for confirmed routes only (policy 2026-08-27).
      // Allowed fields are structural facts; descriptions/prose are never copied.
      const ALLOWED = ['name', 'role', 'price', 'experience', 'location', 'skills', 'detail_link'];
      // Collections covered by an approved API source are extracted from the API,
      // not the DOM (the DOM only holds a partial window of the same data).
      const apiCovered = new Set((scope.data_sources || []).map(s => s.page_path + '|' + s.collection));

      for (const c of dyn.collections) {
        if (!c.items || !c.items.length) continue;
        if (scope && !scope.routes.includes(c.page_path)) continue;
        if (apiCovered.has(c.page_path + '|' + c.region_selector)) continue;
        assets.push({
          asset: 'listing.' + c.page_path.replace(/[\\/]/g, '-').replace(/^-/, '') + '.' + c.region_selector.replace(/[^a-zA-Z0-9]+/g, '-'),
          kind: 'listing_data',
          route: c.page_path,
          region_selector: c.region_selector,
          count_captured: c.item_count_captured,
          count_advertised: c.item_count_advertised || null,
          count_consistent: c.count_consistent,
          items: c.items.map(it => {
            const clean = {};
            for (const k of ALLOWED) if (it[k] !== undefined) clean[k] = it[k];
            return clean;
          }),
        });
      }

      // API-sourced collections (HITL-approved in confirmed scope): fetch through
      // the recorded endpoint, map rows to factual fields, never copy prose.
      for (const s of (scope.data_sources || [])) {
        if (!s.endpoint || !s.endpoint.url) continue;
        const res = await fetchJson(s.endpoint.url, {
          method: s.endpoint.method || 'GET',
          headers: s.endpoint.headers || {},
          body: s.endpoint.body !== undefined ? s.endpoint.body : (s.endpoint.method === 'POST' ? {} : undefined),
        });
        if (res.status !== 200) throw new Error('approved data source ' + s.id + ' returned HTTP ' + res.status);
        let rows = JSON.parse(res.body);
        if (!Array.isArray(rows)) rows = rows.data || rows.rows || [];
        const fm = s.field_map || {};
        const piiOk = !!s.pii_included;
        const famPrefix = s.generated_route_family ? s.generated_route_family.split('{')[0] : null;
        const items = rows.map(row => {
          const it = {};
          for (const [target, srcKey] of Object.entries(fm)) {
            if (target === 'detail_slug') continue;
            if (['contact_email', 'contact_phone'].includes(srcKey)) {
              if (piiOk) it.contact = row[srcKey];
              continue;
            }
            let v = row[srcKey];
            if (v === null || v === undefined) continue;
            if (srcKey === 'monthly_rate' || typeof v === 'number') it[target] = typeof v === 'number' ? '$' + v : v;
            else it[target] = v;
          }
          if (fm.detail_slug && famPrefix) {
            const slugs = row[fm.detail_slug];
            const slug = Array.isArray(slugs) ? slugs[slugs.length - 1] : slugs;
            if (slug) it.detail_link = famPrefix + slug;
          }
          // PII: pulled from the source's declared pii_fields only when HITL opted in.
          if (piiOk) {
            for (const pk of s.pii_fields || ['contact_email', 'contact_phone']) {
              if (row[pk]) { it.contact = row[pk]; break; }
            }
          }
          return it;
        });
        assets.push({
          asset: 'api.' + s.id,
          kind: 'api_data',
          source_id: s.id,
          route: s.page_path,
          region_selector: s.collection,
          endpoint: s.endpoint.url,
          source_type: s.source_type,
          count_captured: items.length,
          count_advertised: s.advertised_count || null,
          count_consistent: items.length === (s.advertised_count || items.length),
          verified_row_count: s.verified_row_count,
          pii_included: piiOk,
          generated_route_family: s.family_included ? s.generated_route_family : null,
          items,
        });
      }
      return { draft: false, assets };
    },
    (r) => {
      const v = contracts.validate('reusable-assets', r);
      const fails = v.errors.slice();
      if (!r.assets.some(a => a.kind === 'content_schema')) fails.push('no content schema assets');
      // anti-fabrication: listing items may only carry the allowed factual fields
      const ALLOWED = new Set(['name', 'role', 'price', 'experience', 'location', 'skills', 'detail_link']);
      for (const a of r.assets.filter(x => x.kind === 'listing_data')) {
        for (const it of a.items) {
          for (const k of Object.keys(it)) if (!ALLOWED.has(k)) fails.push('non-factual field in listing item: ' + k);
        }
        if (a.items.length !== a.count_captured) fails.push('listing item count mismatch: ' + a.asset);
      }
      // api_data: factual fields + optional contact (only when PII was approved)
      const API_ALLOWED = new Set(['name', 'role', 'price', 'experience', 'location', 'skills', 'detail_link', 'contact', 'category']);
      for (const a of r.assets.filter(x => x.kind === 'api_data')) {
        for (const it of a.items) {
          for (const k of Object.keys(it)) if (!API_ALLOWED.has(k)) fails.push('non-factual field in api item: ' + k);
        }
        if (a.items.length !== a.count_captured) fails.push('api item count mismatch: ' + a.asset);
        if (a.pii_included && !a.items.some(it => it.contact)) fails.push('pii approved but no contact data extracted: ' + a.asset);
        if (!a.pii_included && a.items.some(it => it.contact)) fails.push('contact data present without pii approval: ' + a.asset);
        // prose must never be copied from the API
        for (const it of a.items) {
          for (const [k, val] of Object.entries(it)) {
            if (typeof val === 'string' && val.length > 200) fails.push('prose-length value in api item field ' + k + ': ' + a.asset);
          }
        }
      }
      return { passed: v.passed && fails.length === 0, checks_run: 4, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'content-assets.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E04-media-assets
// ---------------------------------------------------------------------------
async function e04MediaAssets(jobId) {
  return runExtractBuild(jobId, 'E04-media-assets',
    'Extract media SLOTS (placeholders) — never the source imagery itself.',
    async () => {
      const ph = P.readArtifact(jobId, 'placeholder-map.json') || { groups: {} };
      const imageKeys = (ph.groups.content || []).filter(k => k.startsWith('image.'));
      const logoKeys = (ph.groups.brand || []).filter(k => k.startsWith('logo_'));
      const assets = [
        ...imageKeys.map(k => ({ asset: k, kind: 'media_slot', slot: 'image', replacement_required: true, source_copied: false })),
        ...logoKeys.map(k => ({ asset: k, kind: 'media_slot', slot: 'logo', replacement_required: true, source_copied: false })),
      ];
      return { draft: false, assets };
    },
    (r) => {
      const v = contracts.validate('reusable-assets', r);
      const fails = v.errors.slice();
      // invariant: no media asset may have copied source bytes
      for (const a of r.assets) if (a.source_copied !== false) fails.push('media asset marked source_copied: ' + a.asset);
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'media-assets.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E05-design-assets
// ---------------------------------------------------------------------------
async function e05DesignAssets(jobId) {
  return runExtractBuild(jobId, 'E05-design-assets',
    'Extract the rebrandable design-token layer (evidence values, not copied CSS).',
    async () => {
      const tokens = P.readArtifact(jobId, 'design-tokens.json');
      if (!tokens) throw new Error('no design tokens in confirmed analysis');
      return {
        draft: false,
        assets: [{
          asset: 'design.tokens',
          kind: 'design_tokens',
          colors: tokens.colors,
          typography: tokens.typography,
          spacing: tokens.spacing,
          radii: tokens.radii,
          shadows: tokens.shadows,
          breakpoints: tokens.breakpoints,
          rebrandable: true,
        }],
      };
    },
    (r) => {
      const v = contracts.validate('reusable-assets', r);
      const fails = v.errors.slice();
      const t = r.assets.find(a => a.kind === 'design_tokens');
      if (!t || !t.colors.length) fails.push('no color tokens extracted');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'design-assets.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E06-integration-manifest
// ---------------------------------------------------------------------------
async function e06IntegrationManifest(jobId) {
  return runExtractBuild(jobId, 'E06-integration-manifest',
    'Carry forward the record-only external endpoint manifest (destinations never scraped).',
    async () => {
      const im = P.readArtifact(jobId, 'integration-manifest.json') || { endpoints: [] };
      const scope = readExtraction(jobId, 'confirmed-scope.json');
      const endpoints = im.endpoints.filter(e => !scope || scope.external_endpoints.includes(e.original_url));
      return { endpoints };
    },
    (r) => {
      const v = contracts.validate('integration-manifest', r);
      const fails = v.errors.slice();
      for (const e of r.endpoints) if (e.treatment !== 'record_only') fails.push('endpoint not record-only: ' + e.original_url);
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'integration-manifest.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E07-placeholder-schema
// ---------------------------------------------------------------------------
async function e07PlaceholderSchema(jobId) {
  return runExtractBuild(jobId, 'E07-placeholder-schema',
    'Finalize the placeholder/personalization schema (draft -> final) for the build phase.',
    async () => {
      const ph = P.readArtifact(jobId, 'placeholder-map.json') || { groups: {} };
      const scope = readExtraction(jobId, 'confirmed-scope.json');
      return {
        draft: false,
        groups: ph.groups,
        user_supplied_data: scope ? scope.user_supplied_data : {},
        required_fields: Object.entries(ph.groups).flatMap(([g, keys]) => keys.map(k => ({ group: g, key: k }))),
      };
    },
    (r) => {
      const v = contracts.validate('placeholder-map', { groups: r.groups, draft: r.draft });
      const fails = v.errors.slice();
      if (r.draft !== false) fails.push('must be finalized (draft:false)');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'placeholder-schema.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// E08-extraction-QA
// ---------------------------------------------------------------------------
async function e08ExtractionQA(jobId) {
  return runExtractBuild(jobId, 'E08-extraction-QA',
    'Validate the full extraction set against the confirmed scope; emit the extraction manifest.',
    async () => {
      const scope = readExtraction(jobId, 'confirmed-scope.json');
      const struct = readExtraction(jobId, 'structure-assets.json') || { assets: [] };
      const content = readExtraction(jobId, 'content-assets.json') || { assets: [] };
      const media = readExtraction(jobId, 'media-assets.json') || { assets: [] };
      const design = readExtraction(jobId, 'design-assets.json') || { assets: [] };
      const integ = readExtraction(jobId, 'integration-manifest.json') || { endpoints: [] };
      const ph = readExtraction(jobId, 'placeholder-schema.json') || { groups: {} };

      const gaps = [];
      // every confirmed route must have a structure asset
      for (const rt of scope.routes) {
        if (!struct.assets.some(a => a.route === rt)) gaps.push({ area: 'structure', description: 'no structure asset for confirmed route ' + rt, severity: 'high' });
      }
      if (!design.assets.length) gaps.push({ area: 'design', description: 'no design assets', severity: 'high' });
      if (!ph.groups) gaps.push({ area: 'placeholders', description: 'no placeholder schema', severity: 'high' });

      return {
        job_id: jobId,
        assets: [
          ...struct.assets, ...content.assets, ...media.assets, ...design.assets,
        ],
        counts: {
          structure: struct.assets.length,
          content: content.assets.length,
          media: media.assets.length,
          design: design.assets.length,
          integrations: integ.endpoints.length,
          placeholder_groups: Object.keys(ph.groups || {}).length,
        },
        gaps,
      };
    },
    (r) => {
      const v = contracts.validate('extraction-manifest', r);
      const fails = v.errors.slice();
      if (r.gaps.some(g => g.severity === 'high')) fails.push('high-severity gaps present: ' + r.gaps.filter(g => g.severity === 'high').map(g => g.description).join('; '));
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) writeExtraction(jobId, 'extraction-manifest.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
const ORDER = [
  ['E01-confirmed-scope', (j) => e01ConfirmedScope(j)],
  ['E02-structure-assets', (j) => e02StructureAssets(j)],
  ['E03-content-assets', (j) => e03ContentAssets(j)],
  ['E04-media-assets', (j) => e04MediaAssets(j)],
  ['E05-design-assets', (j) => e05DesignAssets(j)],
  ['E06-integration-manifest', (j) => e06IntegrationManifest(j)],
  ['E07-placeholder-schema', (j) => e07PlaceholderSchema(j)],
  ['E08-extraction-QA', (j) => e08ExtractionQA(j)],
];

async function runExtractPhase(jobId) {
  const results = {};
  const completed = [];
  for (const [id, fn] of ORDER) {
    const res = await fn(jobId);
    results[id] = res;
    if (res.ok) completed.push(id);
    else return { completed, blocked: id, results };
  }
  return { completed, results };
}

module.exports = {
  ROOT, extractionDir, writeExtraction, readExtraction, runExtractBuild,
  e01ConfirmedScope, e02StructureAssets, e03ContentAssets, e04MediaAssets,
  e05DesignAssets, e06IntegrationManifest, e07PlaceholderSchema, e08ExtractionQA,
  runExtractPhase, ORDER,
};

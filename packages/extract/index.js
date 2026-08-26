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
    'Extract content schemas as field-level templates (no copied copy).',
    async () => {
      const cs = P.readArtifact(jobId, 'content-schemas.json') || { entities: [] };
      const assets = cs.entities.map(e => ({
        asset: 'content.' + e.entity_name,
        kind: 'content_schema',
        entity: e.entity_name,
        instance_count: e.instance_count,
        fields: e.fields.map(f => ({ name: f.name, type: f.type, required: f.required, example: '<placeholder>' })),
        confidence: e.confidence,
      }));
      return { draft: false, assets };
    },
    (r) => {
      const v = contracts.validate('reusable-assets', r);
      const fails = v.errors.slice();
      if (!r.assets.some(a => a.kind === 'content_schema')) fails.push('no content schema assets');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
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

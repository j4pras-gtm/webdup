'use strict';
/**
 * R02-contracts: add the 15 revised-spec analysis/extract/build contracts
 * (schemas + "mock": true fixtures) and modify 3 existing schemas.
 * Idempotent — safe to re-run.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMAS = path.join(ROOT, 'packages', 'contracts', 'schemas');
const MOCKS = path.join(ROOT, 'packages', 'contracts', 'mocks');

function w(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// New schemas (revised spec §6–§17, §19–§21)
// ---------------------------------------------------------------------------

const NEW = {
  // A03 — spec §6
  'sitemap': {
    $id: 'sitemap', title: 'Sitemap discovery output (A03)',
    required: ['source_url', 'evidence', 'discovered', 'crawlable', 'excluded', 'restricted', 'canonical'],
    properties: {
      source_url: { type: 'string' },
      evidence: { type: 'array' },            // sitemap.xml | robots.txt | nav | internal_links | rendered_dom | structured_data | route_patterns
      discovered: { type: 'array' },           // all routes seen anywhere
      crawlable: { type: 'array' },            // in-scope for analysis
      excluded: { type: 'array' },             // out of scope (with reason)
      restricted: { type: 'array' },           // auth/paywall/blocked
      canonical: { type: 'array' }             // duplicate -> canonical mapping
    }
  },
  // A04 — spec §7
  'route-inventory': {
    $id: 'route-inventory', title: 'Route inventory with page types (A04/A05)',
    required: ['routes'],
    properties: {
      routes: { type: 'array' }
      // each: { path, page_type, parent, children[], status: discovered|crawlable|excluded|restricted|canonical, confidence }
    }
  },
  // A04 — spec §7
  'link-graph': {
    $id: 'link-graph', title: 'Internal/external link graph (A04)',
    required: ['edges'],
    properties: {
      edges: { type: 'array' }
      // each: { from, to, kind: internal-detail|internal-section|internal-route|external|restricted,
      //         source_component, js_attached: bool, confidence }
    }
  },
  // A04 — spec §8
  'redirect-map': {
    $id: 'redirect-map', title: 'Redirect chains (A04)',
    required: ['entries'],
    properties: {
      entries: { type: 'array' }
      // each: { source_url, chain[], final_url, scope: internal|external, treatment: crawl|record_only }
    }
  },
  // A06 — spec §9/§10
  'dynamic-content-report': {
    $id: 'dynamic-content-report', title: 'Dynamic collection classification (A06)',
    required: ['collections'],
    properties: {
      collections: { type: 'array' }
      // each: { id, selector, mechanism: static|numbered_pagination|load_more|infinite_scroll,
      //         advertised_count, captured_count, count_status: consistent|flagged|escalated,
      //         stopping_condition, pages_captured, confidence }
    }
  },
  // A07 — spec §11
  'wireframe': {
    $id: 'wireframe', title: 'Machine-readable page wireframe (A07)',
    required: ['route', 'page_type', 'sections'],
    properties: {
      route: { type: 'string' },
      page_type: { type: 'string' },
      sections: { type: 'array' }   // ordered: { name, role, components[], content_fields[], interaction_points[] }
    }
  },
  // A08 — spec §12
  'content-schema': {
    $id: 'content-schema', title: 'Content/data model (A08)',
    required: ['entities'],
    properties: {
      entities: { type: 'array' }   // { entity, fields[], example_source_route, confidence }
    }
  },
  // A09 — spec §13
  'design-tokens': {
    $id: 'design-tokens', title: 'Design token layer (A09)',
    required: ['colors', 'typography', 'spacing', 'radii', 'shadows', 'breakpoints'],
    properties: {
      colors: { type: 'object' },
      typography: { type: 'object' },     // font families, weights, scale
      spacing: { type: 'object' },
      radii: { type: 'object' },
      shadows: { type: 'object' },
      borders: { type: 'object' },
      grid: { type: 'object' },           // container widths, columns
      breakpoints: { type: 'array' },
      hierarchy_notes: { type: 'string' }
    }
  },
  // A10 — spec §14
  'interaction-spec': {
    $id: 'interaction-spec', title: 'Detected interaction specification (A10)',
    required: ['interactions'],
    properties: {
      interactions: { type: 'array' }
      // each: { target, type, behavior, source_evidence, confidence }
      // e.g. navigation sticky+hamburger; collection infinite_scroll; card click_target detail_route
    }
  },
  // A11 — spec §15
  'component-inventory': {
    $id: 'component-inventory', title: 'Component inventory with reuse classification (A11)',
    required: ['components'],
    properties: {
      components: { type: 'array' }
      // each: { name, classification: core_reusable|review|source_restricted, confidence, notes }
    }
  },
  // A11/A13 — draft reusable asset list
  'reusable-assets': {
    $id: 'reusable-assets', title: 'Draft reusable asset list (A11/A13)',
    required: ['assets', 'draft'],
    properties: {
      assets: { type: 'array' },   // { asset, kind: component|pattern|token, source, confidence }
      draft: { type: 'boolean' }
    }
  },
  // A12 — spec §16
  'placeholder-map': {
    $id: 'placeholder-map', title: 'Placeholder / personalization map (A12)',
    required: ['groups', 'draft'],
    properties: {
      groups: { type: 'object' },   // brand / contact_integrations / content / legal -> fields[]
      draft: { type: 'boolean' }
    }
  },
  // E06 — spec §21
  'integration-manifest': {
    $id: 'integration-manifest', title: 'External integration manifest (E06, record-only endpoints)',
    required: ['endpoints'],
    properties: {
      endpoints: { type: 'array' }
      // each: { source_page, anchor_text, original_url, final_url, redirect_chain[],
      //         endpoint_type: whatsapp|linkedin|calendly|social|mailto|tel|booking|other,
      //         treatment: 'record_only' }
    }
  },
  // A13 — spec §17
  'analysis-package': {
    $id: 'analysis-package', title: 'Synthesized analysis package (A13)',
    required: ['job_id', 'source_url', 'artifacts', 'uncertainties', 'counts'],
    properties: {
      job_id: { type: 'string' },
      source_url: { type: 'string' },
      artifacts: { type: 'object' },   // artifact name -> relative file path
      uncertainties: { type: 'array' },// recorded low-confidence findings
      counts: { type: 'object' }       // advertised vs captured per collection
    }
  },
  // HITL — spec §18
  'analysis-confirmation': {
    $id: 'analysis-confirmation', title: 'HITL confirmation record (gate between A13 and E01)',
    required: ['job_id', 'decision', 'confirmed_at', 'confirmed_scope'],
    properties: {
      job_id: { type: 'string' },
      decision: { type: 'string' },        // confirmed | narrowed | accepted_draft
      confirmed_at: { type: 'string' },
      confirmed_scope: { type: 'object' },  // kept routes/components/collections
      removed_components: { type: 'array' },
      removed_pages: { type: 'array' },
      user_supplied_data: { type: 'object' }// personalization values provided at review
    }
  }
};

for (const [name, schema] of Object.entries(NEW)) {
  w(path.join(SCHEMAS, name + '.schema.json'), schema);
}

// ---------------------------------------------------------------------------
// Mock fixtures ("mock": true) for every new contract
// ---------------------------------------------------------------------------

const MOCK = {
  'sitemap.mock.json': {
    mock: true, source_url: 'https://example.com/',
    evidence: ['nav', 'internal_links'],
    discovered: ['/'], crawlable: ['/'], excluded: [], restricted: [], canonical: []
  },
  'route-inventory.mock.json': {
    mock: true,
    routes: [{ path: '/', page_type: 'home', parent: null, children: [], status: 'crawlable', confidence: 0.9 }]
  },
  'link-graph.mock.json': {
    mock: true,
    edges: [{ from: '/', to: '/about', kind: 'internal-route', source_component: 'header-nav', js_attached: false, confidence: 0.9 }]
  },
  'redirect-map.mock.json': {
    mock: true,
    entries: [{ source_url: '/old', chain: ['/old', '/new'], final_url: '/new', scope: 'internal', treatment: 'crawl' }]
  },
  'dynamic-content-report.mock.json': {
    mock: true,
    collections: [{
      id: 'items', selector: '.grid > article', mechanism: 'static',
      advertised_count: null, captured_count: 1, count_status: 'consistent',
      stopping_condition: 'n/a', pages_captured: 1, confidence: 0.9
    }]
  },
  'wireframe.mock.json': {
    mock: true, route: '/', page_type: 'home',
    sections: [{ name: 'hero', role: 'primary', components: ['heading', 'cta'], content_fields: ['headline', 'subhead'], interaction_points: [] }]
  },
  'content-schema.mock.json': {
    mock: true,
    entities: [{ entity: 'item', fields: ['title', 'body'], example_source_route: '/', confidence: 0.8 }]
  },
  'design-tokens.mock.json': {
    mock: true,
    colors: { primary: '#000000', text: '#111111', background: '#ffffff' },
    typography: { sans: 'system-ui', weights: [400, 700] },
    spacing: { unit: 8 }, radii: { card: 8 }, shadows: { card: 'none' },
    borders: {}, grid: { container: 1100 }, breakpoints: [768, 1024],
    hierarchy_notes: 'mock'
  },
  'interaction-spec.mock.json': {
    mock: true,
    interactions: [{ target: 'navigation', type: 'sticky', behavior: 'sticky_top', source_evidence: 'css position:sticky', confidence: 0.9 }]
  },
  'component-inventory.mock.json': {
    mock: true,
    components: [{ name: 'hero', classification: 'core_reusable', confidence: 0.9, notes: 'mock' }]
  },
  'reusable-assets.mock.json': {
    mock: true, draft: true,
    assets: [{ asset: 'hero', kind: 'component', source: 'home', confidence: 0.9 }]
  },
  'placeholder-map.mock.json': {
    mock: true, draft: true,
    groups: { brand: ['displayName', 'logo', 'primaryColor', 'fonts'], contact_integrations: [], content: [], legal: [] }
  },
  'integration-manifest.mock.json': {
    mock: true,
    endpoints: [{
      source_page: '/', anchor_text: 'Contact', original_url: 'mailto:x@example.com',
      final_url: 'mailto:x@example.com', redirect_chain: [], endpoint_type: 'mailto', treatment: 'record_only'
    }]
  },
  'analysis-package.mock.json': {
    mock: true, job_id: 'job-mock', source_url: 'https://example.com/',
    artifacts: { sitemap: 'analysis/sitemap.json' },
    uncertainties: [], counts: {}
  },
  'analysis-confirmation.mock.json': {
    mock: true, job_id: 'job-mock', decision: 'accepted_draft',
    confirmed_at: '2026-01-01T00:00:00Z',
    confirmed_scope: { routes: ['/'], components: ['hero'], collections: ['items'] },
    removed_components: [], removed_pages: [], user_supplied_data: {}
  }
};

for (const [file, obj] of Object.entries(MOCK)) {
  w(path.join(MOCKS, file), obj);
}

// ---------------------------------------------------------------------------
// Modify existing schemas
// ---------------------------------------------------------------------------

// build-status: add phase + upstream_artifacts (spec §28 drift re-checks)
const bsFile = path.join(SCHEMAS, 'build-status.schema.json');
const bs = JSON.parse(fs.readFileSync(bsFile, 'utf8'));
bs.properties.phase = { type: 'string' };                 // analyze | extract | build
bs.properties.upstream_artifacts = { type: 'array' };     // artifacts this build depends on
w(bsFile, bs);

// brand: extend into personalization/brand group (spec §16)
const brFile = path.join(SCHEMAS, 'brand.schema.json');
const br = JSON.parse(fs.readFileSync(brFile, 'utf8'));
br.properties.personalization_group = { type: 'string' }; // 'brand' group marker inside placeholder map
w(brFile, br);

// site_inventory: deprecate (superseded by sitemap + route-inventory, spec §6)
const siFile = path.join(SCHEMAS, 'site-inventory.schema.json');
if (fs.existsSync(siFile)) {
  const si = JSON.parse(fs.readFileSync(siFile, 'utf8'));
  si.deprecated = true;
  si.superseded_by = ['sitemap', 'route-inventory'];
  w(siFile, si);
} else {
  console.log('note: site-inventory.schema.json not found (mock-only), skipping deprecation flag');
}

console.log('R02 done:', Object.keys(NEW).length, 'new schemas +', Object.keys(MOCK).length, 'mocks; modified build-status, brand; deprecated site_inventory');

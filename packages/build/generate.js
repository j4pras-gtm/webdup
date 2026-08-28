'use strict';
/**
 * Generic portable-artifact generator (revised spec §22–§25).
 * Consumes ONLY: confirmed analysis + extracted assets + user-supplied data + build config.
 * No source-specific assumptions. Every emitted element traces to a confirmed artifact.
 * Stages map 1:1 to B01–B08; B09/B10 are verification.
 */

const fs = require('fs');
const path = require('path');
const P = require('../analyze/pipeline');
const EX = require('../extract');

const ROOT = P.ROOT;

function artifactDir(jobId) { return path.join(P.jobDir(jobId), 'artifact'); }

/** Build config lives at jobs/<job>/build-config.json (user-supplied). */
function readConfig(jobId) {
  const f = path.join(P.jobDir(jobId), 'build-config.json');
  const cfg = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  cfg.brand = cfg.brand || {};
  return cfg;
}

function loadContext(jobId) {
  const scope = EX.readExtraction(jobId, 'confirmed-scope.json');
  if (!scope) throw new Error('run Extract phase first (E01-E08)');
  return {
    scope,
    struct: EX.readExtraction(jobId, 'structure-assets.json') || { assets: [] },
    content: EX.readExtraction(jobId, 'content-assets.json') || { assets: [] },
    media: EX.readExtraction(jobId, 'media-assets.json') || { assets: [] },
    design: EX.readExtraction(jobId, 'design-assets.json') || { assets: [] },
    integ: EX.readExtraction(jobId, 'integration-manifest.json') || { endpoints: [] },
    ph: EX.readExtraction(jobId, 'placeholder-schema.json') || { groups: {} },
    wire: P.readArtifact(jobId, 'wireframes.json') || { wireframes: [] },
    dyn: P.readArtifact(jobId, 'dynamic-content.json') || { collections: [] },
    inter: P.readArtifact(jobId, 'interactions.json') || { interactions: [] },
    tokens: P.readArtifact(jobId, 'design-tokens.json'),
  };
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Route -> artifact file. Directory-style layout (dir/slug/index.html) so
 *  relative asset links from any depth resolve correctly on disk AND under a
 *  static server (extensionless /dir/slug/ works out of the box). */
function routeFile(p) {
  if (p === '/' || p === '') return 'index.html';
  return p.replace(/^\//, '') + '/index.html';
}

/** Relative prefix from a route's directory back to the artifact root. */
function relPrefix(route) {
  const segs = (route || '/').split('/').filter(Boolean);
  return segs.length ? '../'.repeat(segs.length) : '';
}


// ---------------------------------------------------------------------------
// B01 — build shell
// ---------------------------------------------------------------------------
function b01Shell(jobId, cfg) {
  const dir = artifactDir(jobId);
  fs.mkdirSync(path.join(dir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  const manifest = { job_id: jobId, generated_at: new Date().toISOString(), routes: [], components: [], interactions: [], collections: [], externalLinks: [], dir: 'artifact' };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { dir, manifestFile: 'manifest.json' };
}

// ---------------------------------------------------------------------------
// B02 — components (header/footer/card fragments, from wireframe roles)
// ---------------------------------------------------------------------------
function b02Components(jobId, cfg) {
  const ctx = loadContext(jobId);
  const dir = artifactDir(jobId);
  const compDir = path.join(dir, 'components');
  fs.mkdirSync(compDir, { recursive: true });
  const brand = readConfig(jobId).brand;
  const brandName = brand.name || '[Brand Name]';

  // header: nav links = confirmed routes only. {{BASE}} is replaced per-page by
  // B05 with the relative prefix back to the artifact root (fragments are shared
  // across pages at different depths, so they can't hardcode relative paths).
  const navLinks = ctx.scope.routes.map(r => `<a href="{{BASE}}${esc(routeFile(r))}">${esc(r === '/' ? 'Home' : r.replace(/^\//, '').replace(/-/g, ' '))}</a>`).join('\n        ');
  const header = `<header class="site-header">
      <a class="logo" href="{{BASE}}${esc(routeFile('/'))}"><span class="logo-slot" data-slot="logo">[LOGO]</span></a>
      <nav class="site-nav">
        ${navLinks}
      </nav>
    </header>`;
  fs.writeFileSync(path.join(compDir, 'header.html'), header, 'utf8');

  // footer: external endpoints recorded in analysis (record-only destinations, linked verbatim).
  // URLs are NOT entity-escaped: they are confirmed analysis data and must stay byte-identical
  // so the Build QA link check can match them against the integration manifest.
  const extByPage = {};
  for (const e of ctx.integ.endpoints) (extByPage[e.source_page] = extByPage[e.source_page] || []).push(e);
  const allExt = ctx.integ.endpoints;
  const footerLinks = allExt.map(e => `<a class="ext-link" href="${e.original_url}" rel="noopener">${esc(e.anchor_text || e.endpoint_type)}</a>`).join('\n      ');
  const footer = `<footer class="site-footer">
      <p class="footer-copy" data-placeholder="brand.footer_note">${esc(brand.footer_note || '[Footer note]')}</p>
      ${footerLinks}
    </footer>`;
  fs.writeFileSync(path.join(compDir, 'footer.html'), footer, 'utf8');

  // card fragment for repeating collections. Factual fields are filled by B05
  // from confirmed listing_data; anything absent renders as a visible slot.
  const card = `<article class="card">
      <div class="card-media" data-slot="image"><span>[IMAGE]</span></div>
      <h3 class="card-title" data-placeholder="content.item_title">[Item title]</h3>
      <p class="card-role" data-placeholder="content.item_role">[Role]</p>
      <ul class="card-skills"></ul>
      <p class="card-meta" data-placeholder="content.item_meta"></p>
      <p class="card-body" data-placeholder="content.item_body">[Description]</p>
    </article>`;
  fs.writeFileSync(path.join(compDir, 'card.html'), card, 'utf8');

  return { components: ['header', 'footer', 'card'] };
}

// ---------------------------------------------------------------------------
// B03 — inject design (tokens.css from confirmed token layer)
// ---------------------------------------------------------------------------
function b03Design(jobId, cfg) {
  const ctx = loadContext(jobId);
  const t = ctx.tokens;
  if (!t) throw new Error('no confirmed design tokens');
  const L = ['/* Design tokens — evidence values from confirmed analysis; rebrandable layer */', ':root {'];
  (t.colors || []).forEach((c, i) => L.push(`  --color-${i}: ${c.value};`));
  if (t.typography && t.typography.font_families) {
    t.typography.font_families.forEach((f, i) => L.push(`  --font-${i}: ${f.replace(/"/g, '\\"')};`));
  }
  (t.radii || []).forEach((r, i) => L.push(`  --radius-${i}: ${r};`));
  (t.shadows || []).forEach((s, i) => L.push(`  --shadow-${i}: ${s};`));
  L.push('}');
  L.push('');
  L.push('body { margin: 0; font-family: var(--font-0, system-ui, sans-serif); color: var(--color-0, #111); }');
  L.push('.site-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; border-bottom: 1px solid var(--color-1, #ddd); position: sticky; top: 0; background: var(--color-2, #fff); z-index: 10; }');
  L.push('.site-nav a { margin-left: 1rem; text-decoration: none; color: inherit; }');
  L.push('.hero { padding: 4rem 2rem; text-align: center; }');
  L.push('.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; padding: 2rem; }');
  L.push('.card { border: 1px solid var(--color-1, #ddd); border-radius: var(--radius-0, 8px); overflow: hidden; box-shadow: var(--shadow-0, none); }');
  L.push('.card-media { background: var(--color-1, #eee); aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; color: #666; }');
  L.push('.card-title { margin: 0.75rem 1rem 0; font-size: 1.1rem; }');
  L.push('.card-role { margin: 0.25rem 1rem 0; font-size: 0.9rem; color: #555; }');
  L.push('.card-skills { list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.5rem 1rem 0; padding: 0; }');
  L.push('.card-skills li { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--color-1, #eee); color: #444; }');
  L.push('.card-meta { margin: 0.5rem 1rem 0; font-size: 0.85rem; color: #666; }');
  L.push('.card-body { margin: 0.5rem 1rem 1rem; color: #444; }');
  L.push('.card-link { display: inline-block; margin: 0.5rem 1rem 0; font-size: 0.85rem; text-decoration: none; color: var(--color-3, #06c); }');
  L.push('.site-footer { padding: 2rem; border-top: 1px solid var(--color-1, #ddd); margin-top: 3rem; }');
  L.push('.ext-link { margin-right: 1rem; }');
  L.push('[data-hidden] { display: none; }');
  fs.writeFileSync(path.join(artifactDir(jobId), 'css', 'tokens.css'), L.join('\n') + '\n', 'utf8');
  return { file: 'css/tokens.css', colors: (t.colors || []).length };
}

// ---------------------------------------------------------------------------
// B04 — inject content (user-supplied data into placeholders)
// ---------------------------------------------------------------------------
function b04Content(jobId, cfg) {
  const ctx = loadContext(jobId);
  const brand = readConfig(jobId).brand;
  const filled = {
    'brand.name': brand.name || null,
    'brand.tagline': brand.tagline || null,
    'brand.footer_note': brand.footer_note || null,
  };
  const unresolved = Object.entries(filled).filter(([k, v]) => !v).map(([k]) => k);
  fs.mkdirSync(path.join(artifactDir(jobId), 'data'), { recursive: true });
  fs.writeFileSync(path.join(artifactDir(jobId), 'data', 'content.json'), JSON.stringify({ filled, unresolved }, null, 2) + '\n', 'utf8');
  return { filled, unresolved };
}

// ---------------------------------------------------------------------------
// B05 — build routes (render each confirmed route from its wireframe)
// ---------------------------------------------------------------------------

/** Relative prefix so a page at depth N reaches the artifact root (works from disk). */
function relPrefix(route) {
  const segs = (route || '/').split('/').filter(Boolean);
  return segs.length ? '../'.repeat(segs.length) : '';
}

function b05Routes(jobId, cfg) {
  const ctx = loadContext(jobId);
  const dir = artifactDir(jobId);
  const header = fs.readFileSync(path.join(dir, 'components', 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(dir, 'components', 'footer.html'), 'utf8');
  const cardTpl = fs.readFileSync(path.join(dir, 'components', 'card.html'), 'utf8');
  const content = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'content.json'), 'utf8'));
  const brandName = content.filled['brand.name'] || '[Brand Name]';
  const tagline = content.filled['brand.tagline'] || '[Tagline]';

  // factual listing data per route (E03): DOM-captured AND HITL-approved API sources.
  // An API asset covering a region supersedes the DOM window (same data, complete).
  const listingsByRoute = {};
  for (const a of ctx.content.assets.filter(x => x.kind === 'listing_data' || x.kind === 'api_data')) {
    (listingsByRoute[a.route] = listingsByRoute[a.route] || []).push(a);
  }

  const dynByRoute = {};
  for (const c of ctx.dyn.collections) (dynByRoute[c.page_path] = dynByRoute[c.page_path] || []).push(c);

  const confirmedRoutes = new Set(ctx.scope.routes);
  // Approved generated route families (HITL-gated): e.g. '/talent/{slug}'.
  const generatedFamilies = ctx.scope.generated_route_families || [];
  const familyPrefix = (fam) => fam.split('{')[0];
  const isGeneratedRoute = (p) => generatedFamilies.some(fam => p.startsWith(familyPrefix(fam)));

  function renderCard(item, i, rel) {
    let c = cardTpl;
    c = c.replace('[Item title]', esc(item && item.name ? item.name : `Item ${i + 1}`));
    c = c.replace('[Role]', esc(item && item.role ? item.role : '[Role]'));
    const skills = item && Array.isArray(item.skills) && item.skills.length
      ? '<ul class="card-skills">' + item.skills.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>'
      : '<ul class="card-skills" data-hidden></ul>';
    c = c.replace('<ul class="card-skills"></ul>', skills);
    const meta = item ? [item.experience, item.location, item.price].filter(Boolean).join(' · ') : '';
    c = c.replace('<p class="card-meta" data-placeholder="content.item_meta"></p>',
      meta ? `<p class="card-meta">${esc(meta)}</p>` : '<p class="card-meta" data-hidden></p>');
    // description is NEVER copied from source — always a placeholder slot
    if (item && item.detail_link && (confirmedRoutes.has(item.detail_link) || isGeneratedRoute(item.detail_link))) {
      c = c.replace('<p class="card-body"', `<a class="card-link" href="${rel}${esc(routeFile(item.detail_link))}">View profile</a>\n      <p class="card-body"`);
    }
    return c;
  }

  const rendered = [];
  for (const wf of ctx.wire.wireframes) {
    if (!ctx.scope.routes.includes(wf.route)) continue; // confirmed scope only
    const rel = relPrefix(wf.route);
    const routeDyn = dynByRoute[wf.route] || [];
    let dynIdx = 0;
    const sections = [];
    for (const s of wf.sections) {
      if (s.role === 'header' || s.role === 'footer') continue; // handled by components
      const isCollectionSection = s.role === 'collection' || (s.data_bindings || []).includes('repeating_items');
      const dynHere = isCollectionSection && dynIdx < routeDyn.length ? routeDyn[dynIdx++] : null;
      if (dynHere) {
        // Render EXACTLY the captured count; behavior attribute drives B06 mechanism.
        // Prefer the HITL-approved API source when it covers this region.
        const listAssets = (listingsByRoute[wf.route] || []).filter(a => a.region_selector === dynHere.region_selector);
        const apiAsset = listAssets.find(a => a.kind === 'api_data') || null;
        const domAsset = listAssets.find(a => a.kind === 'listing_data') || null;
        const src = apiAsset || domAsset;
        const itemsArr = src ? src.items : [];
        const captured = apiAsset ? apiAsset.count_captured : dynHere.item_count_captured;
        const advertised = apiAsset ? apiAsset.count_advertised : dynHere.item_count_advertised;
        const items = Array.from({ length: captured }, (_, i) =>
          renderCard(itemsArr[i], i, rel)).join('\n      ');
        const advAttr = advertised ? ` data-advertised="${advertised}"` : '';
        sections.push(`<section id="${esc(s.id)}" class="grid collection" data-region="${esc(dynHere.region_selector)}" data-behavior="${esc(dynHere.behavior)}" data-captured="${captured}"${advAttr}>\n      ${items}\n    </section>`);
      } else if (s.role === 'hero') {
        sections.push(`<section id="${esc(s.id)}" class="hero">\n      <h1>${esc(brandName)}</h1>\n      <p>${esc(tagline)}</p>\n    </section>`);
      } else {
        sections.push(`<section id="${esc(s.id)}">\n      <h2>${esc(s.heading ? '[Section heading]' : '')}</h2>\n      <p data-placeholder="content.${s.id}_body">[Section body]</p>\n    </section>`);
      }
    }
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brandName)}${wf.route !== '/' ? ' — ' + esc(wf.route.replace(/^\//, '')) : ''}</title>
<link rel="stylesheet" href="${rel}css/tokens.css">
</head>
<body>
${header.replace(/\{\{BASE\}\}/g, rel)}
<main>
${sections.join('\n')}
</main>
${footer}
<script src="${rel}js/interactions.js"></script>
</body>
</html>
`;
    const file = routeFile(wf.route);
    const absFile = path.join(dir, file);
    fs.mkdirSync(path.dirname(absFile), { recursive: true });
    fs.writeFileSync(absFile, html, 'utf8');
    rendered.push({ path: wf.route, file });
  }

  // Generated detail pages from HITL-approved route families. Slugs come from the
  // data itself (legacy_slugs in the rows) — evidenced, not fabricated. Content is
  // factual fields + placeholder prose only.
  const generated = [];
  for (const fam of generatedFamilies) {
    const prefix = familyPrefix(fam);
    for (const a of ctx.content.assets.filter(x => x.kind === 'api_data' && x.generated_route_family === fam)) {
      for (const it of a.items) {
        if (!it.detail_link || !it.detail_link.startsWith(prefix)) continue;
        // Confirmed (crawled) routes keep their wireframe rendering — the generated
        // family only fills in pages the crawl never visited.
        if (confirmedRoutes.has(it.detail_link)) continue;
        const file = routeFile(it.detail_link);
        const absFile = path.join(dir, file);
        fs.mkdirSync(path.dirname(absFile), { recursive: true });
        const rel = relPrefix(it.detail_link);
        const meta = [it.experience, it.location, it.price].filter(Boolean).join(' \u00b7 ');
        const skills = Array.isArray(it.skills) && it.skills.length
          ? '<ul class="card-skills">' + it.skills.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>' : '';
        const contact = (a.pii_included && it.contact) ? `<p class="card-meta">Contact: ${esc(it.contact)}</p>` : '';
        const cat = it.category ? `<p class="card-role">${esc(it.category)}</p>` : '';
        const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(it.name)} \u2014 ${esc(brandName)}</title>
<link rel="stylesheet" href="${rel}css/tokens.css">
</head>
<body>
${header.replace(/\{\{BASE\}\}/g, rel)}
<main>
<section class="hero">
  <h1>${esc(it.name)}</h1>
  <p class="card-role">${esc(it.role || '')}</p>
  ${cat}
  ${skills}
  ${meta ? `<p class="card-meta">${esc(meta)}</p>` : ''}
  ${contact}
  <p data-placeholder="content.profile_bio">[Profile description]</p>
  <a class="card-link" href="${rel}index.html">\u2190 Back to directory</a>
</section>
</main>
${footer}
<script src="${rel}js/interactions.js"></script>
</body>
</html>
`;
        fs.writeFileSync(absFile, html, 'utf8');
        generated.push({ path: it.detail_link, file });
      }
    }
  }
  return { rendered, generated };
}

// ---------------------------------------------------------------------------
// B06 — build interactions (ONLY mechanisms present in the confirmed spec)
// ---------------------------------------------------------------------------
function b06Interactions(jobId, cfg) {
  const ctx = loadContext(jobId);
  const mechanisms = [...new Set(ctx.inter.interactions.map(i => i.mechanism))];
  const L = [
    '// Interactions — generated strictly from the confirmed interaction specification.',
    '// Mechanisms present: ' + (mechanisms.join(', ') || '(none)'),
    '(function () {',
  ];
  if (mechanisms.includes('client_toggle')) {
    L.push("  document.querySelectorAll('[data-toggle]').forEach(function (btn) {");
    L.push('    btn.addEventListener(\'click\', function () {');
    L.push('      var target = document.querySelector(btn.getAttribute(\'data-toggle-target\'));');
    L.push('      if (target) target.toggleAttribute(\'data-hidden\');');
    L.push('    });');
    L.push('  });');
  }
  if (mechanisms.includes('form_submit')) {
    L.push("  document.querySelectorAll('form[data-static]').forEach(function (f) {");
    L.push('    f.addEventListener(\'submit\', function (e) { e.preventDefault(); f.reset(); });');
    L.push('  });');
  }
  if (mechanisms.includes('in_page_anchor')) {
    L.push("  document.querySelectorAll('a[href^=\"#\"]').forEach(function (a) {");
    L.push('    a.addEventListener(\'click\', function (e) {');
    L.push('      var el = document.querySelector(a.getAttribute(\'href\'));');
    L.push('      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: \'smooth\' }); }');
    L.push('    });');
    L.push('  });');
  }
  if (mechanisms.includes('infinite_scroll')) {
    // reproduce the source mechanism: reveal captured items in batches on scroll.
    // Never fabricates items beyond the captured count.
    L.push("  document.querySelectorAll('.collection[data-behavior=\"infinite_scroll\"]').forEach(function (col) {");
    L.push('    var cards = col.querySelectorAll(\'.card\'); var shown = Math.min(4, cards.length);');
    L.push('    function apply() { cards.forEach(function (c, i) { c.toggleAttribute(\'data-hidden\', i >= shown); }); }');
    L.push('    apply();');
    L.push('    window.addEventListener(\'scroll\', function () {');
    L.push('      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200 && shown < cards.length) { shown += 4; apply(); }');
    L.push('    });');
    L.push('  });');
  }
  L.push('})();');
  fs.writeFileSync(path.join(artifactDir(jobId), 'js', 'interactions.js'), L.join('\n') + '\n', 'utf8');
  return { mechanisms };
}

// ---------------------------------------------------------------------------
// B07 — build responsive (breakpoint rules from confirmed tokens)
// ---------------------------------------------------------------------------
function b07Responsive(jobId, cfg) {
  const ctx = loadContext(jobId);
  const bps = (ctx.tokens && ctx.tokens.breakpoints) || [];
  const L = ['/* Responsive rules — breakpoints from confirmed analysis */'];
  for (const bp of bps) {
    L.push(`@media (max-width: ${bp}) {`);
    L.push('  .site-header { flex-direction: column; gap: 0.5rem; }');
    L.push('  .site-nav a { margin: 0 0.5rem; }');
    L.push('  .grid { grid-template-columns: 1fr; }');
    L.push('}');
  }
  if (!bps.length) L.push('/* no breakpoints detected in source — single-column layout */');
  fs.writeFileSync(path.join(artifactDir(jobId), 'css', 'responsive.css'), L.join('\n') + '\n', 'utf8');
  // append link into every page head (recursive; pages use relative asset refs)
  const dir = artifactDir(jobId);
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (!f.endsWith('.html')) continue;
    if (f.split(path.sep)[0] === 'components') continue; // fragments: hrefs resolve in page context, checked by B10
    const p = path.join(dir, f);
    let h = fs.readFileSync(p, 'utf8');
    if (!h.includes('responsive.css')) {
      const relF = f.split(path.sep).join('/');
      const route = relF === 'index.html' ? '/' : '/' + relF.replace(/\/index\.html$/, '');
      h = h.replace(/(<link rel="stylesheet" href="[^"]*tokens\.css">)/, '$1\n<link rel="stylesheet" href="' + relPrefix(route) + 'css/responsive.css">');
      fs.writeFileSync(p, h, 'utf8');
    }
  }
  return { breakpoints: bps.length };
}

// ---------------------------------------------------------------------------
// B08 — build static (finalize manifest; artifact is complete & portable)
// ---------------------------------------------------------------------------
function b08Static(jobId, cfg) {
  const ctx = loadContext(jobId);
  const dir = artifactDir(jobId);
  const mf = path.join(dir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.routes = fs.readdirSync(dir, { recursive: true })
    .filter(f => f.endsWith('.html'))
    .filter(f => {
      const rel = f.split(path.sep).join('/');
      // only page files count as routes: top-level index.html or <dir>/index.html
      return rel === 'index.html' || /(^|\/)[^/]+\/index\.html$/.test(rel);
    })
    .map(f => {
      const rel = f.split(path.sep).join('/'); // readdirSync(recursive) already returns dir-relative
      const p = rel === 'index.html' ? '/' : '/' + rel.replace(/\/index\.html$/, '');
      return { path: p, file: rel };
    });
  m.components = ['header', 'footer', 'card'];
  m.interactions = [...new Set(ctx.inter.interactions.map(i => i.mechanism))];
  m.collections = ctx.dyn.collections.filter(c => ctx.scope.routes.includes(c.page_path)).map(c => {
    const apiAsset = (ctx.content.assets || []).find(a => a.kind === 'api_data' && a.route === c.page_path && a.region_selector === c.region_selector);
    return apiAsset
      ? { route: c.page_path, region: c.region_selector, count: apiAsset.count_captured, behavior: c.behavior, source: 'api:' + apiAsset.source_id }
      : { route: c.page_path, region: c.region_selector, count: c.item_count_captured, behavior: c.behavior, source: 'dom' };
  });
  m.generated_route_families = ctx.scope.generated_route_families || [];
  m.externalLinks = ctx.integ.endpoints.map(e => e.original_url);
  m.portable = true;
  m.view_instructions = 'Open index.html in any browser, or: npx serve <dir> (any static server works)';
  fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n', 'utf8');
  return { manifest: m };
}

// ---------------------------------------------------------------------------
// B09 — local preview verification (every referenced local asset exists)
// ---------------------------------------------------------------------------
function b09Preview(jobId, cfg) {
  const dir = artifactDir(jobId);
  const missing = [];
  const ASSET_EXT = /\.(css|js|png|jpe?g|gif|svg|webp|ico|json|woff2?)$/i;
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (!f.endsWith('.html')) continue;
    if (f.split(path.sep)[0] === 'components') continue; // fragments: hrefs resolve in page context, checked by B10
    const absFile = path.join(dir, f);
    const html = fs.readFileSync(absFile, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(u) || u.startsWith('#')) continue; // any URI scheme is not a local file ref
      const p = u.split('?')[0].split('#')[0];
      // resolve relative to the page's own directory (artifact uses relative refs)
      const abs = path.resolve(path.dirname(absFile), p);
      if (!fs.existsSync(abs)) missing.push(f + ' -> ' + u);
    }
  }
  return { missing, ok: missing.length === 0 };
}

module.exports = { ROOT, artifactDir, readConfig, loadContext, routeFile, b01Shell, b02Components, b03Design, b04Content, b05Routes, b06Interactions, b07Responsive, b08Static, b09Preview };

'use strict';
/**
 * Analyze phase builds A05–A13 (revised spec §4–§17).
 * All DOM analysis runs on crawled evidence saved by A04 (analysis/crawled/*.html).
 */

const fs = require('fs');
const path = require('path');
const contracts = require('../contracts');
const { parse, queryAll, querySelector, textOf, allElements } = require('./lib/html');
const P = require('./pipeline');

const ROOT = P.ROOT;

/** Load all crawled page trees for a job (path from sidecar meta when present). */
function loadPages(jobId) {
  const dir = path.join(P.analysisDir(jobId), 'crawled');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    let pgPath = f.replace(/\.html$/, '').replace(/_/g, '/');
    const metaFile = path.join(dir, f.replace(/\.html$/, '') + '.meta.json');
    if (fs.existsSync(metaFile)) {
      try { pgPath = JSON.parse(fs.readFileSync(metaFile, 'utf8')).path; } catch (_) { /* keep derived */ }
    }
    return { file: f, path: pgPath, tree: parse(html), html };
  });
}

// ---------------------------------------------------------------------------
// A05-route-inventory
// ---------------------------------------------------------------------------

async function a05RouteInventory(jobId) {
  return P.runAnalyzeBuild(jobId, 'A05-route-inventory',
    'Classify every crawlable route: type, purpose, primary components, data requirements.',
    async () => {
      const pages = loadPages(jobId);
      if (!pages.length) throw new Error('no crawled pages');
      const routes = pages.map(pg => {
        const title = querySelector(pg.tree, 'title');
        const h1 = querySelector(pg.tree, 'h1');
        const sections = queryAll(pg.tree, 'section, main > div').length;
        const cards = queryAll(pg.tree, '[class*="card"], [class*="profile"], [class*="tile"], [class*="item"]').length;
        let type = 'content';
        if (pg.path === '/') type = 'landing';
        else if (/\/(blog|news|articles|resources|guides|insights)(\/|$)/i.test(pg.path)) type = 'listing';
        else if (/\/(contact|about|team|pricing|faq|careers)(\/|$)/i.test(pg.path)) type = 'informational';
        else if (/^\/[a-z-]+\/[^/]+$/i.test(pg.path)) type = 'detail';
        return {
          path: pg.path,
          type,
          purpose: (h1 ? textOf(h1) : title ? textOf(title) : pg.path).slice(0, 120),
          primary_components: ['header', 'main', ...(cards ? ['card-grid'] : []), ...(sections > 1 ? ['sections'] : [])],
          data_requirements: cards ? ['card_items'] : [],
          status: 'confirmed',
          confidence: 0.8,
        };
      });
      return { source_url: null, routes };
    },
    (r) => {
      const v = contracts.validate('route-inventory', r);
      const fails = v.errors.slice();
      if (!r.routes.some(x => x.path === '/')) fails.push('home route missing');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'route-inventory.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A06-dynamic-content-analysis
// ---------------------------------------------------------------------------

/** Find advertised item counts in visible page text, e.g. "272 active profiles". */
function findAdvertisedCounts(pageText) {
  const out = [];
  const re = /([\d][\d,]{1,8})\+?\s+(?:\w+\s){0,3}?(profiles|specialists|professionals|experts|tools|products|services|people|members|listings|jobs|vacancies|guides|articles)/gi;
  let m;
  while ((m = re.exec(pageText)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (!n || n < 3 || n > 100000) continue;
    const dup = out.find(o => o.count === n && o.noun === m[2].toLowerCase() && Math.abs(o.pos - m.index) < 40);
    if (!dup) out.push({ count: n, noun: m[2].toLowerCase(), pos: m.index, phrase: m[0].trim() });
  }
  return out;
}

/** Extract FACTUAL listing fields from one card element (policy: data yes, prose no).
 *  Prefers structural selectors (name/role/price/location/skills); falls back to
 *  text heuristics for cards without the expected classes. */
function extractFactualItem(e) {
  const txt = textOf(e).replace(/\s+/g, ' ').trim();
  const q = (sel) => querySelector(e, sel);

  const nameEl = q('h1, h2, h3, h4') || q('strong');
  const name = nameEl ? textOf(nameEl).trim().slice(0, 80) : null;

  // role: the <p> sibling of the name heading, or a <small> label, else first
  // short line after the name in the flat text.
  let role = null;
  if (nameEl && nameEl.parent) {
    const sib = (nameEl.parent.children || []).find(c => c.tag === 'p');
    if (sib) role = textOf(sib).trim().slice(0, 120) || null;
  }
  if (!role) {
    const sm = q('small');
    if (sm) { const t = textOf(sm).trim(); if (t && t.length < 120) role = t.slice(0, 120); }
  }
  if (!role) {
    const lines = txt.split(/\s{2,}|\n/).map(s => s.trim()).filter(Boolean);
    role = (lines.find(l => l !== name && l.length > 2 && l.length < 90 && !/^\$/.test(l)) || null);
  }

  // price: structured .price block, else regex on full text
  let price = null;
  const priceEl = q('.price');
  if (priceEl) {
    price = textOf(priceEl).replace(/\s+/g, ' ').trim() || null;
  } else {
    const pm = txt.match(/(?:from\s*)?\$\s?\d[\d,]*\s*\/\s*month/i) || txt.match(/\$\s?\d[\d,]+/);
    price = pm ? pm[0].replace(/\s+/g, ' ').trim() : null;
  }

  const expEl = q('[class*="experience"]');
  const experience = expEl ? textOf(expEl).trim() : null;

  // location: dedicated location block, else "City, Country" pattern
  let location = null;
  const locEl = q('[class*="location"]');
  if (locEl) location = textOf(locEl).trim().slice(0, 60) || null;
  else {
    const lm = txt.match(/([A-Z][a-zA-Z .'-]{2,20},\s+[A-Z][a-zA-Z .'-]{2,30})/);
    if (lm) location = lm[1].trim();
  }

  // skills: short label spans inside a skills container
  const skills = [];
  const skEl = q('[class*="skill"]');
  if (skEl) {
    for (const s of queryAll(skEl, 'span')) {
      const t = textOf(s).trim();
      if (t && t.length <= 40) skills.push(t);
    }
  }

  const detail = queryAll(e, 'a[href]').find(a => /^\/[^/]+\/[^/]+/.test(a.attrs.href || ''));
  return {
    name: name || null,
    role: role || null,
    price,
    experience,
    location,
    skills: skills.slice(0, 6),
    detail_link: detail ? detail.attrs.href : null,
  };
}

async function a06DynamicContent(jobId) {
  return P.runAnalyzeBuild(jobId, 'A06-dynamic-content-analysis',
    'Detect dynamic/repeating content regions; classify behavior; record advertised vs captured counts (count consistency).',
    async () => {
      const pages = loadPages(jobId);
      const reports = [];
      for (const pg of pages) {
        const pageText = textOf(pg.tree).replace(/\s+/g, ' ');
        const advertised = findAdvertisedCounts(pageText);

        // find repeating sibling groups (>=3 siblings sharing a class)
        const groups = new Map();
        for (const el of allElements(pg.tree)) {
          const cls = el.attrs.class || '';
          const key = el.parent && el.parent.tag ? el.parent.tag + '.' + cls.split(/\s+/)[0] : null;
          if (!key || !cls) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(el);
        }
        // Collect candidate groups first so nesting can be checked across groups.
        const candidates = [];
        for (const [key, els] of groups) {
          if (els.length < 3) continue;
          // Prioritize genuine collection cards: items carrying internal
          // detail links. Icon-button groups (e.g. button.lucide) have none.
          const detailLinks = els.filter(e =>
            queryAll(e, 'a[href]').some(a => /^\/[^/]+\/[^/]+/.test(a.attrs.href || ''))
          ).length;
          const isCardGroup = detailLinks >= Math.max(2, Math.floor(els.length / 2));
          // Card-likeness for non-link groups: item carries an image and is
          // compact (a card), not a whole page section.
          const avgText = els.reduce((s, e) => s + textOf(e).length, 0) / els.length;
          const looksLikeCard = isCardGroup || (els.some(e => queryAll(e, 'img')[0]) && avgText < 400);
          if (!looksLikeCard) continue;
          candidates.push({ key, els, isCardGroup });
        }
        // Flat map: element -> index of the FIRST candidate group containing it.
        const owner = new Map();
        candidates.forEach((c, i) => { for (const e of c.els) if (!owner.has(e)) owner.set(e, i); });
        for (let ci = 0; ci < candidates.length; ci++) {
          const { key, els, isCardGroup } = candidates[ci];
          // Nesting dedupe: skip groups whose items mostly live INSIDE items
          // owned by ANOTHER candidate group (e.g. .profile-body inside
          // .profile-card). Same-group ancestors don't count.
          let inOther = 0;
          for (const e of els) {
            let p = e.parent;
            while (p && p.tag) {
              const o = owner.get(p);
              if (o !== undefined && o !== ci) { inOther++; break; }
              p = p.parent;
            }
          }
          if (inOther >= Math.ceil(els.length / 2)) continue;

          const sample = els.slice(0, 3).map(e => ({
            heading: textOf(e).slice(0, 60),
            image: !!queryAll(e, 'img')[0],
            link: !!queryAll(e, 'a[href]')[0],
            tags: (e.attrs.class || '').split(/\s+/).slice(0, 4),
          }));

          // Factual listing data (user-confirmed policy 2026-08-27): names,
          // roles, prices, locations, short skill labels, detail links.
          // Prose descriptions are NOT captured — they stay placeholders.
          const items = els.map(e => extractFactualItem(e));

          // Match an advertised counter to this collection: counter must
          // appear at or before the collection's first item in page order.
          let adv = null;
          if (advertised.length) {
            const firstPos = pg.html.indexOf(els[0].attrs.class.split(/\s+/)[0]);
            adv = advertised.find(a => firstPos === -1 || a.pos <= firstPos) || null;
          }
          const consistent = adv ? adv.count === els.length : true;
          reports.push({
            page_path: pg.path,
            region_selector: key,
            item_count_captured: els.length,
            item_count_advertised: adv ? adv.count : null,
            advertised_phrase: adv ? adv.phrase : null,
            count_consistent: consistent,
            behavior: 'static',
            pagination_type: 'none',
            confidence: isCardGroup ? 0.85 : 0.6,
            notes: consistent
              ? 'static HTML capture; dynamic loading not observable without browser rendering (spec 32)'
              : 'COUNT GAP: source advertises ' + adv.count + ' (' + adv.phrase + ') but static DOM contains ' + els.length + '; remainder likely loaded client-side (spec 32)',
            sample_items: sample,
            items,
          });
        }
      }
      return { collections: reports };
    },
    (r) => {
      const v = contracts.validate('dynamic-content-report', r);
      return { passed: v.passed, checks_run: 1, failures: v.errors };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'dynamic-content.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A07-page-wireframes
// ---------------------------------------------------------------------------

async function a07Wireframes(jobId) {
  return P.runAnalyzeBuild(jobId, 'A07-page-wireframes',
    'Produce structural wireframes per route: sections, component slots, data bindings, responsive notes.',
    async () => {
      const inv = P.readArtifact(jobId, 'route-inventory.json');
      const pages = loadPages(jobId);
      const wireframes = [];
      for (const route of (inv ? inv.routes : [])) {
        const pg = pages.find(p => p.path === route.path);
        if (!pg) continue;
        const sections = [];
        const main = querySelector(pg.tree, 'main') || pg.tree;
        for (const child of (main.children || [])) {
          if (!child.tag) continue;
          const heading = querySelector(child, 'h1, h2, h3');
          sections.push({
            id: (child.attrs.id || child.tag + '-' + sections.length),
            class: (child.attrs.class || '').split(/\s+/)[0] || null,
            role: landmarkRole(child),
            heading: heading ? textOf(heading).slice(0, 80) : null,
            components: summarizeComponents(child),
            data_bindings: dataBindings(child),
          });
        }
        wireframes.push({
          route: route.path,
          page_type: route.type,
          sections,
          responsive_notes: 'static analysis only; breakpoints not observable without rendering (spec 32)',
          confidence: 0.7,
        });
      }
      return { wireframes };
    },
    (r) => {
      const fails = [];
      for (const wf of r.wireframes) {
        const v = contracts.validate('wireframe', wf);
        fails.push(...v.errors);
      }
      if (!r.wireframes.length) fails.push('no wireframes produced');
      return { passed: fails.length === 0, checks_run: r.wireframes.length + 1, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'wireframes.json', res.result); return res; });
}

function landmarkRole(el) {
  const t = el.tag;
  if (t === 'nav') return 'navigation';
  if (t === 'header') return 'header';
  if (t === 'footer') return 'footer';
  if (t === 'form') return 'form';
  if (/hero|banner|cta/i.test(el.attrs.class || '')) return 'hero';
  if (/card|grid|list|profile|tile/i.test(el.attrs.class || '')) return 'collection';
  return 'section';
}

function summarizeComponents(el) {
  const out = [];
  const seen = new Set();
  for (const c of queryAll(el, 'img, form, button, input, select, textarea, video, iframe')) {
    const k = c.tag + (c.attrs.src ? ':img' : '');
    if (!seen.has(k)) { seen.add(k); out.push(c.tag); }
  }
  return [...new Set(out)];
}

function dataBindings(el) {
  const b = [];
  if (queryAll(el, 'img').length) b.push('images');
  if (queryAll(el, 'a[href]').length) b.push('links');
  if (queryAll(el, 'form').length) b.push('form_fields');
  if (queryAll(el, '[class*="card"], [class*="item"]').length >= 3) b.push('repeating_items');
  return b;
}

// ---------------------------------------------------------------------------
// A08-content-schemas
// ---------------------------------------------------------------------------

async function a08ContentSchemas(jobId) {
  return P.runAnalyzeBuild(jobId, 'A08-content-schemas',
    'Derive field-level content schemas from observed instances (name/type/required/observed examples).',
    async () => {
      const dyn = P.readArtifact(jobId, 'dynamic-content.json');
      const entities = [];
      if (dyn && dyn.collections) {
        for (const rep of dyn.collections) {
          const fields = [
            { name: 'heading', type: 'string', required: true, observed_examples: rep.sample_items.map(s => s.heading).filter(Boolean).slice(0, 3) },
            { name: 'image', type: 'image_url', required: false, observed_examples: rep.sample_items.filter(s => s.image).slice(0, 1).map(() => '<image>') },
            { name: 'link', type: 'url', required: false, observed_examples: rep.sample_items.filter(s => s.link).slice(0, 1).map(() => '<url>') },
          ];
          entities.push({
            entity_name: rep.region_selector.replace(/\./g, '-'),
            instance_count: rep.item_count_captured,
            fields,
            confidence: rep.confidence,
          });
        }
      }
      // global site copy schema
      entities.push({
        entity_name: 'site-copy',
        instance_count: 1,
        fields: [
          { name: 'site_name', type: 'string', required: true, observed_examples: [] },
          { name: 'tagline', type: 'string', required: false, observed_examples: [] },
          { name: 'nav_items', type: 'string[]', required: true, observed_examples: [] },
          { name: 'footer_copy', type: 'string', required: false, observed_examples: [] },
        ],
        confidence: 0.9,
      });
      return { entities };
    },
    (r) => {
      const v = contracts.validate('content-schema', r);
      return { passed: v.passed && r.entities.length > 0, checks_run: 1, failures: v.errors };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'content-schemas.json', res.result); return res; });
}

module.exports = { loadPages, a05RouteInventory, a06DynamicContent, a07Wireframes, a08ContentSchemas };

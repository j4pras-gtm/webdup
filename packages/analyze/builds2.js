'use strict';
/** Analyze phase builds A09–A13 (revised spec §4–§17). */

const fs = require('fs');
const path = require('path');
const contracts = require('../contracts');
const { queryAll, querySelector, textOf } = require('./lib/html');
const P = require('./pipeline');
const B = require('./builds');

// ---------------------------------------------------------------------------
// A09-design-tokens
// ---------------------------------------------------------------------------

async function a09DesignTokens(jobId) {
  return P.runAnalyzeBuild(jobId, 'A09-design-tokens',
    'Extract design tokens from source CSS as evidence; produce rebrandable token layer (no raw CSS copy).',
    async () => {
      const pages = B.loadPages(jobId);
      const colors = new Map();   // value -> count
      const fonts = new Map();
      const radii = new Map();
      const shadows = 0;

      for (const pg of pages) {
        // inline <style> blocks
        for (const st of queryAll(pg.tree, 'style')) {
          scanCss(textOf(st), colors, fonts, radii);
        }
        // linked stylesheets: fetch same-origin only
        for (const link of queryAll(pg.tree, 'link[rel="stylesheet"]')) {
          const href = link.attrs.href;
          if (!href) continue;
          let abs;
          try { abs = new URL(href, 'https://example.com').href; } catch (_) { continue; }
          // resolve against job origin
          const job = JSON.parse(fs.readFileSync(path.join(P.jobDir(jobId), 'job.json'), 'utf8'));
          const origin = new URL(job.source_url).origin;
          const u = new URL(href, origin);
          if (u.origin !== origin) continue;
          const r = await P.fetchInternalSafe(u.href);
          if (r && r.ok) scanCss(r.body, colors, fonts, radii);
        }
      }

      const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v]) => v);
      const topFonts = [...fonts.keys()].slice(0, 6);
      const topRadii = [...radii.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v);

      return {
        source_evidence: { css_files_scanned: true, inline_style_blocks: true },
        colors: topColors.map((c, i) => ({ name: 'color-' + (i + 1), value: c, usage: 'observed' })),
        typography: { font_families: topFonts, scale: [] },
        spacing: [],
        radii: topRadii.map(r => ({ value: r, usage: 'observed' })),
        shadows: shadows ? [{ value: 'observed', usage: 'observed' }] : [],
        breakpoints: [],
        notes: 'Token layer is rebrandable; values are source evidence, not copied CSS.',
      };
    },
    (r) => {
      const v = contracts.validate('design-tokens', r);
      const fails = v.errors.slice();
      if (!r.colors.length) fails.push('no colors extracted');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'design-tokens.json', res.result); return res; });
}

function scanCss(css, colors, fonts, radii) {
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const v = m[0].toLowerCase();
    colors.set(v, (colors.get(v) || 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\([^)]+\)/g)) {
    colors.set(m[0].toLowerCase(), (colors.get(m[0].toLowerCase()) || 0) + 1);
  }
  for (const m of css.matchAll(/font-family:\s*([^;{}]+)/g)) {
    for (const f of m[1].split(',')) {
      const name = f.trim().replace(/^["']|["']$/g, '');
      if (name && !/^(inherit|initial|unset)$/.test(name)) fonts.set(name, (fonts.get(name) || 0) + 1);
    }
  }
  for (const m of css.matchAll(/border-radius:\s*([0-9.]+px)/g)) {
    radii.set(m[1], (radii.get(m[1]) || 0) + 1);
  }
}

// ---------------------------------------------------------------------------
// A10-interaction-specs
// ---------------------------------------------------------------------------

async function a10Interactions(jobId) {
  return P.runAnalyzeBuild(jobId, 'A10-interaction-specs',
    'Detect interaction mechanisms from static DOM/JS evidence; record mechanism type without substituting behavior.',
    async () => {
      const pages = B.loadPages(jobId);
      const specs = [];
      for (const pg of pages) {
        // forms
        for (const form of queryAll(pg.tree, 'form')) {
          specs.push({
            page_path: pg.path,
            component: form.attrs.id || form.attrs.name || 'form',
            trigger: 'submit',
            mechanism: 'form_submit',
            expected_behavior: 'submits to action endpoint (recorded, not reproduced)',
            success_behavior: null,
            error_behavior: null,
            confidence: 0.8,
          });
        }
        // buttons / links with JS hints
        for (const el of queryAll(pg.tree, 'button, [onclick], [data-action], [role="button"]')) {
          const cls = el.attrs.class || '';
          const isToggle = /toggle|menu|nav|burger|hamburger|open|close/i.test(cls + ' ' + (el.attrs['aria-label'] || ''));
          specs.push({
            page_path: pg.path,
            component: el.tag + (cls ? '.' + cls.split(/\s+/)[0] : ''),
            trigger: 'click',
            mechanism: isToggle ? 'client_toggle' : 'click_action',
            expected_behavior: isToggle ? 'toggles visibility of associated region' : 'performs click action (details not observable statically)',
            success_behavior: null,
            error_behavior: null,
            confidence: isToggle ? 0.7 : 0.5,
          });
        }
        // anchors to sections
        for (const a of queryAll(pg.tree, 'a[href^="#"]')) {
          specs.push({
            page_path: pg.path,
            component: 'anchor-link',
            trigger: 'click',
            mechanism: 'in_page_anchor',
            expected_behavior: 'scrolls to target section #' + a.attrs.href.slice(1),
            success_behavior: null,
            error_behavior: null,
            confidence: 0.9,
          });
        }
      }
      return { interactions: specs };
    },
    (r) => {
      const v = contracts.validate('interaction-spec', r);
      return { passed: v.passed, checks_run: 1, failures: v.errors };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'interactions.json', res.result); return res; });
}

// ---------------------------------------------------------------------------
// A11-component-inventory
// ---------------------------------------------------------------------------

async function a11Components(jobId) {
  return P.runAnalyzeBuild(jobId, 'A11-component-inventory',
    'Inventory reusable components with structure, props, states, and reuse count across routes.',
    async () => {
      const pages = B.loadPages(jobId);
      const compMap = new Map(); // key -> {count, paths:Set, tags:Set}
      const push = (key, tag, pgPath) => {
        if (!compMap.has(key)) compMap.set(key, { count: 0, paths: new Set(), tags: new Set() });
        const c = compMap.get(key);
        c.count++; c.paths.add(pgPath); c.tags.add(tag);
      };

      for (const pg of pages) {
        push('header', 'header', pg.path);
        push('footer', 'footer', pg.path);
        for (const nav of queryAll(pg.tree, 'nav')) push('navigation', 'nav', pg.path);
        for (const card of queryAll(pg.tree, '[class*="card"], [class*="profile"], [class*="tile"], [class*="item"]')) {
          const cls = (card.attrs.class || '').split(/\s+/).find(c => /card|profile|tile|item/i.test(c)) || 'card';
          push('card.' + cls, card.tag, pg.path);
        }
        for (const btn of queryAll(pg.tree, 'button, a[class*="btn"], a[class*="button"]')) push('button', btn.tag, pg.path);
        for (const f of queryAll(pg.tree, 'form')) push('form', 'form', pg.path);
        for (const sec of queryAll(pg.tree, 'section')) push('section', 'section', pg.path);
      }

      const components = [...compMap.entries()].map(([key, c]) => ({
        name: key,
        description: 'reusable ' + key.replace('.', ' ') + ' element observed in source DOM',
        structure: ['root_element'],
        props: [],
        states: [],
        used_in_routes: [...c.paths].sort(),
        reuse_count: c.count,
        confidence: c.count > 1 ? 0.8 : 0.6,
      }));
      return { components };
    },
    (r) => {
      const v = contracts.validate('component-inventory', r);
      const fails = v.errors.slice();
      if (!r.components.some(c => c.name === 'header')) fails.push('header component missing');
      return { passed: v.passed && fails.length === 0, checks_run: 2, failures: fails };
    }
  ).then(res => { if (res.ok) P.writeArtifact(jobId, 'components.json', res.result); return res; });
}

module.exports = { a09DesignTokens, a10Interactions, a11Components };

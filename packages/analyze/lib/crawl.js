'use strict';
/**
 * Crawl + discovery for the Analyze phase (spec §6, §7, §8).
 * Works on already-fetched page records so it is testable offline.
 */
const { isExternal } = require('./http');

/** Normalize an internal path to a canonical route key (strip query/hash, trailing slash). */
function canonPath(href, origin) {
  try {
    const u = new URL(href, origin);
    if (u.origin !== origin) return null;
    let p = u.pathname;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    if (!p.startsWith('/')) p = '/' + p;
    return p;
  } catch (_) { return null; }
}

/** Parse sitemap.xml into a list of loc URLs. */
function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) out.push(m[1]);
  return out;
}

/** Parse robots.txt: allowed/disallowed path prefixes + Sitemap: lines. */
function parseRobots(txt) {
  const disallowed = [];
  const sitemaps = [];
  let appliesToAll = true;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      const sm = line.match(/^Sitemap:\s*(\S+)/i);
      if (sm) sitemaps.push(sm[1]);
      continue;
    }
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (!kv) continue;
    const k = kv[1].toLowerCase();
    const v = kv[2].trim();
    if (k === 'user-agent' && v !== '*') appliesToAll = false;
    if (k === 'disallow' && v) disallowed.push(v);
    if (k === 'sitemap') sitemaps.push(v);
  }
  return { disallowed, sitemaps, appliesToAll };
}

/** Is a path excluded by robots disallow prefixes? */
function robotsExcluded(path, disallowed) {
  return disallowed.some(d => {
    if (d.endsWith('*')) return path.startsWith(d.slice(0, -1));
    return path.startsWith(d);
  });
}

/**
 * Build the link graph from a set of fetched pages.
 * @param {object[]} pages [{ url, origin, html }]
 * @returns {{edges:Array, externalEndpoints:Array}}
 */
function buildLinkGraph(pages) {
  const edges = [];
  const externalEndpoints = [];
  const seenExt = new Set();

  for (const page of pages) {
    // We need the parsed tree; caller passes page.tree.
    const tree = page.tree;
    if (!tree) continue;
    const { queryAll } = require('./html');
    for (const a of queryAll(tree, 'a[href]')) {
      const href = a.attrs.href || '';
      if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
      let abs;
      try { abs = new URL(href, page.url).href; } catch (_) { continue; }

      if (isExternal(abs, page.origin)) {
        const key = abs;
        if (!seenExt.has(key)) {
          seenExt.add(key);
          externalEndpoints.push({
            source_page: page.path,
            anchor_text: (a.attrs['aria-label'] || text(a)).slice(0, 80),
            original_url: abs,
            final_url: abs,
            redirect_chain: [],
            endpoint_type: require('./http').classifyExternal(abs),
            treatment: 'record_only',
          });
        }
        edges.push({ from: page.path, to: abs, kind: 'external', source_component: componentOf(a), js_attached: false, confidence: 0.9 });
        continue;
      }

      const cp = canonPath(abs, page.origin);
      if (!cp) continue;
      const kind = classifyInternalKind(cp, page.path, a);
      edges.push({ from: page.path, to: cp, kind, source_component: componentOf(a), js_attached: false, confidence: 0.9 });
    }
  }
  return { edges, externalEndpoints };
}

function text(node) {
  const { textOf } = require('./html');
  return textOf(node);
}

function componentOf(el) {
  // walk up to a recognizable repeating component or landmark
  let p = el.parent;
  while (p && p.tag) {
    const cls = (p.attrs.class || '');
    if (/card|profile|tile|item|post|product|step|benefit/i.test(cls)) return cls.split(/\s+/)[0];
    if (/^nav$|^header$|^footer$|^main$|^section$/.test(p.tag)) return p.tag;
    p = p.parent;
  }
  return 'unknown';
}

function classifyInternalKind(cp, fromPath, el) {
  // detail routes: deep paths with an id/slug segment under a collection parent
  const segs = cp.split('/').filter(Boolean);
  if (segs.length >= 2 && /-\d+$|[a-z0-9]{6,}/.test(segs[segs.length - 1])) return 'internal-detail';
  if (cp === fromPath) return 'internal-section';
  return 'internal-route';
}

module.exports = { canonPath, parseSitemap, parseRobots, robotsExcluded, buildLinkGraph, classifyInternalKind };

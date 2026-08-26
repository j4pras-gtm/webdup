'use strict';
/**
 * Zero-dependency mini HTML parser for the Analyze phase.
 * Produces a plain node tree: { tag, attrs:{}, children:[], parent }
 * Text nodes are { text }. Void elements handled. <script>/<style> contents
 * are kept as a single raw text child (not parsed) so they can be skipped.
 */

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const RAWTEXT = new Set(['script','style','textarea','title']);

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  let i = 0;
  const n = html.length;

  while (i < n) {
    if (html[i] === '<') {
      // comment
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? n : end + 3;
        continue;
      }
      // doctype / declaration
      if (html[i + 1] === '!') {
        const end = html.indexOf('>', i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      // closing tag
      if (html[i + 1] === '/') {
        const end = html.indexOf('>', i);
        const name = html.slice(i + 2, end).trim().toLowerCase();
        for (let s = stack.length - 1; s > 0; s--) {
          if (stack[s].tag === name) { stack.length = s; break; }
        }
        i = end === -1 ? n : end + 1;
        continue;
      }
      // opening tag
      const end = findTagEnd(html, i);
      const tagSrc = html.slice(i + 1, end);
      const m = tagSrc.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
      if (!m) { i = end + 1; continue; }
      const tag = m[1].toLowerCase();
      const attrs = {};
      const am = tagSrc.slice(m[1].length).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g);
      for (const a of am) {
        const key = a[1].toLowerCase();
        attrs[key] = a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[2] !== undefined ? a[2] : '';
      }
      const node = { tag, attrs, children: [], parent: stack[stack.length - 1] };
      node.parent.children.push(node);
      if (RAWTEXT.has(tag)) {
        const closeIdx = html.indexOf('</' + tag, end);
        const raw = closeIdx === -1 ? '' : html.slice(end + 1, closeIdx);
        node.children.push({ text: decodeEntities(raw) });
        i = closeIdx === -1 ? n : html.indexOf('>', closeIdx) + 1;
        continue;
      }
      i = end + 1;
      if (!VOID.has(tag)) stack.push(node);
    } else {
      const nextLt = html.indexOf('<', i);
      const chunk = nextLt === -1 ? html.slice(i) : html.slice(i, nextLt);
      const txt = decodeEntities(chunk);
      if (txt.trim()) stack[stack.length - 1].children.push({ text: txt });
      i = nextLt === -1 ? n : nextLt;
    }
  }
  return root;
}

function findTagEnd(html, start) {
  let inQ = null;
  for (let j = start + 1; j < html.length; j++) {
    const c = html[j];
    if (inQ) { if (c === inQ) inQ = null; continue; }
    if (c === '"' || c === "'") { inQ = c; continue; }
    if (c === '>') return j;
  }
  return html.length - 1;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&copy;/g, '\u00a9').replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018').replace(/&ldquo;/g, '\u201c').replace(/&rdquo;/g, '\u201d')
    .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013').replace(/&hellip;/g, '\u2026')
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Traversal / querying
// ---------------------------------------------------------------------------

function walk(node, fn) {
  for (const c of node.children || []) {
    if (typeof c === 'object' && c.tag) { fn(c); walk(c, fn); }
  }
}

function allElements(root) {
  const out = [];
  walk(root, el => out.push(el));
  return out;
}

/** Simple selector: "tag", ".class", "#id", "tag.class#id", "[attr]", "[attr^=v]", plus descendant combinator ("a b.c") and top-level comma OR ("h1, h2"). */
function matchesSimple(el, sel) {
  const alts = splitTopLevelCommas(sel);
  return alts.some(a => matchChain(el, a.trim()));
}

function splitTopLevelCommas(sel) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Split on whitespace outside quotes/brackets (so [class*="a b"] stays one part). */
function splitCombinator(sel) {
  const out = [];
  let cur = '', q = null, depth = 0;
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function matchChain(el, sel) {
  const parts = splitCombinator(sel);
  // match right-to-left for descendant combinator
  function matchAt(el, idx) {
    if (!el || !el.tag) return false;
    const ok = matchOne(el, parts[idx]);
    if (!ok) return false;
    if (idx === 0) return true;
    let p = el.parent;
    while (p) { if (p.tag && matchAt(p, idx - 1)) return true; p = p.parent; }
    return false;
  }
  return matchAt(el, parts.length - 1);
}

function matchOne(el, sel) {
  // grammar: [tag|*|''] ( .class | #id | [attr(=value)?] | [attr^=value] )*
  const m = sel.match(/^([a-zA-Z][a-zA-Z0-9-]*|\*|)((?:\.[\w-]+|\#[\w-]+|\[[^\]]+\])*)$/);
  if (!m || (m[1] === '' && !m[2])) return false;
  if (m[1] && m[1] !== '*' && el.tag !== m[1]) return false;
  const rest = m[2] || '';
  const cls = rest.match(/\.[\w-]+/g) || [];
  const ids = rest.match(/\#[\w-]+/g) || [];
  const attrs = rest.match(/\[[^\]]+\]/g) || [];
  const elClasses = (el.attrs.class || '').split(/\s+/);
  for (const c of cls) if (!elClasses.includes(c.slice(1))) return false;
  for (const id of ids) if (el.attrs.id !== id.slice(1)) return false;
  for (const a of attrs) {
    const am = a.slice(1, -1).match(/^([\w:-]+)(?:([~^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\s"']+))?)?$/);
    if (!am) return false;
    const name = am[1];
    if (!(name in el.attrs)) return false;
    if (am[2] !== undefined) {
      const val = el.attrs[name];
      const op = am[2].slice(0, -1); // strip trailing '=' -> '', '^', '$', '*', '~'
      const want = am[3] !== undefined ? am[3] : am[4] !== undefined ? am[4] : am[5] || '';
      if (op === '^' ? !val.startsWith(want) : op === '$' ? !val.endsWith(want) : op === '*' ? !val.includes(want) : op === '~' ? !val.split(/\s+/).includes(want) : val !== want) return false;
    }
  }
  return true;
}

function queryAll(root, selector) {
  const out = [];
  walk(root, el => { if (matchesSimple(el, selector)) out.push(el); });
  return out;
}

function querySelector(root, selector) {
  return queryAll(root, selector)[0] || null;
}

function textOf(node) {
  let out = '';
  for (const c of node.children || []) {
    if (typeof c === 'string' || (c && c.text !== undefined)) out += c.text || '';
    else out += textOf(c);
  }
  return out.replace(/\s+/g, ' ').trim();
}

module.exports = { parse, walk, allElements, queryAll, querySelector, textOf, matchesSimple };

'use strict';
/**
 * HTTP layer for the Analyze phase (Node 18+ global fetch, zero deps).
 * - Internal URLs: follow redirect chains, record each hop (spec §8).
 * - External URLs: NEVER fetched — recorded only (spec §8/§21, invariant 6).
 */

const UA = 'SidekikzBuilder/0.4 (+analyze; contact: j4pras@gmail.com)';

function isExternal(url, origin) {
  try {
    const u = new URL(url);
    return u.origin !== origin;
  } catch (_) { return true; }
}

function classifyExternal(url) {
  const u = url.toLowerCase();
  if (u.startsWith('mailto:')) return 'mailto';
  if (u.startsWith('tel:')) return 'tel';
  if (u.includes('wa.me') || u.includes('whatsapp')) return 'whatsapp';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('calendly.com')) return 'calendly';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'social';
  if (u.includes('facebook.com')) return 'social';
  if (u.includes('instagram.com')) return 'social';
  if (u.includes('youtube.com')) return 'social';
  return 'other';
}

/**
 * Fetch an internal URL, following redirects and recording the chain.
 * @returns {Promise<{ok:boolean, status:number, finalUrl:string, chain:string[], body?:string, contentType?:string}>}
 */
async function fetchInternal(startUrl, { maxHops = 5, timeoutMs = 20000 } = {}) {
  const chain = [];
  let url = startUrl;
  let res = null;
  for (let hop = 0; hop <= maxHops; hop++) {
    chain.push(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
    const status = res.status;
    if (status >= 300 && status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      url = new URL(loc, url).href;
      continue;
    }
    break;
  }
  const body = res && res.status < 400 ? await res.text() : '';
  return {
    ok: !!res && res.status < 400,
    status: res ? res.status : 0,
    finalUrl: chain[chain.length - 1],
    chain,
    body,
    contentType: res ? res.headers.get('content-type') || '' : '',
  };
}

/**
 * Record an external endpoint WITHOUT fetching it (spec §8).
 * @returns {{source_url:string, final_url:string, endpoint_type:string, treatment:'record_only'}}
 */
function recordExternal(url) {
  return { source_url: url, final_url: url, endpoint_type: classifyExternal(url), treatment: 'record_only' };
}

module.exports = { fetchInternal, recordExternal, isExternal, classifyExternal, UA };

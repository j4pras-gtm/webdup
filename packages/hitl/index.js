'use strict';
/**
 * HITL Review Gate (revised spec §18) — between Analyze (A13) and Extract (E01).
 *
 * - generateReviewReport(jobId): renders a human-readable REVIEW.md from the
 *   analysis package (site structure, reusable assets, personalization).
 * - recordConfirmation(jobId, decision): writes the analysis-confirmation
 *   record. Decisions: 'confirmed' | 'narrowed' | 'skipped_draft'.
 *   Narrowing may only REMOVE scope — it can never add routes/components
 *   that are absent from the analysis (spec §18: no silent expansion).
 * - requireConfirmed(jobId): gate check used by every Extract build; throws
 *   if no valid confirmation exists.
 */

const fs = require('fs');
const path = require('path');
const contracts = require('../contracts');
const P = require('../analyze/pipeline');

const ROOT = P.ROOT;
const VALID_DECISIONS = ['confirmed', 'narrowed', 'skipped_draft'];

function confirmationFile(jobId) { return path.join(P.jobDir(jobId), 'analysis', 'analysis-confirmation.json'); }
function reportFile(jobId) { return path.join(P.jobDir(jobId), 'analysis', 'REVIEW.md'); }

// ---------------------------------------------------------------------------
// Review report
// ---------------------------------------------------------------------------

function generateReviewReport(jobId) {
  const ap = P.readArtifact(jobId, 'analysis-package.json');
  if (!ap) throw new Error('no analysis package — run A13 first');
  const read = (f) => P.readArtifact(jobId, f);
  const sitemap = read('sitemap.json') || {};
  const routes = read('route-inventory.json') || { routes: [] };
  const comps = read('components.json') || { components: [] };
  const dyn = read('dynamic-content.json') || { collections: [] };
  const ext = read('integration-manifest.json') || { endpoints: [] };
  const ph = read('placeholder-map.json') || { groups: {} };
  const tokens = read('design-tokens.json') || {};

  const L = [];
  L.push('# Analysis Review — ' + jobId);
  L.push('');
  L.push('Source: **' + ap.source_url + '**');
  L.push('');
  L.push('> Review this before extraction begins. You can confirm, narrow scope, remove components/pages, or skip and accept the draft.');
  L.push('');

  L.push('## Site structure');
  L.push('');
  L.push('### Routes (' + routes.routes.length + ')');
  L.push('');
  L.push('| Path | Type | Purpose |');
  L.push('|---|---|---|');
  for (const r of routes.routes) L.push('| `' + r.path + '` | ' + r.type + ' | ' + (r.purpose || '').replace(/\|/g, '\\|').slice(0, 60) + ' |');
  if ((sitemap.excluded || []).length) {
    L.push('');
    L.push('Excluded: ' + sitemap.excluded.map(e => '`' + e.path + '` (' + e.reason + ')').join(', '));
  }
  if ((sitemap.restricted || []).length) {
    L.push('Restricted (not crawled): ' + sitemap.restricted.map(e => '`' + e.path + '`').join(', '));
  }

  L.push('');
  L.push('## Reusable assets');
  L.push('');
  L.push('| Component | Reuse count | Routes | Confidence |');
  L.push('|---|---|---|---|');
  for (const c of comps.components.slice(0, 25)) {
    L.push('| `' + c.name + '` | ' + c.reuse_count + ' | ' + c.used_in_routes.length + ' | ' + c.confidence + ' |');
  }
  L.push('');
  L.push('Design tokens: ' + (tokens.colors ? tokens.colors.length : 0) + ' colors, ' + (tokens.typography && tokens.typography.font_families ? tokens.typography.font_families.length : 0) + ' font families.');

  L.push('');
  L.push('## Personalization — what you need to supply');
  L.push('');
  for (const [group, keys] of Object.entries(ph.groups)) {
    L.push('- **' + group + '**: ' + (keys.length ? keys.slice(0, 8).map(k => '`' + k + '`').join(', ') + (keys.length > 8 ? ' …+' + (keys.length - 8) : '') : '(none detected)'));
  }
  L.push('');
  L.push('Detected integrations (record-only, never scraped): ');
  if (ext.endpoints.length) {
    for (const e of ext.endpoints) L.push('- ' + e.endpoint_type + ': ' + e.original_url + ' (from ' + e.source_page + ')');
  } else L.push('- none detected');
  L.push('');
  L.push('Content collections: ' + dyn.collections.map(c => c.region_selector + ' (' + c.item_count_captured + ' items, ' + c.behavior + ')').join('; ') || 'none');

  if (ap.uncertainties && ap.uncertainties.length) {
    L.push('');
    L.push('## Uncertainties / gaps');
    L.push('');
    for (const u of ap.uncertainties) L.push('- [' + u.severity + '] ' + u.area + ': ' + u.description);
  }

  L.push('');
  L.push('---');
  L.push('**Decision:** confirm / narrow (remove pages or components) / skip-and-accept-draft');
  const md = L.join('\n') + '\n';
  fs.writeFileSync(reportFile(jobId), md, 'utf8');
  return 'analysis/REVIEW.md';
}

// ---------------------------------------------------------------------------
// Confirmation record
// ---------------------------------------------------------------------------

/**
 * Record the user's decision at the HITL gate.
 * @param {string} jobId
 * @param {object} decision
 *   { decision: 'confirmed'|'narrowed'|'skipped_draft',
 *     removed_pages?: string[], removed_components?: string[],
 *     user_supplied_data?: object, note?: string }
 */
function recordConfirmation(jobId, decision) {
  const ap = P.readArtifact(jobId, 'analysis-package.json');
  if (!ap) throw new Error('no analysis package to confirm');
  if (!VALID_DECISIONS.includes(decision.decision)) {
    throw new Error('invalid decision: ' + decision.decision + ' (valid: ' + VALID_DECISIONS.join(', ') + ')');
  }
  const routes = P.readArtifact(jobId, 'route-inventory.json') || { routes: [] };
  const comps = P.readArtifact(jobId, 'components.json') || { components: [] };

  // Narrowing may only REMOVE — verify every removal actually exists in the analysis.
  const knownRoutes = new Set(routes.routes.map(r => r.path));
  const knownComps = new Set(comps.components.map(c => c.name));
  for (const p of decision.removed_pages || []) {
    if (!knownRoutes.has(p)) throw new Error('cannot remove page not in analysis: ' + p);
  }
  for (const c of decision.removed_components || []) {
    if (!knownComps.has(c)) throw new Error('cannot remove component not in analysis: ' + c);
  }

  const confirmedScope = {
    routes: routes.routes.filter(r => !(decision.removed_pages || []).includes(r.path)).map(r => r.path),
    components: comps.components.filter(c => !(decision.removed_components || []).includes(c.name)).map(c => c.name),
    dynamic_collections: (P.readArtifact(jobId, 'dynamic-content.json') || { collections: [] }).collections.map(c => c.region_selector),
    external_endpoints: (P.readArtifact(jobId, 'integration-manifest.json') || { endpoints: [] }).endpoints.map(e => e.original_url),
  };

  const rec = {
    job_id: jobId,
    decision: decision.decision,
    confirmed_at: new Date().toISOString(),
    confirmed_scope: confirmedScope,
    removed_pages: decision.removed_pages || [],
    removed_components: decision.removed_components || [],
    user_supplied_data: decision.user_supplied_data || {},
    note: decision.note || '',
  };
  const v = contracts.validate('analysis-confirmation', rec);
  if (!v.passed) throw new Error('confirmation failed schema: ' + v.errors.join('; '));
  fs.writeFileSync(confirmationFile(jobId), JSON.stringify(rec, null, 2) + '\n', 'utf8');
  return rec;
}

// ---------------------------------------------------------------------------
// Gate enforcement
// ---------------------------------------------------------------------------

/**
 * Gate used by every Extract/Build micro-build. Throws unless a valid
 * confirmation exists. Returns the confirmation record.
 */
function requireConfirmed(jobId) {
  const f = confirmationFile(jobId);
  if (!fs.existsSync(f)) {
    throw new Error('HITL gate: no analysis-confirmation for ' + jobId + ' — run generateReviewReport + recordConfirmation first');
  }
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = contracts.validate('analysis-confirmation', rec);
  if (!v.passed) throw new Error('HITL gate: confirmation invalid: ' + v.errors.join('; '));
  if (!VALID_DECISIONS.includes(rec.decision)) throw new Error('HITL gate: unknown decision ' + rec.decision);
  return rec;
}

/** The confirmed route list (post-narrowing) — the ONLY routes Extract/Build may touch. */
function confirmedRoutes(jobId) {
  return requireConfirmed(jobId).confirmed_scope.routes;
}

module.exports = { generateReviewReport, recordConfirmation, requireConfirmed, confirmedRoutes, VALID_DECISIONS, ROOT };

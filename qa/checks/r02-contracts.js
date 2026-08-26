'use strict';
/** R02-contracts QA: schemas parse, mocks validate, modifications present. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMAS = path.join(ROOT, 'packages', 'contracts', 'schemas');
const MOCKS = path.join(ROOT, 'packages', 'contracts', 'mocks');

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail: detail || '' }); }

// 1. all schema files parse as JSON
let schemaCount = 0;
for (const f of fs.readdirSync(SCHEMAS)) {
  if (!f.endsWith('.schema.json')) continue;
  schemaCount++;
  try { JSON.parse(fs.readFileSync(path.join(SCHEMAS, f), 'utf8')); check('schema parses: ' + f, true); }
  catch (e) { check('schema parses: ' + f, false, e.message); }
}
check('schema count >= 21', schemaCount >= 21, String(schemaCount));

// 2. required new schemas exist
const REQUIRED = ['sitemap', 'route-inventory', 'link-graph', 'redirect-map', 'dynamic-content-report',
  'wireframe', 'content-schema', 'design-tokens', 'interaction-spec', 'component-inventory',
  'reusable-assets', 'placeholder-map', 'integration-manifest', 'analysis-package', 'analysis-confirmation'];
for (const n of REQUIRED) check('new schema present: ' + n, fs.existsSync(path.join(SCHEMAS, n + '.schema.json')));

// 3. every new mock validates against its schema
const contracts = require(path.join(ROOT, 'packages', 'contracts'));
for (const n of REQUIRED) {
  const mockFile = path.join(MOCKS, n + '.mock.json');
  if (!fs.existsSync(mockFile)) { check('mock present: ' + n, false); continue; }
  const mock = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
  const r = contracts.validate(n, mock);
  check('mock validates: ' + n, r.passed, r.errors.join('; '));
  check('mock flagged: ' + n, mock.mock === true);
}

// 4. modifications present
const bs = JSON.parse(fs.readFileSync(path.join(SCHEMAS, 'build-status.schema.json'), 'utf8'));
check('build-status has phase', !!bs.properties.phase);
check('build-status has upstream_artifacts', !!bs.properties.upstream_artifacts);
const br = JSON.parse(fs.readFileSync(path.join(SCHEMAS, 'brand.schema.json'), 'utf8'));
check('brand has personalization_group', !!br.properties.personalization_group);
const si = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'contracts', 'site_inventory.mock.json'), 'utf8'));
check('site_inventory deprecated flag', si.deprecated === true && Array.isArray(si.superseded_by));

// report
let pass = 0;
for (const c of checks) {
  console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
  if (c.ok) pass++;
}
console.log('\n' + pass + '/' + checks.length + ' checks passed');
process.exit(pass === checks.length ? 0 : 1);

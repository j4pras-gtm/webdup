'use strict';
/**
 * Minimal schema validation for build outputs.
 * Kept dependency-free so the skeleton runs anywhere.
 */

const SCHEMAS = {
  'site-inventory': {
    required: ['pages'],
    rules: {
      pages: (v) => Array.isArray(v) && v.length > 0,
      'pages[].url': (v) => typeof v === 'string' && v.startsWith('http'),
    },
  },
  brand: {
    required: ['name'],
    rules: {
      name: (v) => typeof v === 'string' && v.length > 0,
    },
  },
};

function validate(schemaName, value) {
  const schema = SCHEMAS[schemaName];
  if (!schema) return { valid: false, errors: [`unknown schema '${schemaName}'`] };
  const errors = [];
  for (const key of schema.required || []) {
    if (value[key] === undefined || value[key] === null) errors.push(`missing required: ${key}`);
  }
  for (const [key, check] of Object.entries(schema.properties || {})) {
    if (value[key] !== undefined && !check(value[key])) errors.push(`invalid: ${key}`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validate, readJson, writeJson };

function readJson(file) {
  return JSON.parse(require('fs').readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  const fs = require('fs');
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
</parameter>
</invoke>

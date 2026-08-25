'use strict';

/**
 * Sidekikz Builder — contracts package.
 * Loads JSON schemas from ./schemas and provides a small validator.
 */

const fs = require('fs');
const path = require('path');

const SCHEMAS_DIR = path.join(__dirname, 'schemas');

function loadSchemas() {
  const out = {};
  for (const f of fs.readdirSync(SCHEMAS_DIR)) {
    if (f.endsWith('.schema.json')) {
      const name = f.replace('.schema.json', '');
      out[name] = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, f), 'utf8'));
    }
  }
  return out;
}

const SCHEMAS = loadSchemas();

function validate(name, obj) {
  const schema = SCHEMAS[name];
  if (!schema) return { passed: false, errors: [`unknown schema '${name}'`] };
  const errors = [];
  for (const k of schema.required || []) {
    if (obj[k] === undefined || obj[k] === null) errors.push(`missing required field '${k}'`);
  }
  for (const [k, def] of Object.entries(schema.properties || {})) {
    if (obj[k] === undefined) continue;
    if (def.type === 'array' && !Array.isArray(obj[k])) errors.push(`'${k}' must be array`);
    else if (def.type === 'object' && (typeof obj[k] !== 'object' || obj[k] === null)) errors.push(`'${k}' must be object`);
    else if (def.type === 'integer' && !Number.isInteger(obj[k])) errors.push(`'${k}' must be integer`);
    else if (def.type === 'string' && typeof obj[k] !== 'string') errors.push(`'${k}' must be string`);
    else if (def.type === 'boolean' && typeof obj[k] !== 'boolean') errors.push(`'${k}' must be boolean`);
  }
  return { passed: errors.length === 0, errors };
}

module.exports = {
  SCHEMAS,
  validate,
};

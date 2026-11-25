#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pluginsDir = resolve(__dirname, '../plugins');
const schemaPath = join(pluginsDir, 'schema.json');

function validateValue(value, schema, path, errors) {
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${path}: expected object`);
      return;
    }
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!(reqKey in value)) {
          errors.push(`${path}.${reqKey}: missing required property`);
        }
      }
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (!(k in props)) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}.${k}: unexpected property`);
        }
        continue;
      }
      validateValue(v, props[k], `${path}.${k}`, errors);
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return;
    }
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path}: expected at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, idx) => validateValue(item, schema.items, `${path}[${idx}]`, errors));
    }
    return;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected string`);
      return;
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path}: string longer than ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: value "${value}" does not match pattern ${schema.pattern}`);
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push(`${path}: value "${value}" not in [${schema.enum.join(', ')}]`);
    }
    return;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${path}: expected number`);
      return;
    }
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: value ${value} below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: value ${value} above maximum ${schema.maximum}`);
    }
    return;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${path}: expected boolean`);
    }
  }
}

export function validateAllPlugins() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const files = readdirSync(pluginsDir)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .sort();

  const seenIds = new Set();
  const results = [];

  for (const file of files) {
    const filePath = join(pluginsDir, file);
    const errors = [];
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      errors.push(`JSON parse error: ${err.message}`);
    }

    if (manifest) {
      validateValue(manifest, schema, file, errors);
      if (manifest.id) {
        if (seenIds.has(manifest.id)) {
          errors.push(`${file}: duplicate plugin id "${manifest.id}"`);
        }
        seenIds.add(manifest.id);
      }
      if (Array.isArray(manifest.presets)) {
        const presetIds = new Set();
        for (const preset of manifest.presets) {
          if (presetIds.has(preset.id)) {
            errors.push(`${file}: duplicate preset id "${preset.id}"`);
          }
          presetIds.add(preset.id);
        }
      }
    }

    results.push({ file, ok: errors.length === 0, errors });
  }

  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = validateAllPlugins();
  const passed = results.filter((r) => r.ok).length;

  for (const res of results) {
    if (res.ok) {
      console.log(`PASS  plugins/${res.file}`);
    } else {
      console.error(`FAIL  plugins/${res.file}`);
      for (const err of res.errors) {
        console.error(`      - ${err}`);
      }
    }
  }

  console.log(`\nPlugin validation summary: ${passed}/${results.length} PASS`);
  if (passed !== results.length || results.length === 0) {
    process.exit(1);
  }
}

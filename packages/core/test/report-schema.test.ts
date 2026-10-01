import { readdirSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';
import { describe, expect, it } from 'vitest';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsPlugin.default;

const docs = new URL('../../../docs/', import.meta.url);
const examplesDir = new URL('examples/reports/', docs);

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(readJson(new URL('schemas/lint-report.schema.json', docs)) as object);

const examples = readdirSync(examplesDir).filter((file) => file.endsWith('.json'));

describe('docs/examples/reports', () => {
  it('has examples to validate', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)('%s matches the report schema', (file) => {
    const valid = validate(readJson(new URL(file, examplesDir)));
    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

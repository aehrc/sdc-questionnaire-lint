import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { docsDir, readJson, validateReportSchema as validate } from './support/report.js';

const examplesDir = new URL('examples/reports/', docsDir);

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

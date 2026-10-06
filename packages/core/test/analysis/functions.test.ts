import { readFileSync } from 'node:fs';
import fhirpath from 'fhirpath';
import { describe, expect, it } from 'vitest';
import {
  functionsModule,
  installedFhirPath,
  invocationTableKeys,
  renderFunctionsModule,
} from '../../scripts/generate-functions.js';

describe('fhirPathFunctions', () => {
  it('is what scripts/generate-functions.ts generates from the installed fhirpath.js', () => {
    const { version, source } = installedFhirPath();
    const keys = invocationTableKeys(source);
    // Guards against a pattern that stops matching and generates an empty list.
    expect(keys.length).toBeGreaterThan(100);
    expect(
      readFileSync(functionsModule, 'utf8'),
      'run: npm run generate:functions --workspace sdc-questionnaire-lint',
    ).toBe(renderFunctionsModule(version, keys));
  });

  it('names functions that fhirpath.js rejects even on an empty collection', () => {
    expect(() => fhirpath.evaluate({}, '{}.notAFunction()')).toThrow(
      'Not implemented: notAFunction',
    );
  });
});

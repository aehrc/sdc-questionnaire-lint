/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { readFileSync } from 'node:fs';
import fhirpath from 'fhirpath';
import { describe, expect, it } from 'vitest';
import {
  catalogModule,
  installedFhirPath,
  invocationTableKeys,
  renderCatalogModule,
} from '../../scripts/generate-functions.js';

describe('fhirPathFunctions', () => {
  it('is what scripts/generate-functions.ts generates from the installed fhirpath.js', () => {
    const { version, source } = installedFhirPath();
    const keys = invocationTableKeys(source);
    // Guards against a pattern that stops matching and generates an empty list.
    expect(keys.length).toBeGreaterThan(100);
    expect(
      readFileSync(catalogModule, 'utf8'),
      'run: npm run generate:functions --workspace @aehrc/sdc-questionnaire-lint',
    ).toBe(renderCatalogModule(version, keys));
  });

  it('names functions that fhirpath.js rejects even on an empty collection', () => {
    expect(() => fhirpath.evaluate({}, '{}.notAFunction()')).toThrow(
      'Not implemented: notAFunction',
    );
  });
});

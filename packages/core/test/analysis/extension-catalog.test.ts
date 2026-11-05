/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { definedLanguages, isQueryLanguage, languagesAllowedAt } from '../../src/index.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const fhirPathOrCql = ['text/fhirpath', 'text/cql', 'text/cql-identifier', 'text/cql-expression'];

// The language lookups core exports to plugins (API stage A).
describe('the exported language lookups', () => {
  it('allow FHIRPath and the three CQL codes on enableWhenExpression and the toggle', () => {
    expect(languagesAllowedAt({ url: `${sdc}enableWhenExpression` })).toEqual(fhirPathOrCql);
    expect(
      languagesAllowedAt({
        url: `${sdc}answerOptionsToggleExpression`,
        subExtension: 'expression',
      }),
    ).toEqual(fhirPathOrCql);
  });

  it('allow any language on a variable and a targetConstraint', () => {
    expect(languagesAllowedAt({ url: 'http://hl7.org/fhir/StructureDefinition/variable' })).toBe(
      undefined,
    );
    expect(
      languagesAllowedAt({
        url: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
        subExtension: 'expression',
      }),
    ).toBe(undefined);
  });

  it('list the six codes FHIR R4 and R5 define, frozen', () => {
    expect([...definedLanguages].sort()).toEqual(
      [
        'application/x-fhir-query',
        'text/cql',
        'text/cql-expression',
        'text/cql-identifier',
        'text/fhirpath',
        'text/x-fhir-query',
      ].sort(),
    );
    expect(Object.isFrozen(definedLanguages)).toBe(true);
  });

  it('recognise both query codes, and nothing else, as query languages', () => {
    expect(isQueryLanguage('application/x-fhir-query')).toBe(true);
    expect(isQueryLanguage('text/x-fhir-query')).toBe(true);
    expect(isQueryLanguage('text/fhirpath')).toBe(false);
    expect(isQueryLanguage(undefined)).toBe(false);
  });
});

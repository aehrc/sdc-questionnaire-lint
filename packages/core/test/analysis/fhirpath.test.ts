import { describe, expect, it } from 'vitest';
import { checkFhirPathSyntax, countExpressions } from '../../src/analysis/fhirpath.js';
import { expressionSite } from '../support/builders.js';

describe('checkFhirPathSyntax', () => {
  it('returns undefined for valid text', () => {
    expect(checkFhirPathSyntax("%resource.item.where(linkId = 'a').answer.value")).toBeUndefined();
  });

  it('gives the offset of an error on line 1', () => {
    expect(checkFhirPathSyntax('a.where(b')).toEqual({
      parserMessage: "missing ')' at '<EOF>'",
      offset: 9,
    });
  });

  it('gives the offset of an error on line 2, counting from the start of the text', () => {
    // Line 2 starts at offset 5, after "a +\r\n"; the error is at column 2 of it.
    expect(checkFhirPathSyntax('a +\r\n  / b')).toMatchObject({ offset: 7 });
    expect(checkFhirPathSyntax('a +\n  b c')).toMatchObject({
      parserMessage: "extraneous input 'c' expecting <EOF>",
      offset: 8,
    });
  });

  it('throws when valid input overflows the parser stack, instead of blaming the expression', () => {
    const nested = `${'('.repeat(20000)}1${')'.repeat(20000)}`;
    expect(() => checkFhirPathSyntax(nested)).toThrow(RangeError);
  });

  it('returns no message and no offset when the parser fails without a position', () => {
    expect(checkFhirPathSyntax('a.b..c')).toEqual({});
  });
});

describe('countExpressions', () => {
  const catalogued = {
    catalogued: true,
    location: {
      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
    },
    useCases: ['rendering'],
  } as const;
  const fhirPath = (text: string) => ({ language: 'text/fhirpath', text });

  it('counts a catalogued FHIRPath site with text as analysed, even when it does not parse', () => {
    const sites = [
      expressionSite({ ...catalogued, ...fhirPath('1 + 1') }),
      expressionSite({ ...catalogued, ...fhirPath('a.where(') }),
    ];
    expect(countExpressions(sites)).toEqual({ analysed: 2, unchecked: 0 });
  });

  it('counts uncatalogued, other-language and reference-only sites as unchecked', () => {
    const sites = [
      expressionSite(fhirPath('1 + 1')),
      expressionSite({
        ...catalogued,
        language: 'application/x-fhir-query',
        text: 'Patient?_id=1',
      }),
      expressionSite({ ...catalogued, language: 'text/fhirpath', reference: '#library' }),
    ];
    expect(countExpressions(sites)).toEqual({ analysed: 0, unchecked: 3 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  checkFhirPathSyntax,
  countExpressions,
  findFunctionCalls,
} from '../../src/analysis/fhirpath.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

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

describe('findFunctionCalls', () => {
  const names = (text: string) => findFunctionCalls(text)?.map(({ name }) => name);

  it('gives the name and offsets of a call', () => {
    expect(findFunctionCalls('a.where(b)')).toEqual([
      { name: 'where', startOffset: 2, endOffset: 7 },
    ]);
  });

  it('finds a call with no target', () => {
    expect(findFunctionCalls('today()')).toEqual([{ name: 'today', startOffset: 0, endOffset: 5 }]);
  });

  it('gives offsets of a call on line 2, counting from the start of the text', () => {
    // Line 2 starts at offset 5, after "a +\r\n".
    expect(findFunctionCalls('a +\r\n  b.fist()')).toEqual([
      { name: 'fist', startOffset: 9, endOffset: 13 },
    ]);
  });

  it('strips the backticks of a delimited name, and its range keeps them', () => {
    expect(findFunctionCalls('a.`fist`()')).toEqual([
      { name: 'fist', startOffset: 2, endOffset: 8 },
    ]);
  });

  it('skips a delimited name with an escape sequence, which it cannot read as fhirpath.js does', () => {
    expect(findFunctionCalls('a.`fi\\u0072st`()')).toEqual([]);
  });

  it('finds calls nested in arguments, in source order', () => {
    expect(names('a.where(b.fist()).first()')).toEqual(['where', 'fist', 'first']);
  });

  it.each([
    ["%factory.Coding('s', 'c').exists()", ['exists']],
    ["%terminologies.expand('v').exists()", ['exists']],
    ["%`factory`.Coding('s', 'c')", []],
    ["%'factory'.Coding('s', 'c')", []],
    ["(%factory).Coding('s', 'c')", []],
    ["%factory.Coding('s', a.fist())", ['fist']],
  ])(
    'skips calls that fhirpath.js resolves on the factory or terminologies: %s',
    (text, expected) => {
      expect(names(text)).toEqual(expected);
    },
  );

  it('keeps a call on any other constant', () => {
    expect(names('%v.fist()')).toEqual(['fist']);
  });

  it('does not count a member access as a call', () => {
    expect(findFunctionCalls('a.b')).toEqual([]);
  });

  it('returns undefined for text that does not parse, with or without a parser position', () => {
    expect(findFunctionCalls('a.where(')).toBeUndefined();
    expect(findFunctionCalls('a.b..c')).toBeUndefined();
  });

  it('throws when valid input overflows the parser stack, instead of blaming the expression', () => {
    const nested = `${'('.repeat(20000)}1${')'.repeat(20000)}`;
    expect(() => findFunctionCalls(nested)).toThrow(RangeError);
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
      expressionSite({ ...catalogued, language: 'text/cql', text: 'AgeInYears()' }),
      expressionSite({ ...catalogued, language: 'text/fhirpath', reference: '#library' }),
      expressionSite({ ...catalogued, language: 'application/x-fhir-query', reference: '#q' }),
    ];
    expect(countExpressions(sites)).toEqual({ analysed: 0, unchecked: 4 });
  });

  describe('a query and its fragment, counted separately', () => {
    const text = 'Observation?subject={{%patient.id}}';
    const query = (overrides = {}) =>
      expressionSite({ language: 'application/x-fhir-query', text, ...overrides });

    it('counts both as analysed when the query is catalogued', () => {
      const sites = [query(catalogued), fragmentSite(text, '%patient.id', catalogued)];
      expect(countExpressions(sites)).toEqual({ analysed: 2, unchecked: 0 });
    });

    it('counts both as unchecked when the query is uncatalogued', () => {
      const sites = [query(), fragmentSite(text, '%patient.id')];
      expect(countExpressions(sites)).toEqual({ analysed: 0, unchecked: 2 });
    });
  });
});

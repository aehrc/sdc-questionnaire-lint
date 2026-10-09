import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { unknownFunction } from '../../src/rules/unknown-function.js';
import { expressionSite, fragmentSite } from '../support/builders.js';
import { checkSites } from '../support/rules.js';

const check = (sites: ExpressionSite[]) => checkSites(unknownFunction, sites);

const catalogued = {
  catalogued: true,
  location: {
    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  },
} as const;

const fhirPath = (text: string, overrides: Partial<ExpressionSite> = catalogued) =>
  expressionSite({ ...overrides, language: 'text/fhirpath', text });

const helpOf = (text: string) => check([fhirPath(text)]).map(({ help }) => help);

const fallback = 'check the function name; see the FHIRPath function list';

describe('sdc/unknown-function', () => {
  it('checks a fragment, with the range in the fragment', () => {
    const site = fragmentSite('Observation?subject={{%patient.fist()}}', '%patient.fist()');
    expect(check([site])).toMatchObject([{ site, range: { startOffset: 9, endOffset: 13 } }]);
  });

  it('reports an unknown function, with a similar name in help and a range over the name', () => {
    const site = fhirPath('a.fist()');
    expect(check([site])).toEqual([
      {
        site,
        message: 'fist() is not a FHIRPath function, so this expression fails when the form runs.',
        help: 'a function with a similar name exists: first()',
        range: { startOffset: 2, endOffset: 6 },
      },
    ]);
  });

  it('reports an unknown function in an uncatalogued site', () => {
    const site = fhirPath('a.fist()', {});
    expect(check([site])).toMatchObject([{ site }]);
  });

  it('reports nothing for known functions, operators called by name, or the factory', () => {
    const sites = ['a.first().exists()', 'a.`and`(b)', "%factory.Coding('s', 'c')"].map((text) =>
      fhirPath(text),
    );
    expect(check(sites)).toEqual([]);
  });

  it('reports each unknown call, in source order', () => {
    expect(check([fhirPath('a.fist().firt()')]).map(({ range }) => range)).toEqual([
      { startOffset: 2, endOffset: 6 },
      { startOffset: 9, endOffset: 13 },
    ]);
  });

  it('suggests first() for firt, one edit away', () => {
    expect(helpOf('a.firt()')).toEqual(['a function with a similar name exists: first()']);
  });

  it('gives the fallback help when no function name is close', () => {
    expect(helpOf('a.notAFunction()')).toEqual([fallback]);
  });

  it('never suggests an operator, which cannot be called as name()', () => {
    // Among all table keys, & is one edit from x, and and is one edit from an.
    expect(helpOf('a.x()')).toEqual([fallback]);
    expect(helpOf('a.an()')).toEqual(['a function with a similar name exists: as()']);
  });

  it('leaves an expression that does not parse to sdc/parse-error', () => {
    expect(check([fhirPath('a.fist().where(')])).toEqual([]);
  });

  it('never checks another language or a reference-only site', () => {
    const sites = [
      expressionSite({ ...catalogued, language: 'application/x-fhir-query', text: 'a.fist()' }),
      expressionSite({ ...catalogued, language: 'text/cql', text: 'a.fist()' }),
      expressionSite({ ...catalogued, language: 'text/fhirpath', reference: '#library' }),
    ];
    expect(check(sites)).toEqual([]);
  });
});

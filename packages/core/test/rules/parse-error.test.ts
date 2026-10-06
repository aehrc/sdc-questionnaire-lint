import { describe, expect, it } from 'vitest';
import type { ExpressionSite, RuleFinding } from '../../src/plugins/types.js';
import { parseError } from '../../src/rules/parse-error.js';
import { expressionSite } from '../support/builders.js';

function check(sites: ExpressionSite[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  parseError.check({
    document: { file: 'Q.json', resource: {}, resourcePointer: '', localResources: [] },
    sites,
    scopeAt: () => ({ available: false, names: [] }),
    options: undefined,
    report: (finding) => findings.push(finding),
  });
  return findings;
}

const catalogued = {
  catalogued: true,
  location: {
    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  },
} as const;

describe('sdc/parse-error', () => {
  it('never parses another language', () => {
    const broken = 'a.where(';
    const sites = [
      expressionSite({ ...catalogued, language: 'application/x-fhir-query', text: broken }),
      expressionSite({ ...catalogued, language: 'text/cql', text: broken }),
      expressionSite({ ...catalogued, text: broken }),
    ];
    expect(check(sites)).toEqual([]);
  });

  it('reports broken FHIRPath in an uncatalogued site', () => {
    const site = expressionSite({ language: 'text/fhirpath', text: 'a.where(' });
    expect(check([site])).toMatchObject([{ site }]);
  });

  it.each([
    {
      branch: 'empty',
      text: ' ',
      expected: {
        message: 'The expression is empty.',
        note: "the FHIRPath parser reported: mismatched input '<EOF>'",
        range: { startOffset: 1, endOffset: 1 },
      },
    },
    {
      branch: 'missing bracket at the end',
      text: 'a.where(b',
      expected: {
        message: 'A closing ) is missing.',
        help: 'add ) at the end of the expression',
        note: "the FHIRPath parser reported: missing ')' at '<EOF>'",
        range: { startOffset: 9, endOffset: 9 },
      },
    },
    {
      branch: 'missing bracket before a trailing comment',
      text: 'a.where(b // why',
      expected: {
        message: 'A closing ) is missing.',
        note: "the FHIRPath parser reported: missing ')' at '<EOF>'",
        range: { startOffset: 16, endOffset: 16 },
      },
    },
    {
      branch: 'ends early',
      text: 'a and',
      expected: {
        message: 'The expression ends before it is complete.',
        note: "the FHIRPath parser reported: mismatched input '<EOF>'",
        range: { startOffset: 5, endOffset: 5 },
      },
    },
    {
      branch: 'unexpected token',
      text: 'a b',
      expected: {
        message: 'The expression has an unexpected b.',
        note: "the FHIRPath parser reported: extraneous input 'b'",
        range: { startOffset: 2, endOffset: 3 },
      },
    },
    {
      branch: 'double-quoted string',
      text: 'a = "x"',
      expected: {
        message: 'The character " is not valid here.',
        note: "the FHIRPath parser reported: token recognition error at: '\"'",
        range: { startOffset: 4, endOffset: 5 },
      },
    },
    {
      branch: 'unclosed string',
      text: "'abc",
      expected: {
        message: "A string is missing its closing '.",
        note: "the FHIRPath parser reported: token recognition error at: ''abc'",
        range: { startOffset: 0, endOffset: 1 },
      },
    },
    {
      branch: 'fallback',
      text: 'a.where(x = 1',
      expected: {
        message: 'This FHIRPath expression has a syntax error.',
        note: "the FHIRPath parser reported: no viable alternative at input '1'",
        range: { startOffset: 13, endOffset: 13 },
      },
    },
    {
      branch: 'fallback without a position',
      text: 'a.b..c',
      expected: {
        message: 'This FHIRPath expression has a syntax error.',
      },
    },
  ])('describes the $branch case', ({ text, expected }) => {
    const site = expressionSite({ ...catalogued, language: 'text/fhirpath', text });
    expect(check([site])).toEqual([{ site, ...expected }]);
  });
});

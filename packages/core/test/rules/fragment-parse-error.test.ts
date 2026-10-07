import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import type { RuleFinding } from '../../src/plugins/contract.js';
import { fragmentParseError } from '../../src/rules/fragment-parse-error.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

function check(sites: ExpressionSite[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  fragmentParseError.check({
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
    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemPopulationContext',
  },
} as const;

describe('sdc/fragment-parse-error', () => {
  it('reports a broken fragment in the words of sdc/parse-error, with a range in the fragment', () => {
    const site = fragmentSite('Observation?subject={{%patient.id.}}', '%patient.id.', catalogued);
    expect(check([site])).toEqual([
      {
        site,
        message: 'The expression ends before it is complete.',
        note: "the FHIRPath parser reported: mismatched input '<EOF>'",
        range: { startOffset: 12, endOffset: 12 },
      },
    ]);
  });

  it('reports an empty fragment', () => {
    const site = fragmentSite('Patient/{{}}', '', catalogued);
    expect(check([site])).toMatchObject([{ site, message: 'The expression is empty.' }]);
  });

  it('reports a broken fragment of an uncatalogued query', () => {
    const site = fragmentSite('Observation?subject={{%patient.id.}}', '%patient.id.');
    expect(check([site])).toMatchObject([{ site }]);
  });

  it('reports nothing for a valid fragment', () => {
    const site = fragmentSite('Observation?subject={{%patient.id}}', '%patient.id', catalogued);
    expect(check([site])).toEqual([]);
  });

  it('leaves an Expression to sdc/parse-error', () => {
    const site = expressionSite({ ...catalogued, language: 'text/fhirpath', text: 'a.where(' });
    expect(check([site])).toEqual([]);
  });
});

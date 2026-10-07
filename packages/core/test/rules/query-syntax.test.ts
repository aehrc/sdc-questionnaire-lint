import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import type { RuleFinding } from '../../src/plugins/contract.js';
import { querySyntax } from '../../src/rules/query-syntax.js';
import { expressionSite, fragmentSite } from '../support/builders.js';

function check(sites: ExpressionSite[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  querySyntax.check({
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

const query = (text: string, overrides: Partial<ExpressionSite> = catalogued) =>
  expressionSite({ ...overrides, language: 'application/x-fhir-query', text });

const notASearch =
  "This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills stay empty.";

describe('sdc/query-syntax', () => {
  it('suggests the FHIRPath language for a query that is FHIRPath', () => {
    const site = query('%patient.id');
    expect(check([site])).toEqual([
      {
        site,
        message: notASearch,
        help: 'set the language to text/fhirpath; this expression is FHIRPath',
      },
    ]);
  });

  it('suggests a FHIR search for a query that is neither', () => {
    const site = query('observation?code=x');
    expect(check([site])).toEqual([
      {
        site,
        message: notASearch,
        help: 'write a FHIR search such as Observation?subject={{%patient.id}}',
      },
    ]);
  });

  it('reports an unclosed {{ with a range over it', () => {
    const site = query('Observation?subject={{%patient.id');
    expect(check([site])).toEqual([
      {
        site,
        message:
          'This x-fhir-query has a {{ with no closing }}, so the text after it is sent to the server as written instead of being evaluated.',
        help: 'add }} after the embedded FHIRPath expression',
        range: { startOffset: 20, endOffset: 22 },
      },
    ]);
  });

  it('reports only the unclosed {{ when the shape is wrong too', () => {
    const findings = check([query('%patient.id {{')]);
    expect(findings.map(({ range }) => range)).toEqual([{ startOffset: 12, endOffset: 14 }]);
  });

  it('reports a query at an uncatalogued location', () => {
    expect(check([query('%patient.id', {})])).toHaveLength(1);
  });

  it('reports nothing for a FHIR search', () => {
    expect(check([query('Observation?subject={{%patient.id}}')])).toEqual([]);
  });

  it('never checks FHIRPath, fragments or a query with no text', () => {
    const sites = [
      expressionSite({ ...catalogued, language: 'text/fhirpath', text: '%patient.id' }),
      fragmentSite('Observation?subject={{%patient.id}}', '%patient.id', catalogued),
      expressionSite({ ...catalogued, language: 'application/x-fhir-query', reference: '#q' }),
    ];
    expect(check(sites)).toEqual([]);
  });
});

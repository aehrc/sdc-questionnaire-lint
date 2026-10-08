import { describe, expect, it } from 'vitest';
import { analyseDocument } from '../../src/analysis/document-analysis.js';
import type { QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';

const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';

const variable = (name: string, language: string, text: string) => ({
  url: VARIABLE,
  valueExpression: { name, language, expression: text },
});

function analyse(resource: Record<string, unknown>) {
  const document: QuestionnaireDocument = {
    file: 'Q.json',
    resource: { resourceType: 'Questionnaire', ...resource },
    resourcePointer: '',
    localResources: [],
  };
  const sites = findExpressionSites(document);
  return { sites, analysis: analyseDocument(document, sites) };
}

describe('analyseDocument references', () => {
  it('gives the references of each FHIRPath site that parses, fragments in both query codes included', () => {
    const { sites, analysis } = analyse({
      extension: [
        variable('a', 'text/fhirpath', '%b + 1'),
        variable('q4', 'application/x-fhir-query', 'Observation?subject={{%patient.id}}'),
        variable('q5', 'text/x-fhir-query', 'Observation?code={{%`code`}}'),
        variable('broken', 'text/fhirpath', '%c.where('),
        variable('cql', 'text/cql', '%d'),
      ],
    });
    const byPointer = Object.fromEntries(
      [...analysis.references].map(([site, references]) => [
        site.pointer,
        references.map(({ name }) => name),
      ]),
    );
    expect(byPointer).toEqual({
      '/extension/0/valueExpression/expression': ['b'],
      '/extension/1/valueExpression/expression': ['patient'],
      '/extension/2/valueExpression/expression': ['code'],
    });
    // Only the fragments have references; the queries themselves are not FHIRPath.
    expect([...analysis.references.keys()].map((site) => site.carrier)).toEqual([
      'expression',
      'fragment',
      'fragment',
    ]);
    expect(sites.filter((site) => analysis.references.has(site))).toHaveLength(3);
  });
});

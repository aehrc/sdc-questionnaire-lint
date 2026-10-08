import { describe, expect, it } from 'vitest';
import { analyseDocument } from '../../src/analysis/document-analysis.js';
import type { QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import { sdcPlugin } from '../../src/plugins/builtin.js';
import type { LintRule } from '../../src/plugins/contract.js';
import { runRules } from '../../src/run/rules.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';

const rule = sdcPlugin.rules['duplicate-declaration'] as LintRule;

function expression(url: string, name: string, text = '1') {
  return { url, valueExpression: { name, language: 'text/fhirpath', expression: text } };
}

const variable = (name: string, text = '1') => expression(VARIABLE, name, text);

function launchContext(name: string) {
  return {
    url: `${sdc}launchContext`,
    extension: [
      { url: 'name', valueCoding: { code: name } },
      { url: 'type', valueCode: 'Patient' },
    ],
  };
}

const allocateId = (name: string) => ({ url: `${sdc}extractAllocateId`, valueString: name });

// The findings of sdc/duplicate-declaration on a Questionnaire, as the report shows them.
function lintResource(resource: Record<string, unknown>) {
  const document: QuestionnaireDocument = {
    file: 'Q.json',
    resource: { resourceType: 'Questionnaire', id: 'Q', ...resource },
    resourcePointer: '',
    localResources: [],
  };
  const sites = findExpressionSites(document);
  const doc = {
    input: { path: '/ig/Q.json', display: 'Q.json', baseRelative: 'Q.json' },
    document,
    sites,
    analysis: analyseDocument(document, sites),
  };
  return runRules(doc, [
    { id: 'sdc/duplicate-declaration', namespace: 'sdc', rule, setting: 'error' },
  ]);
}

const resource = { resourceType: 'Questionnaire', id: 'Q', pointer: '' };
const unmapped = { status: 'unmapped', reason: 'source-unavailable' };

describe('sdc/duplicate-declaration', () => {
  it('reports the later of two variables with one name on an item, with the other as related', () => {
    const findings = lintResource({
      item: [{ linkId: 'bmi', extension: [variable('weight', '70'), variable('weight', '80')] }],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/duplicate-declaration',
        severity: 'error',
        message:
          'The name %weight is declared more than once on item bmi, so it is unclear which ' +
          'value expressions that use it get.',
        help: 'rename or remove one of the declarations of %weight',
        jsonLocation: {
          file: 'Q.json',
          pointer: '/item/0/extension/1/valueExpression/expression',
          resource,
          linkId: 'bmi',
        },
        sourceLocation: unmapped,
        expression: { text: '80' },
        relatedLocations: [
          {
            kind: 'questionnaire',
            jsonLocation: {
              file: 'Q.json',
              pointer: '/item/0/extension/0/valueExpression/expression',
              resource,
              linkId: 'bmi',
            },
            sourceLocation: unmapped,
            message: '%weight is also declared here',
          },
        ],
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('reports two launchContexts with one name, which have no Expression, at the extension', () => {
    const [finding, ...rest] = lintResource({
      extension: [launchContext('patient'), launchContext('patient')],
    });
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      message:
        'The name %patient is declared more than once on the Questionnaire root, so it is ' +
        'unclear which value expressions that use it get.',
      jsonLocation: { pointer: '/extension/1' },
      relatedLocations: [{ jsonLocation: { pointer: '/extension/0' } }],
    });
    expect(finding).not.toHaveProperty('expression');
    expect(finding?.jsonLocation).not.toHaveProperty('linkId');
  });

  it('reports declarations of any kinds: a launchContext and a variable', () => {
    const findings = lintResource({ extension: [launchContext('patient'), variable('patient')] });
    expect(findings).toMatchObject([
      {
        jsonLocation: { pointer: '/extension/1/valueExpression/expression' },
        relatedLocations: [{ jsonLocation: { pointer: '/extension/0' } }],
      },
    ]);
  });

  it('reports an extractAllocateId and a named calculatedExpression on one item', () => {
    const findings = lintResource({
      item: [
        {
          linkId: 'q',
          extension: [expression(`${sdc}calculatedExpression`, 'id'), allocateId('id')],
        },
      ],
    });
    expect(findings).toMatchObject([
      {
        jsonLocation: { pointer: '/item/0/extension/1', linkId: 'q' },
        relatedLocations: [
          { jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression' } },
        ],
      },
    ]);
  });

  it('reports each later declaration of a name declared three times, against the first', () => {
    const findings = lintResource({ extension: [variable('a'), variable('a'), variable('a')] });
    expect(
      findings.map((finding) => [
        finding.jsonLocation.pointer,
        finding.relatedLocations?.map((related) =>
          related.kind === 'questionnaire' ? related.jsonLocation.pointer : undefined,
        ),
      ]),
    ).toEqual([
      ['/extension/1/valueExpression/expression', ['/extension/0/valueExpression/expression']],
      ['/extension/2/valueExpression/expression', ['/extension/0/valueExpression/expression']],
    ]);
  });

  it('keeps the fingerprint at a launchContext when another extension is inserted before it', () => {
    const fingerprints = (extension: unknown[]) =>
      lintResource({ extension }).map((finding) => finding.fingerprint);
    const pair = [launchContext('patient'), launchContext('patient')];
    const before = fingerprints(pair);
    expect(before).toHaveLength(1);
    expect(fingerprints([allocateId('x'), launchContext('user'), ...pair])).toEqual(before);
  });

  it('gives each repeat of a name at extensions its own fingerprint', () => {
    const findings = lintResource({
      extension: [allocateId('a'), allocateId('a'), allocateId('a')],
    });
    expect(new Set(findings.map((finding) => finding.fingerprint)).size).toBe(2);
  });

  it('names an item without a linkId without its pointer', () => {
    const [finding] = lintResource({ item: [{ extension: [variable('a'), variable('a')] }] });
    expect(finding?.message).toContain('on an item that has no linkId,');
  });

  it('does not report one name on different elements', () => {
    const findings = lintResource({
      extension: [variable('a'), launchContext('patient')],
      item: [
        {
          linkId: 'g',
          extension: [variable('a')],
          item: [{ linkId: 'q', extension: [variable('a')] }],
        },
        { linkId: 'h', extension: [variable('patient')] },
      ],
    });
    expect(findings).toEqual([]);
  });

  it('does not report different names, unnamed Expressions or contained resources', () => {
    const findings = lintResource({
      extension: [variable('a'), variable('b')],
      contained: [{ resourceType: 'Questionnaire', extension: [variable('c'), variable('c')] }],
      item: [
        {
          linkId: 'q',
          extension: [
            {
              url: `${sdc}calculatedExpression`,
              valueExpression: { language: 'text/fhirpath', expression: '1' },
            },
            {
              url: `${sdc}calculatedExpression`,
              valueExpression: { language: 'text/fhirpath', expression: '2' },
            },
          ],
        },
      ],
    });
    expect(findings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { lintQuestionnaire } from '../support/rules.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';

const variable = (name: string, text = '1') => ({
  url: VARIABLE,
  valueExpression: { name, language: 'text/fhirpath', expression: text },
});

const launchContext = (name: string) => ({
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { code: name } },
    { url: 'type', valueCode: 'Patient' },
  ],
});

const allocateId = (name: string) => ({ url: `${sdc}extractAllocateId`, valueString: name });

const lintResource = (resource: Record<string, unknown>) =>
  lintQuestionnaire('shadowed-declaration', resource);

// The pointer of each finding, with the pointers of its related locations.
const located = (resource: Record<string, unknown>) =>
  lintResource(resource).map((finding) => [
    finding.jsonLocation.pointer,
    finding.relatedLocations?.map((related) =>
      related.kind === 'questionnaire' ? related.jsonLocation.pointer : undefined,
    ),
  ]);

const message = (name: string, element: string, ancestor: string) =>
  `The name %${name} on ${element} is also declared on ${ancestor}, so other expressions on ` +
  `${element} and its descendant items get this declaration's value.`;

const resource = { resourceType: 'Questionnaire', id: 'Q', pointer: '' };
const unmapped = { status: 'unmapped', reason: 'source-unavailable' };

describe('sdc/shadowed-declaration', () => {
  it('reports a variable on an item that the root also declares, with the root one as related', () => {
    const findings = lintResource({
      extension: [variable('weight', '70')],
      item: [{ linkId: 'bmi', extension: [variable('weight', '80')] }],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/shadowed-declaration',
        severity: 'info',
        message: message('weight', 'item bmi', 'the Questionnaire root'),
        help: 'rename one of the declarations of %weight, unless this item should override it',
        jsonLocation: {
          file: 'Q.json',
          pointer: '/item/0/extension/0/valueExpression/expression',
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
              pointer: '/extension/0/valueExpression/expression',
              resource,
            },
            sourceLocation: unmapped,
            message: '%weight is also declared here',
          },
        ],
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('relates each shadowing declaration to the nearest ancestor that declares the name', () => {
    const findings = lintResource({
      extension: [variable('a')],
      item: [
        {
          linkId: 'g',
          extension: [variable('a')],
          item: [{ linkId: 'q', extension: [variable('a')] }],
        },
      ],
    });
    expect(findings.map(({ message }) => message)).toEqual([
      message('a', 'item g', 'the Questionnaire root'),
      message('a', 'item q', 'item g'),
    ]);
    expect(findings.map(({ relatedLocations }) => relatedLocations)).toMatchObject([
      [{ jsonLocation: { pointer: '/extension/0/valueExpression/expression' } }],
      [{ jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression' } }],
    ]);
  });

  it('skips an ancestor item that does not declare the name', () => {
    expect(
      located({
        extension: [variable('a')],
        item: [{ linkId: 'g', item: [{ linkId: 'q', extension: [variable('a')] }] }],
      }),
    ).toEqual([
      [
        '/item/0/item/0/extension/0/valueExpression/expression',
        ['/extension/0/valueExpression/expression'],
      ],
    ]);
  });

  it('reports an item that declares a launchContext name, like any other name', () => {
    expect(
      lintResource({
        extension: [launchContext('patient')],
        item: [{ linkId: 'q', extension: [variable('patient')] }],
      }),
    ).toMatchObject([
      {
        severity: 'info',
        message: message('patient', 'item q', 'the Questionnaire root'),
        jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression' },
        relatedLocations: [{ jsonLocation: { pointer: '/extension/0' } }],
      },
    ]);
  });

  it('reports an extractAllocateId on an item, which has no Expression, at the extension', () => {
    const [finding, ...rest] = lintResource({
      extension: [allocateId('id')],
      item: [{ extension: [allocateId('id')] }],
    });
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      message: message('id', 'an item that has no linkId', 'the Questionnaire root'),
      jsonLocation: { pointer: '/item/0/extension/0' },
      relatedLocations: [{ jsonLocation: { pointer: '/extension/0' } }],
    });
    expect(finding).not.toHaveProperty('expression');
  });

  it('names an item by its text and linkId', () => {
    const [finding] = lintResource({
      extension: [variable('a')],
      item: [{ linkId: 'bmi', text: 'BMI', extension: [variable('a')] }],
    });
    expect(finding?.message).toBe(message('a', 'item "BMI" (bmi)', 'the Questionnaire root'));
  });

  it('reports only declarations that one expression could see together (D19)', () => {
    const extractionContext = {
      url: `${sdc}itemExtractionContext`,
      valueExpression: { name: 'id', language: 'text/fhirpath', expression: '1' },
    };
    expect(
      located({
        extension: [variable('v'), allocateId('id')],
        item: [
          { linkId: 'q', extension: [allocateId('v')] },
          { linkId: 'r', extension: [extractionContext] },
        ],
      }),
    ).toEqual([['/item/1/extension/0/valueExpression/expression', ['/extension/1']]]);
  });

  it('does not report duplicates on one element, siblings, or contained resources', () => {
    expect(
      located({
        extension: [variable('a'), variable('a')],
        contained: [
          {
            resourceType: 'Questionnaire',
            extension: [variable('c')],
            item: [{ linkId: 'q', extension: [variable('c')] }],
          },
        ],
        item: [
          { linkId: 'x', extension: [variable('b')] },
          { linkId: 'y', extension: [variable('b')], item: [{ linkId: 'z' }] },
        ],
      }),
    ).toEqual([]);
  });

  it('does not take /item/10 for a descendant of /item/1', () => {
    const item = Array.from({ length: 11 }, (_, index): Record<string, unknown> => ({
      linkId: `q${String(index)}`,
    }));
    item[1] = { linkId: 'q1', extension: [variable('a')] };
    item[10] = { linkId: 'q10', extension: [variable('a')] };
    expect(located({ item })).toEqual([]);
  });
});

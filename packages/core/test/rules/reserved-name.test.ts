import { describe, expect, it } from 'vitest';
import { lintQuestionnaire } from '../support/rules.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';

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

const lintResource = (resource: Record<string, unknown>) =>
  lintQuestionnaire('reserved-name', resource);

const message = (name: string, definer: string) =>
  `The name %${name} is defined by ${definer}, so a form cannot declare it; it is unclear ` +
  'which value expressions that use it get.';

describe('sdc/reserved-name', () => {
  it('reports a variable that declares a name SDC defines, at the variable', () => {
    const findings = lintResource({
      item: [{ linkId: 'bmi', extension: [variable('qitem', '%resource')] }],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/reserved-name',
        severity: 'error',
        message: message('qitem', 'SDC'),
        help: 'rename the declaration, and the expressions that should use it',
        jsonLocation: {
          file: 'Q.json',
          pointer: '/item/0/extension/0/valueExpression/expression',
          resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          linkId: 'bmi',
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text: '%resource' },
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it.each([
    ['resource', 'FHIR'],
    ['rootResource', 'FHIR'],
    ['context', 'FHIRPath'],
    ['ucum', 'FHIRPath'],
    ['questionnaire', 'SDC'],
    ['qitem', 'SDC'],
    ['sct', 'FHIR'],
    ['loinc', 'FHIR'],
    ['terminologies', 'FHIR'],
    ['factory', 'FHIR'],
    ['server', 'FHIR'],
    ['vs-conditions', 'FHIR'],
    ['ext-birthPlace', 'FHIR'],
  ])('reports a declaration of %s, which %s defines', (name, definer) => {
    expect(lintResource({ extension: [variable(name)] })).toMatchObject([
      { message: message(name, definer) },
    ]);
  });

  it('reports every kind of declaration, at its Expression or extension', () => {
    const findings = lintResource({
      extension: [launchContext('context')],
      item: [
        {
          linkId: 'a',
          extension: [
            expression(`${sdc}itemPopulationContext`, 'resource', '%patient'),
            expression(`${sdc}calculatedExpression`, 'ucum'),
            allocateId('questionnaire'),
          ],
        },
      ],
    });
    expect(findings.map(({ jsonLocation }) => jsonLocation.pointer)).toEqual([
      '/extension/0',
      '/item/0/extension/0/valueExpression/expression',
      '/item/0/extension/1/valueExpression/expression',
      '/item/0/extension/2',
    ]);
  });

  it('reports nothing for other names, a name only like a reserved one, or no declaration', () => {
    expect(
      lintResource({
        extension: [launchContext('patient'), variable('weight'), variable('vsconditions')],
        contained: [{ resourceType: 'Questionnaire', extension: [variable('qitem')] }],
        item: [
          {
            linkId: 'a',
            extension: [variable('Resource'), expression(`${sdc}calculatedExpression`, '')],
          },
        ],
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { lintQuestionnaire } from '../support/rules.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function expression(
  extension: string,
  name: string | undefined,
  text: string,
  language = 'text/fhirpath',
) {
  const url =
    extension === 'variable'
      ? 'http://hl7.org/fhir/StructureDefinition/variable'
      : `${sdc}${extension}`;
  return {
    url,
    valueExpression: { language, expression: text, ...(name === undefined ? {} : { name }) },
  };
}

const variable = (name: string, text = '1') => expression('variable', name, text);
const calculated = (text: string) => expression('calculatedExpression', undefined, text);

const launchContext = (name: string) => ({
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { code: name } },
    { url: 'type', valueCode: 'Patient' },
  ],
});

const lintResource = (resource: Record<string, unknown>, hostVariables: string[] = []) =>
  lintQuestionnaire('undefined-variable', resource, hostVariables);

// The message, help and range of each finding.
const reported = (resource: Record<string, unknown>, hostVariables: string[] = []) =>
  lintResource(resource, hostVariables).map(({ message, help, expression: excerpt }) => ({
    message,
    help,
    range: excerpt?.range,
  }));

const noSuggestion =
  'declare it on this item, an ancestor item or the root, or list it in hostVariables if the ' +
  'application running the form supplies it';

describe('sdc/undefined-variable', () => {
  it('reports a reference that is not available, at the reference, suggesting a similar name', () => {
    const findings = lintResource({
      item: [
        {
          linkId: 'bmi',
          text: 'BMI',
          extension: [variable('weight', '70'), calculated('%weigt / 2')],
        },
      ],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/undefined-variable',
        severity: 'error',
        message: '%weigt is not available on item "BMI" (bmi).',
        help: 'a variable with a similar name is available: %weight',
        jsonLocation: {
          file: 'Q.json',
          pointer: '/item/0/extension/1/valueExpression/expression',
          resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          linkId: 'bmi',
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text: '%weigt / 2', range: { startOffset: 0, endOffset: 6 } },
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('suggests no name for a swap of two letters, or for a name available only elsewhere', () => {
    expect(
      reported({
        item: [
          { linkId: 'a', extension: [variable('weight'), calculated('%weigth')] },
          { linkId: 'b', extension: [calculated('%weight')] },
        ],
      }),
    ).toEqual([
      {
        message: '%weigth is not available on item a.',
        help: noSuggestion,
        range: { startOffset: 0, endOffset: 7 },
      },
      {
        message: '%weight is not available on item b.',
        help: noSuggestion,
        range: { startOffset: 0, endOffset: 7 },
      },
    ]);
  });

  it('says to declare a name on the root, at a root site', () => {
    expect(reported({ extension: [variable('x', '%nope')] })).toMatchObject([
      {
        help:
          'declare it on the root, or list it in hostVariables if the application running the ' +
          'form supplies it',
      },
    ]);
  });

  it.each([
    [{ extension: [variable('x', '%nope')] }, 'the Questionnaire root'],
    [{ item: [{ text: 'Weight', extension: [calculated('%nope')] }] }, 'item "Weight"'],
    [{ item: [{ extension: [calculated('%nope')] }] }, 'an item that has no linkId'],
  ])('names the element: %j', (resource, element) => {
    expect(reported(resource)).toMatchObject([
      { message: `%nope is not available on ${element}.` },
    ]);
  });

  it('reports an undefined name inside a text/x-fhir-query fragment, at the name in its query', () => {
    const query = 'Observation?subject={{%patiant.id}}';
    const findings = lintResource({
      extension: [
        launchContext('patient'),
        expression('variable', 'obs', query, 'text/x-fhir-query'),
      ],
    });
    expect(findings).toMatchObject([
      {
        message: '%patiant is not available on the Questionnaire root.',
        help: 'a variable with a similar name is available: %patient',
        expression: { text: query, range: { startOffset: 22, endOffset: 30 } },
      },
    ]);
  });

  it('accepts declarations, built-in names and host variables', () => {
    expect(
      reported(
        {
          extension: [launchContext('patient'), variable('total', '%PrePopQuery.total')],
          item: [
            {
              linkId: 'a',
              extension: [
                expression('itemPopulationContext', 'ctx', '%patient'),
                // D13: rendering may reference a named initialExpression.
                calculated(
                  '%init + %total + %ctx.count() + %resource.count() + %qitem.count() + %`vs-x`.count()',
                ),
                expression('initialExpression', 'init', '%later'),
                // D8: a later declaration on the same element.
                variable('later'),
              ],
            },
          ],
        },
        ['PrePopQuery'],
      ),
    ).toEqual([]);
  });

  it('reports a host variable that is not listed', () => {
    expect(reported({ extension: [variable('total', '%PrePopQuery.total')] })).toMatchObject([
      { message: '%PrePopQuery is not available on the Questionnaire root.' },
    ]);
  });

  it('reports a variable referenced in extraction, but not an extractAllocateId (D19)', () => {
    expect(
      reported({
        extension: [variable('x'), { url: `${sdc}extractAllocateId`, valueString: 'newId' }],
        item: [
          {
            linkId: 'a',
            extension: [expression('itemExtractionContext', undefined, '%newId | %x')],
          },
        ],
      }),
    ).toEqual([
      {
        message: '%x is not available on item a.',
        help: noSuggestion,
        range: { startOffset: 9, endOffset: 11 },
      },
    ]);
  });

  it('skips a name defineVariable binds, and a reference after a computed defineVariable name', () => {
    expect(
      reported({
        extension: [
          variable('a', "defineVariable('y', 1).select(%y)"),
          variable('b', 'defineVariable(%a.first(), 1).select(%z)'),
        ],
      }),
    ).toEqual([]);
  });

  it('skips an expression that does not parse, another language, and an uncatalogued site', () => {
    expect(
      reported({
        extension: [
          variable('a', '%nope.where('),
          expression('variable', 'b', '%nope', 'text/cql'),
          {
            url: 'http://example.org/custom',
            valueExpression: { language: 'text/fhirpath', expression: '%nope' },
          },
        ],
        contained: [{ resourceType: 'Questionnaire', extension: [variable('c', '%nope')] }],
      }),
    ).toEqual([]);
  });
});

describe('sdc/undefined-variable in a module', () => {
  const assembleContext = (name: string) => ({ url: `${sdc}assembleContext`, valueString: name });

  it('accepts the names the module lists in assembleContext, and reports any other', () => {
    expect(
      reported({
        extension: [assembleContext('person'), assembleContext('linkIdPrefix')],
        item: [
          {
            linkId: 'a',
            extension: [
              variable('linkIdPrefix', "%linkIdPrefix + 'a.'"),
              calculated('%person.name.first() | %persn'),
            ],
          },
        ],
      }),
    ).toEqual([
      {
        message: '%persn is not available on item a.',
        help: 'a variable with a similar name is available: %person',
        range: { startOffset: 23, endOffset: 29 },
      },
    ]);
  });
});

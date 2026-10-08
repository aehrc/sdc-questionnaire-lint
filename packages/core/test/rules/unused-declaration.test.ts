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

const lintResource = (resource: Record<string, unknown>) =>
  lintQuestionnaire('unused-declaration', resource);

// The pointer of each finding.
const reported = (resource: Record<string, unknown>) =>
  lintResource(resource).map((finding) => finding.jsonLocation.pointer);

const at = (index: number, item = '') =>
  `${item}/extension/${String(index)}/valueExpression/expression`;

describe('sdc/unused-declaration', () => {
  it('reports a variable that no expression references, at its expression', () => {
    const findings = lintResource({
      item: [{ linkId: 'bmi', text: 'BMI', extension: [variable('weight', '70')] }],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/unused-declaration',
        severity: 'warning',
        message:
          '%weight is declared on item "BMI" (bmi), but no expression references it, so its value ' +
          'is never used.',
        help: 'remove the variable, or reference %weight where its value is needed',
        jsonLocation: {
          file: 'Q.json',
          pointer: at(0, '/item/0'),
          resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          linkId: 'bmi',
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text: '70' },
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('does not report a variable referenced on its item, a descendant item or in a query fragment', () => {
    expect(
      reported({
        extension: [
          variable('a'),
          variable('b'),
          variable('c'),
          expression('variable', 'q', 'Observation?code={{%c}}', 'application/x-fhir-query'),
        ],
        item: [
          {
            linkId: 'g',
            extension: [calculated('%a')],
            item: [{ linkId: 'x', extension: [calculated('%b + %q.count()')] }],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('counts a reference from another variable, even an unused one', () => {
    expect(reported({ extension: [variable('a'), variable('b', '%a')] })).toEqual([at(1)]);
  });

  it('uses resolution: a reference to an overriding declaration is not a use of the one it overrides', () => {
    expect(
      reported({
        extension: [variable('weight', '70')],
        item: [{ linkId: 'bmi', extension: [variable('weight', '80'), calculated('%weight')] }],
      }),
    ).toEqual([at(0)]);
  });

  it('does not count a reference from its own expression, a name defineVariable binds, or an extraction site', () => {
    expect(
      reported({
        extension: [
          variable('a', '%a + 1'),
          variable('b'),
          variable('c'),
          expression('itemExtractionContext', undefined, '%c'),
        ],
        item: [{ linkId: 'x', extension: [calculated("defineVariable('b', 2).select(%b)")] }],
      }),
    ).toEqual([at(0), at(1), at(2)]);
  });

  it('counts a reference to its own name from its own expression as a use of the declaration it overrides', () => {
    expect(
      reported({
        extension: [variable('prefix', "'a.'")],
        item: [{ linkId: 'x', extension: [variable('prefix', "%prefix + 'b.'")] }],
      }),
    ).toEqual([at(0, '/item/0')]);
  });

  it('reports only variables, not an itemPopulationContext, a named expression, a launchContext or an extractAllocateId', () => {
    expect(
      reported({
        extension: [
          {
            url: `${sdc}launchContext`,
            extension: [
              { url: 'name', valueCoding: { code: 'patient' } },
              { url: 'type', valueCode: 'Patient' },
            ],
          },
          { url: `${sdc}extractAllocateId`, valueString: 'newId' },
        ],
        item: [
          {
            linkId: 'g',
            extension: [
              expression('itemPopulationContext', 'contact', '%patient.contact'),
              expression('initialExpression', 'start', 'today()'),
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('reports a variable whose own expression is in another language or does not parse', () => {
    expect(reported({ extension: [expression('variable', 'a', 'a', 'text/cql')] })).toEqual([
      at(0),
    ]);
    expect(reported({ extension: [variable('b', '%(')] })).toEqual([at(0)]);
  });

  it('treats duplicates on one element alike: a use of one, or an expression of one, is shared', () => {
    expect(reported({ extension: [variable('a'), variable('a'), variable('b', '%a')] })).toEqual([
      at(2),
    ]);
    expect(
      reported({ extension: [expression('variable', 'a', 'x', 'text/cql'), variable('a')] }),
    ).toEqual([at(0), at(1)]);
  });

  it.each([
    ['a self-reference', variable('a', '%a')],
    [
      'a query fragment',
      expression('variable', 'a', 'Patient?id={{%a}}', 'application/x-fhir-query'),
    ],
    ['a computed local name', variable('a', 'defineVariable(%resource.id).select(%a)')],
  ])('does not count %s in either duplicate as a use of their shared name', (_, self) => {
    for (const extension of [
      [self, variable('a')],
      [variable('a'), self],
    ]) {
      expect(reported({ extension })).toEqual([at(0), at(1)]);
    }
  });

  describe('when a consumer that could see the variable was not analysed', () => {
    const notReportedWith = (consumer: Record<string, unknown>) =>
      reported({
        extension: [variable('a')],
        item: [{ linkId: 'g', item: [{ linkId: 'x', ...consumer }] }],
      });

    it.each([
      ['CQL', { extension: [expression('calculatedExpression', undefined, '%a', 'text/cql')] }],
      [
        'an Expression that has only a reference',
        {
          extension: [
            { url: `${sdc}calculatedExpression`, valueExpression: { reference: 'Library/l' } },
          ],
        },
      ],
      [
        'an uncatalogued Expression that has only a reference',
        {
          extension: [
            {
              url: 'http://example.org/custom',
              valueExpression: { language: 'text/fhirpath', reference: 'Library/consumer' },
            },
          ],
        },
      ],
      ['FHIRPath that does not parse', { extension: [calculated('%a.where(')] }],
      [
        'a query with an unclosed fragment',
        {
          extension: [
            expression(
              'candidateExpression',
              undefined,
              'Patient?id={{%a',
              'application/x-fhir-query',
            ),
          ],
        },
      ],
      [
        'a reference after a defineVariable with a computed name',
        { extension: [calculated('defineVariable(%resource.id).select(%a)')] },
      ],
      [
        'an uncatalogued FHIRPath expression that names it',
        {
          extension: [
            {
              url: 'http://example.org/custom',
              valueExpression: { language: 'text/fhirpath', expression: '%a' },
            },
          ],
        },
      ],
      [
        'a questionnaire-constraint',
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-constraint',
              extension: [
                { url: 'key', valueId: 'k1' },
                { url: 'severity', valueCode: 'error' },
                { url: 'expression', valueString: '%a > 0' },
              ],
            },
          ],
        },
      ],
      [
        'a subQuestionnaire',
        {
          extension: [
            { url: `${sdc}subQuestionnaire`, valueCanonical: 'http://example.org/Questionnaire/m' },
          ],
        },
      ],
    ])('reports nothing when a descendant has %s', (_, consumer) => {
      expect(notReportedWith(consumer)).toEqual([]);
    });

    it('still reports when the uncatalogued expression names something else', () => {
      expect(
        notReportedWith({
          extension: [
            {
              url: 'http://example.org/custom',
              valueExpression: { language: 'text/fhirpath', expression: '%b' },
            },
          ],
        }),
      ).toEqual([at(0)]);
    });

    it('still reports when the consumer could not see it: on a sibling, the root or in extraction', () => {
      const cql = expression('calculatedExpression', undefined, '%a', 'text/cql');
      expect(
        reported({
          extension: [expression('itemPopulationContext', undefined, '%a', 'text/cql')],
          item: [
            { linkId: 'x', extension: [variable('a')] },
            { linkId: 'y', extension: [cql] },
            {
              linkId: 'z',
              extension: [
                variable('b'),
                expression('itemExtractionContext', undefined, 'b', 'text/cql'),
              ],
            },
          ],
        }),
      ).toEqual([at(0, '/item/0'), at(0, '/item/2')]);
    });

    it('does not report a variable that is used, whatever else is not analysed', () => {
      expect(
        notReportedWith({
          extension: [
            calculated('%a'),
            expression('calculatedExpression', undefined, 'x', 'text/cql'),
          ],
        }),
      ).toEqual([]);
    });
  });
});

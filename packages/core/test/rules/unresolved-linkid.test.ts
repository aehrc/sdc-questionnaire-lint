import { describe, expect, it } from 'vitest';
import { lintQuestionnaire } from '../support/rules.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function expression(extension: string, text: string, language = 'text/fhirpath') {
  return { url: `${sdc}${extension}`, valueExpression: { language, expression: text } };
}

const calculated = (text: string) => expression('calculatedExpression', text);
const variable = (name: string, text: string, language = 'text/fhirpath') => ({
  url: 'http://hl7.org/fhir/StructureDefinition/variable',
  valueExpression: { name, language, expression: text },
});

// A form with a group g, its child a, and a's child c, nested under its answers in a response.
const form = (extension: unknown[], more: Record<string, unknown> = {}) => ({
  item: [
    {
      linkId: 'g',
      type: 'group',
      item: [
        {
          linkId: 'a',
          text: 'Smoker',
          type: 'boolean',
          extension,
          item: [{ linkId: 'c', type: 'string' }],
        },
      ],
    },
  ],
  ...more,
});

const lintResource = (resource: Record<string, unknown>) =>
  lintQuestionnaire('unresolved-linkid', resource);

// The linkId of each finding's message.
const reported = (resource: Record<string, unknown>) =>
  lintResource(resource).map(({ message }) => /linkId '(.*)'\.$/.exec(message)?.[1]);

describe('sdc/unresolved-linkid', () => {
  it('reports a linkId that no item has, at its string literal', () => {
    const text = "%resource.repeat(item).where(linkId = 'smokr').answer.value";
    const findings = lintResource({
      item: [
        { linkId: 'smoker', type: 'boolean' },
        { linkId: 'q', extension: [calculated(text)] },
      ],
    });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/unresolved-linkid',
        severity: 'warning',
        message: "No item in this Questionnaire has linkId 'smokr'.",
        help: "an item with a similar linkId exists: 'smoker'",
        jsonLocation: {
          file: 'Q.json',
          pointer: '/item/1/extension/0/valueExpression/expression',
          resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          linkId: 'q',
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text, range: { startOffset: 38, endOffset: 45 } },
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('helps without a suggestion when no linkId is similar', () => {
    const [finding] = lintResource(
      form([calculated("%resource.repeat(item).where(linkId = 'zzz')")]),
    );
    expect(finding?.help).toBe("correct the linkId, or add an item with linkId 'zzz'");
  });

  it.each([
    ["%questionnaire.item.where(linkId = 'typo')"],
    ["%questionnaire.repeat(item).where(linkId = 'typo')"],
    ["%qitem.item.where(linkId = 'typo')"],
    ["%qitem.repeat(item).where(linkId = 'typo')"],
    ["%resource.item.where(linkId = 'typo')"],
    ["%resource.repeat(item | answer.item).where(linkId = 'typo')"],
    ["%context.item.where(linkId = 'typo')"],
    ["item.where(linkId = 'typo').answer.value"],
    ["iif(item.where(linkId = 'typo').answer.value = true, 1, 0)"],
  ])('reports a missing linkId at an item site in %s', (text) => {
    expect(reported(form([calculated(text)]))).toEqual(['typo']);
  });

  it.each([
    ["%questionnaire.item.where(linkId = 'typo')"],
    ["%resource.item.where(linkId = 'typo')"],
    ["%context.item.where(linkId = 'typo')"],
    ["item.where(linkId = 'typo').answer.value"],
    ["repeat(item).where(linkId = 'typo').answer.value"],
  ])('reports a missing linkId at a root site in %s', (text) => {
    expect(reported(form([], { extension: [variable('v', text)] }))).toEqual(['typo']);
  });

  it('reports in a {{…}} fragment of a query, at the literal in the query', () => {
    const query = "Observation?code={{item.where(linkId = 'typo').answer.value.code}}";
    const [finding] = lintResource(form([variable('obs', query, 'application/x-fhir-query')]));
    expect(finding?.expression).toEqual({
      text: query,
      range: { startOffset: 39, endOffset: 45 },
    });
  });

  it('accepts a linkId of any item of this Questionnaire, at any depth and through answers', () => {
    expect(
      reported(
        form([
          calculated("%resource.repeat(item | answer.item).where(linkId = 'c').answer.value"),
          calculated("%questionnaire.repeat(item).where(linkId = 'a').item.where(linkId = 'c')"),
          calculated("item.where(linkId = 'c').answer.value"),
        ]),
      ),
    ).toEqual([]);
  });

  it('accepts a known linkId searched at the wrong depth or child path', () => {
    expect(
      reported(
        form([
          calculated("%resource.item.where(linkId = 'c').answer.value"),
          calculated("%resource.repeat(item).where(linkId = 'c').answer.value"),
          calculated("%qitem.item.where(linkId = 'g')"),
        ]),
      ),
    ).toEqual([]);
  });

  it('reports each missing linkId of a chain', () => {
    expect(
      reported(
        form([calculated("item.where(linkId = 'x').item.where(linkId = 'y').answer.value")]),
      ),
    ).toEqual(['x', 'y']);
  });

  it.each([
    ["%resource.repeat(item).where(linkId = 'typo').exists()"],
    ["%resource.repeat(item).where(linkId = 'typo').empty()"],
    ["%resource.repeat(item).where(linkId = 'typo').count() = 0"],
  ])('does not report a deliberate absence probe: %s', (text) => {
    expect(reported(form([calculated(text)]))).toEqual([]);
  });

  it('reports a selector whose answers are tested', () => {
    expect(
      reported(
        form([calculated("%resource.repeat(item).where(linkId = 'typo').answer.value.exists()")]),
      ),
    ).toEqual(['typo']);
  });

  it.each([
    ['a foreign response', "%previousResponse.item.where(linkId = 'typo')"],
    ['an alias', "%group.item.where(linkId = 'typo')"],
    [
      'descendants, which reach contained resources',
      "%resource.descendants().where(linkId = 'typo')",
    ],
    ['a computed linkId', "item.where(linkId = %prefix + 'typo')"],
  ])('does not report a reference to %s', (_, text) => {
    expect(reported(form([calculated(text)]))).toEqual([]);
  });

  it('does not infer an item target from %qitem at a root site', () => {
    expect(
      reported(form([], { extension: [variable('v', "%qitem.item.where(linkId = 'typo')")] })),
    ).toEqual([]);
  });

  it('reports a linkId that only an item of a contained Questionnaire has', () => {
    const contained = {
      resourceType: 'Questionnaire',
      id: 'other',
      item: [{ linkId: 'foreign', type: 'string' }],
    };
    expect(
      reported(
        form([calculated("%resource.repeat(item).where(linkId = 'foreign').answer.value")], {
          contained: [contained],
        }),
      ),
    ).toEqual(['foreign']);
  });

  it('does not check expressions in a contained resource', () => {
    const contained = {
      resourceType: 'Questionnaire',
      id: 'other',
      item: [
        {
          linkId: 'foreign',
          extension: [calculated("%resource.repeat(item).where(linkId = 'typo').answer.value")],
        },
      ],
    };
    expect(reported(form([], { contained: [contained] }))).toEqual([]);
  });

  it('does not check CQL', () => {
    expect(
      reported(
        form([expression('calculatedExpression', "item.where(linkId = 'typo')", 'text/cql')]),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'includes a module',
      {
        item: [
          {
            linkId: 'm',
            type: 'display',
            extension: [{ url: `${sdc}subQuestionnaire`, valueCanonical: 'http://x/Q/m' }],
          },
        ],
      },
    ],
    [
      'lists assembleContext names',
      { extension: [{ url: `${sdc}assembleContext`, valueString: 'p' }] },
    ],
    [
      'can be assembled as a child',
      { extension: [{ url: `${sdc}assemble-expectation`, valueCode: 'assemble-child' }] },
    ],
  ])(
    'does not report in a Questionnaire that %s, whose assembled form has other items',
    (_, more) => {
      const resource = form([calculated("%resource.repeat(item).where(linkId = 'typo')")]);
      expect(
        reported({
          ...resource,
          ...more,
          item: [...resource.item, ...((more as { item?: unknown[] }).item ?? [])],
        }),
      ).toEqual([]);
    },
  );
});

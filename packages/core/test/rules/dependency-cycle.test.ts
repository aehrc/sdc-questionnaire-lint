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

const variable = (name: string, text: string) => expression('variable', name, text);

const lintResource = (resource: Record<string, unknown>) =>
  lintQuestionnaire('dependency-cycle', resource);

// The message of each finding, with the pointers of its location and related locations.
const reported = (resource: Record<string, unknown>) =>
  lintResource(resource).map((finding) => ({
    message: finding.message,
    pointers: [finding.jsonLocation, ...(finding.relatedLocations ?? [])].map((location) =>
      'kind' in location
        ? location.kind === 'questionnaire'
          ? location.jsonLocation.pointer
          : undefined
        : location.pointer,
    ),
  }));

const at = (index: number) => `/extension/${String(index)}/valueExpression/expression`;

const help =
  'Break the dependency cycle or verify that these expressions reach stable values in the ' +
  'form filler.';

describe('sdc/dependency-cycle', () => {
  it('reports two variables that reference each other, at the first, with the other as related', () => {
    const findings = lintResource({ extension: [variable('a', '%b + 1'), variable('b', '%a')] });
    expect(findings).toEqual([
      {
        kind: 'questionnaire',
        ruleId: 'sdc/dependency-cycle',
        severity: 'warning',
        message:
          'Declarations %a and %b reference each other; updates may not reach a stable value.',
        help,
        jsonLocation: {
          file: 'Q.json',
          pointer: at(0),
          resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
        },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
        expression: { text: '%b + 1' },
        relatedLocations: [
          {
            kind: 'questionnaire',
            jsonLocation: {
              file: 'Q.json',
              pointer: at(1),
              resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
            },
            sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
            message: '%b is declared here',
          },
        ],
        fingerprint: expect.any(String) as string,
      },
    ]);
  });

  it('reports a declaration that references itself, in the singular', () => {
    expect(reported({ extension: [variable('self', '%self * 0')] })).toEqual([
      {
        message: 'Declaration %self references itself; updates may not reach a stable value.',
        pointers: [at(0)],
      },
    ]);
  });

  it('reports a component of three declarations once, in document order, without what leads into it', () => {
    expect(
      reported({
        extension: [
          variable('into', '%c'),
          variable('c', '%a'),
          variable('a', '%b'),
          variable('b', '%c'),
        ],
      }),
    ).toEqual([
      {
        message:
          'Declarations %c, %a and %b reference each other; updates may not reach a stable value.',
        pointers: [at(1), at(2), at(3)],
      },
    ]);
  });

  it('reports one component that holds several cycles once, and each separate component', () => {
    expect(
      reported({
        extension: [
          variable('a', '%b | %c'),
          variable('b', '%a'),
          variable('c', '%a'),
          variable('d', '%d'),
        ],
      }),
    ).toEqual([
      {
        message:
          'Declarations %a, %b and %c reference each other; updates may not reach a stable value.',
        pointers: [at(0), at(1), at(2)],
      },
      {
        message: 'Declaration %d references itself; updates may not reach a stable value.',
        pointers: [at(3)],
      },
    ]);
  });

  it.each([
    ['a lazy branch', 'iif(false, %b, 1)'],
    ['an unconditional expression', '1 - %b'],
  ])('reports a cycle through %s, as a warning', (_, text) => {
    expect(lintResource({ extension: [variable('a', text), variable('b', '%a')] })).toMatchObject([
      { severity: 'warning', jsonLocation: { pointer: at(0) } },
    ]);
  });

  it('reports a cycle among other named expressions on an item', () => {
    expect(
      reported({
        item: [
          {
            linkId: 'q',
            extension: [
              expression('initialExpression', 'init', '%calc'),
              expression('calculatedExpression', 'calc', '%init + 1'),
            ],
          },
        ],
      }),
    ).toMatchObject([
      {
        message:
          'Declarations %init and %calc reference each other; updates may not reach a stable value.',
        pointers: [
          '/item/0/extension/0/valueExpression/expression',
          '/item/0/extension/1/valueExpression/expression',
        ],
      },
    ]);
  });

  it('follows a reference in a {{…}} fragment of a query', () => {
    expect(
      reported({
        extension: [
          expression('variable', 'obs', 'Observation?code={{%code}}', 'application/x-fhir-query'),
          variable('code', '%obs.code'),
        ],
      }),
    ).toMatchObject([{ pointers: [at(0), at(1)] }]);
  });

  it('does not report a declaration whose own name in its expression means the binding outward (D25)', () => {
    expect(
      reported({
        extension: [
          { url: `${sdc}assembleContext`, valueString: 'linkIdPrefix' },
          variable('a', '1'),
        ],
        item: [
          {
            linkId: 'q',
            extension: [
              variable('linkIdPrefix', "%linkIdPrefix + 'name.'"),
              variable('a', '%a + 1'),
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("follows a declaration's own name outward, and other names to the innermost declaration (D25)", () => {
    expect(
      reported({
        extension: [variable('x', '1')],
        item: [{ linkId: 'q', extension: [variable('x', '%x + %y'), variable('y', '%x')] }],
      }),
    ).toEqual([
      {
        message:
          'Declarations %x and %y reference each other; updates may not reach a stable value.',
        pointers: [
          '/item/0/extension/0/valueExpression/expression',
          '/item/0/extension/1/valueExpression/expression',
        ],
      },
    ]);
  });

  it('does not take a duplicate on the same element for the binding outward (D25)', () => {
    expect(
      reported({
        extension: [variable('x', '1')],
        item: [{ linkId: 'q', extension: [variable('x', '%x'), variable('x', '%x')] }],
      }),
    ).toEqual([]);
  });

  it('does not follow a reference to a declaration that is not available at the site (D19)', () => {
    expect(
      reported({
        extension: [variable('x', '%ctx'), expression('itemExtractionContext', 'ctx', '%x')],
      }),
    ).toEqual([]);
  });

  it('does not follow a name defineVariable binds, a reference after a computed one, or an unnamed expression', () => {
    expect(
      reported({
        extension: [
          variable('a', "defineVariable('a', 1).select(%a)"),
          variable('b', 'defineVariable(%c.first(), 1).select(%b)'),
          variable('c', '1'),
          variable('d', '%e'),
          variable('e', '1'),
          expression('calculatedExpression', undefined, '%d'),
        ],
      }),
    ).toEqual([]);
  });

  it('does not report expressions that do not parse, other languages, or contained resources', () => {
    expect(
      reported({
        extension: [
          variable('a', '%b.where('),
          variable('b', '%a'),
          expression('variable', 'c', '%c', 'text/cql'),
        ],
        contained: [{ resourceType: 'Questionnaire', extension: [variable('d', '%d')] }],
      }),
    ).toEqual([]);
  });
});

// Reproduces, against @aehrc/sdc-template-extract 1.0.15, which contained resources extraction
// uses as templates (src/facts/extraction.ts). Each test asserts the code.text of the extracted
// resources, which observation() sets to the template's id.
import { describe, expect, it } from 'vitest';
import { questionnaire, sdc } from '../support/sites.js';
import { extract, observation, responseTo, templateExtract } from './extract.js';

type Json = Record<string, unknown>;

const group = (linkId: string, extension: readonly Json[], item: readonly Json[] = []): Json => ({
  linkId,
  type: 'group',
  extension,
  item: [...item, { linkId: `${linkId}-a`, type: 'string' }],
});
const answered = (linkId: string, item: readonly Json[] = []): Json => ({
  linkId,
  item: [...item, { linkId: `${linkId}-a`, answer: [{ valueString: linkId }] }],
});
const skipped =
  'Questionnaire does not contain any "sdc-questionnaire-templateExtract" extensions. Skipping extraction.';

// The code.text of each extracted resource.
async function extracted(
  fields: Json,
  response: Json = responseTo([answered('g')]),
): Promise<{ success: boolean; issues: readonly string[]; templates: unknown[] }> {
  const { success, issues, resources } = await extract(questionnaire(fields), response);
  return {
    success,
    issues,
    templates: resources.map((resource) => (resource.code as Json).text),
  };
}

describe('template-extract 1.0.15 templates', () => {
  it('extracts the template of the first #id template slice of an item', async () => {
    const { templates } = await extracted({
      contained: [observation('a'), observation('b'), observation('c')],
      item: [group('g', [templateExtract('Observation/a', '#b', '#c')])],
    });
    expect(templates).toEqual(['b']);
  });

  it('extracts nothing for a bare # first slice, a full URL or a missing slice', async () => {
    for (const extension of [
      templateExtract('#', '#b'),
      templateExtract('http://example.org/fhir/Observation/b'),
      { url: `${sdc}templateExtract` },
    ]) {
      expect(
        await extracted({
          contained: [observation('b')],
          item: [group('g', [extension])],
        }),
      ).toEqual({ success: false, issues: [skipped], templates: [] });
    }
  });

  it('replaces the references of an earlier item with the same linkId', async () => {
    const { templates } = await extracted(
      {
        contained: [observation('a'), observation('b')],
        item: [group('g', [templateExtract('#a')], [group('g', [templateExtract('#b')])])],
      },
      responseTo([answered('g', [answered('g')])]),
    );
    expect(templates).toEqual(['b']);
  });

  it('extracts a template referenced from several items once, for the last', async () => {
    const { resources } = await extract(
      questionnaire({
        contained: [
          observation('a', {
            component: [
              {
                code: { text: 'c' },
                _valueString: {
                  extension: [
                    { url: `${sdc}templateExtractValue`, valueString: 'item.answer.value' },
                  ],
                },
              },
            ],
          }),
        ],
        item: [group('g', [templateExtract('#a')]), group('h', [templateExtract('#a')])],
      }),
      responseTo([answered('g'), answered('h')]),
    );
    // Its value is evaluated against the response item of h; extraction drops the id.
    expect(resources).toEqual([
      {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'a' },
        component: [{ code: { text: 'c' }, valueString: 'h' }],
      },
    ]);
  });

  it('uses the last contained resource with the id', async () => {
    const { templates } = await extracted({
      contained: [
        observation('a', { code: { text: 'first' } }),
        observation('a', { code: { text: 'last' } }),
      ],
      item: [group('g', [templateExtract('#a')])],
    });
    expect(templates).toEqual(['last']);
  });

  it('ignores a #id that matches no contained resource, without a warning', async () => {
    expect(
      await extracted({
        contained: [observation('a')],
        item: [group('g', [templateExtract('#missing'), templateExtract('#a')])],
      }),
    ).toEqual({ success: true, issues: [], templates: ['a'] });
  });

  it('never extracts a template referenced only from the root, without a warning', async () => {
    expect(
      await extracted({
        contained: [observation('a')],
        extension: [templateExtract('#a')],
        item: [group('g', [])],
      }),
    ).toEqual({ success: true, issues: [], templates: [] });
  });

  it('extracts a root reference for an item with the linkId QuestionnaireLevel', async () => {
    const { templates } = await extracted(
      {
        contained: [observation('a')],
        extension: [templateExtract('#a')],
        item: [group('QuestionnaireLevel', [])],
      },
      responseTo([answered('QuestionnaireLevel')]),
    );
    expect(templates).toEqual(['a']);
  });

  it('does not read templateExtractBundle', async () => {
    expect(
      await extracted({
        contained: [
          {
            resourceType: 'Bundle',
            id: 'bundle',
            type: 'transaction',
            entry: [{ resource: observation('a') }],
          },
        ],
        item: [
          group('g', [
            { url: `${sdc}templateExtractBundle`, valueReference: { reference: '#bundle' } },
          ]),
        ],
      }),
    ).toEqual({ success: false, issues: [skipped], templates: [] });
  });
});

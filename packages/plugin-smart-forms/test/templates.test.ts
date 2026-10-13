// The template reader against the selection test/reproduction/extract-templates.test.ts reproduces
// against template-extract 1.0.15: each case here mirrors one there.
import { describe, expect, it } from 'vitest';
import { extractedTemplates } from '../src/templates.js';
import { documentOf, questionnaire, sdc, templateExtract } from './support/sites.js';

type Json = Record<string, unknown>;

const group = (linkId: string, extension: readonly Json[], item: readonly Json[] = []): Json => ({
  linkId,
  type: 'group',
  extension,
  item,
});
const observation = (id: string): Json => ({ resourceType: 'Observation', id });

// The ids of the templates extraction uses.
const templates = (fields: Json): unknown[] => {
  const resource = questionnaire(fields);
  const contained = resource.contained as Json[];
  return extractedTemplates(documentOf(resource)).map((index) => contained[index]?.id);
};

describe('extractedTemplates', () => {
  it('reads the first #id template slice of an item', () => {
    expect(
      templates({
        contained: [observation('a'), observation('b'), observation('c')],
        item: [group('g', [templateExtract('Observation/a', '#b', '#c')])],
      }),
    ).toEqual(['b']);
  });

  it('reads nothing for a bare # first slice, a full URL or a missing slice', () => {
    for (const extension of [
      templateExtract('#', '#b'),
      templateExtract('http://example.org/fhir/Observation/b'),
      { url: `${sdc}templateExtract` },
    ]) {
      expect(templates({ contained: [observation('b')], item: [group('g', [extension])] })).toEqual(
        [],
      );
    }
  });

  it('replaces the references of an earlier item with the same linkId', () => {
    expect(
      templates({
        contained: [observation('a'), observation('b')],
        item: [group('g', [templateExtract('#a')], [group('g', [templateExtract('#b')])])],
      }),
    ).toEqual(['b']);
  });

  it('reads a template referenced from several items once', () => {
    expect(
      templates({
        contained: [observation('a')],
        item: [group('g', [templateExtract('#a')]), group('h', [templateExtract('#a')])],
      }),
    ).toEqual(['a']);
  });

  it('uses the last contained resource with the id', () => {
    const resource = questionnaire({
      contained: [observation('a'), observation('a')],
      item: [group('g', [templateExtract('#a')])],
    });
    expect(extractedTemplates(documentOf(resource))).toEqual([1]);
  });

  it('ignores a #id that matches no contained resource', () => {
    expect(
      templates({
        contained: [observation('a')],
        item: [group('g', [templateExtract('#missing'), templateExtract('#a')])],
      }),
    ).toEqual(['a']);
  });

  it('never reads a template referenced only from the root', () => {
    expect(
      templates({
        contained: [observation('a')],
        extension: [templateExtract('#a')],
        item: [group('g', [])],
      }),
    ).toEqual([]);
  });

  it('reads a root reference for an item with the linkId QuestionnaireLevel', () => {
    expect(
      templates({
        contained: [observation('a')],
        extension: [templateExtract('#a')],
        item: [group('QuestionnaireLevel', [])],
      }),
    ).toEqual(['a']);
  });

  it('does not read templateExtractBundle', () => {
    expect(
      templates({
        contained: [{ resourceType: 'Bundle', id: 'bundle' }],
        item: [
          group('g', [
            { url: `${sdc}templateExtractBundle`, valueReference: { reference: '#bundle' } },
          ]),
        ],
      }),
    ).toEqual([]);
  });
});

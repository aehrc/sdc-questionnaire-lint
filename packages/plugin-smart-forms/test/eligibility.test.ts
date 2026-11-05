/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { readBy } from '../src/eligibility.js';
import {
  analyse,
  CQF_EXPRESSION,
  expression,
  ext,
  questionnaire,
  sdc,
  targetConstraint,
  toggle,
  VARIABLE,
} from './support/sites.js';

const compat = { renderer: '1.4.0', populate: '4.7.1' };
const fhirpath = (text = 'true', name?: string) => expression('text/fhirpath', text, name);
const cql = (text = 'true', name?: string) => expression('text/cql', text, name);

// The readers of the Expression site at a pointer, as component:handling.
function readersAt(resource: Record<string, unknown>, expressionPointer: string): string[] {
  const { document, sites } = analyse(resource);
  const site = sites.find(
    (each) => each.expressionPointer === expressionPointer && each.carrier === 'expression',
  );
  if (site === undefined) throw new Error(`no site at ${expressionPointer}`);
  return readBy({ document, compat }, site).map(
    ({ component, handling }) => `${component}:${handling}`,
  );
}

function item(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { linkId: 'q', type: 'string', ...fields };
}

const onItem = (...extension: unknown[]) => questionnaire({ item: [item({ extension })] });

describe('readBy', () => {
  it('finds both components reading root and item variables', () => {
    const both = ['renderer:fhirpath-or-query', 'populate:fhirpath-or-query'];
    expect(
      readersAt(
        questionnaire({ extension: [ext(VARIABLE, cql('1', 'x'))] }),
        '/extension/0/valueExpression',
      ),
    ).toEqual(both);
    expect(
      readersAt(onItem(ext(VARIABLE, cql('1', 'x'))), '/item/0/extension/0/valueExpression'),
    ).toEqual(both);
  });

  it.each(['calculatedExpression', 'enableWhenExpression', 'answerExpression'])(
    'finds the renderer reading %s, FHIRPath only',
    (name) => {
      expect(
        readersAt(onItem(ext(`${sdc}${name}`, cql())), '/item/0/extension/0/valueExpression'),
      ).toEqual(['renderer:fhirpath-only']);
    },
  );

  it.each(['text', 'prefix', 'answerValueSet'])(
    'finds the renderer reading cqf-expression on _%s, FHIRPath only',
    (element) => {
      const resource = questionnaire({
        item: [item({ [`_${element}`]: { extension: [ext(CQF_EXPRESSION, cql())] } })],
      });
      expect(readersAt(resource, `/item/0/_${element}/extension/0/valueExpression`)).toEqual([
        'renderer:fhirpath-only',
      ]);
    },
  );

  it('finds nothing reading the root _title cqf-expression', () => {
    const resource = questionnaire({ _title: { extension: [ext(CQF_EXPRESSION, cql())] } });
    expect(readersAt(resource, '/_title/extension/0/valueExpression')).toEqual([]);
  });

  it('finds nothing reading candidateExpression, contextExpression or itemExtractionContext', () => {
    const resource = onItem(
      ext(`${sdc}candidateExpression`, cql()),
      {
        url: `${sdc}contextExpression`,
        extension: [{ url: 'expression', valueExpression: cql() }],
      },
      ext(`${sdc}itemExtractionContext`, cql()),
    );
    expect(readersAt(resource, '/item/0/extension/0/valueExpression')).toEqual([]);
    expect(readersAt(resource, '/item/0/extension/1/extension/0/valueExpression')).toEqual([]);
    expect(readersAt(resource, '/item/0/extension/2/valueExpression')).toEqual([]);
  });

  it('finds nothing reading an uncatalogued site or a fragment site', () => {
    const resource = questionnaire({
      extension: [
        ext(VARIABLE, expression('application/x-fhir-query', 'Patient?_id={{%patient.id}}', 'p')),
      ],
      contained: [{ resourceType: 'Library', id: 'l', extension: [ext(VARIABLE, cql())] }],
    });
    const { document, sites } = analyse(resource);
    const fragment = sites.find((site) => site.carrier === 'fragment');
    const uncatalogued = sites.find((site) => !site.catalogued);
    expect(fragment).toBeDefined();
    expect(uncatalogued).toBeDefined();
    for (const site of [fragment, uncatalogued]) {
      if (site !== undefined) expect(readBy({ document, compat }, site)).toEqual([]);
    }
  });

  describe.each(['initialExpression', 'enableWhenExpression', 'answerExpression'])(
    'the renderer and %s',
    (name) => {
      const at = (index: number) => `/item/0/extension/${String(index)}/valueExpression`;
      const of = (language: Record<string, unknown>) => ext(`${sdc}${name}`, language);
      const rendererReads = (resource: Record<string, unknown>, index: number) =>
        readersAt(resource, at(index)).includes('renderer:fhirpath-only');

      it('reads a lone text/fhirpath one', () => {
        expect(rendererReads(onItem(of(fhirpath())), 0)).toBe(true);
      });

      it('does not read a second text/fhirpath one', () => {
        expect(rendererReads(onItem(of(fhirpath()), of(fhirpath())), 1)).toBe(false);
      });

      it('reads a text/fhirpath one after a text/cql one', () => {
        const resource = onItem(of(cql()), of(fhirpath()));
        expect(rendererReads(resource, 0)).toBe(true);
        expect(rendererReads(resource, 1)).toBe(true);
      });
    },
  );

  describe('initialExpression', () => {
    const initial = (text = 'true') => ext(`${sdc}initialExpression`, cql(text));

    it('is evaluated as FHIRPath by population and read as FHIRPath by the renderer', () => {
      expect(readersAt(onItem(initial()), '/item/0/extension/0/valueExpression')).toEqual([
        'renderer:fhirpath-only',
        'populate:any-as-fhirpath',
      ]);
    });

    it('after a text/cql one, is read by the renderer only, which never reads the first', () => {
      const resource = onItem(initial(), ext(`${sdc}initialExpression`, fhirpath()));
      expect(readersAt(resource, '/item/0/extension/0/valueExpression')).toEqual([
        'renderer:fhirpath-only',
        'populate:any-as-fhirpath',
      ]);
      expect(readersAt(resource, '/item/0/extension/1/valueExpression')).toEqual([
        'renderer:fhirpath-only',
      ]);
    });

    it('is not read by population when it is not the first on the item', () => {
      expect(
        readersAt(onItem(initial(), initial()), '/item/0/extension/1/valueExpression'),
      ).toEqual(['renderer:fhirpath-only']);
    });

    const context = (name: string) =>
      ext(`${sdc}itemPopulationContext`, fhirpath(`%bundle.entry.resource`, name));
    const repeatingGroup = (linkId: string, extension: unknown[], children: unknown[]) => ({
      linkId,
      type: 'group',
      repeats: true,
      extension,
      item: children,
    });

    it('is evaluated in a repeating group below a repeating group without a context', () => {
      // Outside any context, every item's initialExpression is evaluated once.
      const resource = questionnaire({
        item: [repeatingGroup('g', [], [item({ extension: [initial()] })])],
      });
      expect(readersAt(resource, '/item/0/item/0/extension/0/valueExpression')).toContain(
        'populate:any-as-fhirpath',
      );
    });

    it('is evaluated on a direct child of a repeating context group when a child names the context', () => {
      const resource = questionnaire({
        item: [
          repeatingGroup(
            'g',
            [context('ctx')],
            [
              item({
                linkId: 'a',
                extension: [ext(`${sdc}initialExpression`, fhirpath('%ctx.id'))],
              }),
              item({ linkId: 'b', extension: [initial()] }),
            ],
          ),
        ],
      });
      expect(readersAt(resource, '/item/0/item/1/extension/0/valueExpression')).toContain(
        'populate:any-as-fhirpath',
      );
    });

    it('is not evaluated on a direct child of a repeating context group when no child names a context', () => {
      const resource = questionnaire({
        item: [
          repeatingGroup('g', [context('ctx')], [item({ linkId: 'b', extension: [initial()] })]),
        ],
      });
      expect(readersAt(resource, '/item/0/item/0/extension/0/valueExpression')).toEqual([
        'renderer:fhirpath-only',
      ]);
    });

    it('is not evaluated below a non-repeating group inside a repeating context group', () => {
      const resource = questionnaire({
        item: [
          repeatingGroup(
            'g',
            [context('ctx')],
            [
              item({
                linkId: 'a',
                extension: [ext(`${sdc}initialExpression`, fhirpath('%ctx.id'))],
              }),
              {
                linkId: 'inner',
                type: 'group',
                item: [item({ linkId: 'b', extension: [initial()] })],
              },
            ],
          ),
        ],
      });
      expect(readersAt(resource, '/item/0/item/1/item/0/extension/0/valueExpression')).toEqual([
        'renderer:fhirpath-only',
      ]);
    });

    it('is evaluated on a direct child of a nested repeating group with a context of its own', () => {
      const resource = questionnaire({
        item: [
          repeatingGroup(
            'g',
            [context('outer')],
            [
              item({
                linkId: 'a',
                extension: [ext(`${sdc}initialExpression`, fhirpath('%outer.id'))],
              }),
              repeatingGroup(
                'inner',
                [context('inner')],
                [
                  item({
                    linkId: 'c',
                    extension: [ext(`${sdc}initialExpression`, fhirpath('%inner.id'))],
                  }),
                  item({ linkId: 'd', extension: [initial()] }),
                ],
              ),
            ],
          ),
        ],
      });
      expect(readersAt(resource, '/item/0/item/1/item/1/extension/0/valueExpression')).toContain(
        'populate:any-as-fhirpath',
      );
    });

    it('is not evaluated on a direct child of a nested repeating group without a context', () => {
      const resource = questionnaire({
        item: [
          repeatingGroup(
            'g',
            [context('outer')],
            [
              item({
                linkId: 'a',
                extension: [ext(`${sdc}initialExpression`, fhirpath('%outer.id'))],
              }),
              repeatingGroup(
                'inner',
                [],
                [
                  item({
                    linkId: 'c',
                    extension: [ext(`${sdc}initialExpression`, fhirpath('%outer.id'))],
                  }),
                  item({ linkId: 'd', extension: [initial()] }),
                ],
              ),
            ],
          ),
        ],
      });
      expect(readersAt(resource, '/item/0/item/1/item/1/extension/0/valueExpression')).toEqual([
        'renderer:fhirpath-only',
      ]);
    });
  });

  describe('itemPopulationContext', () => {
    const group = (extension: unknown[]) =>
      questionnaire({ item: [{ linkId: 'g', type: 'group', extension, item: [item()] }] });
    const context = (name?: string, text = 'Patient?_id=1') =>
      ext(`${sdc}itemPopulationContext`, expression('application/x-fhir-query', text, name));

    it('is evaluated as FHIRPath by population on a group with child items', () => {
      expect(readersAt(group([context('p')]), '/item/0/extension/0/valueExpression')).toEqual([
        'populate:any-as-fhirpath',
      ]);
    });

    it('is read by nothing on the root or on an item without child items', () => {
      expect(
        readersAt(questionnaire({ extension: [context('p')] }), '/extension/0/valueExpression'),
      ).toEqual([]);
      expect(readersAt(onItem(context('p')), '/item/0/extension/0/valueExpression')).toEqual([]);
    });

    it('is read by nothing without a name', () => {
      expect(readersAt(group([context()]), '/item/0/extension/0/valueExpression')).toEqual([]);
    });

    it('is read by nothing when a later group in the form has one with the same name', () => {
      const resource = questionnaire({
        item: [
          { linkId: 'a', type: 'group', extension: [context('p')], item: [item()] },
          { linkId: 'b', type: 'group', extension: [context('p')], item: [item({ linkId: 'c' })] },
        ],
      });
      expect(readersAt(resource, '/item/0/extension/0/valueExpression')).toEqual([]);
      expect(readersAt(resource, '/item/1/extension/0/valueExpression')).toEqual([
        'populate:any-as-fhirpath',
      ]);
    });

    it('is read by nothing when it is not the first on the item', () => {
      expect(
        readersAt(group([context('p'), context('q')]), '/item/0/extension/1/valueExpression'),
      ).toEqual([]);
    });
  });

  describe('targetConstraint', () => {
    it('is evaluated as FHIRPath by the renderer on the root and on items', () => {
      expect(
        readersAt(
          questionnaire({ extension: [targetConstraint(cql())] }),
          '/extension/0/extension/2/valueExpression',
        ),
      ).toEqual(['renderer:any-as-fhirpath']);
      expect(
        readersAt(
          onItem(targetConstraint(cql())),
          '/item/0/extension/0/extension/2/valueExpression',
        ),
      ).toEqual(['renderer:any-as-fhirpath']);
    });

    it.each([
      ['without a key', { key: undefined }],
      ['with an empty key', { key: { url: 'key', valueId: '' } }],
      ['without a severity', { severity: undefined }],
      ['with severity fatal', { severity: { url: 'severity', valueCode: 'fatal' } }],
      ['without a human', { human: undefined }],
    ])('is read by nothing %s', (_, parts: Record<string, unknown>) => {
      const resource = onItem(targetConstraint(cql(), parts as never));
      // The expression follows the key and the severity that are present.
      const index = ['key', 'severity'].filter((part) => !(part in parts) || parts[part]).length;
      expect(
        readersAt(resource, `/item/0/extension/0/extension/${String(index)}/valueExpression`),
      ).toEqual([]);
    });

    it('accepts severity warning', () => {
      const resource = onItem(
        targetConstraint(cql(), { severity: { url: 'severity', valueCode: 'warning' } }),
      );
      expect(readersAt(resource, '/item/0/extension/0/extension/2/valueExpression')).toEqual([
        'renderer:any-as-fhirpath',
      ]);
    });

    it('is read by nothing when a later one in the form has the same key', () => {
      const resource = questionnaire({
        extension: [targetConstraint(cql())],
        item: [item({ extension: [targetConstraint(fhirpath())] })],
      });
      expect(readersAt(resource, '/extension/0/extension/2/valueExpression')).toEqual([]);
      expect(readersAt(resource, '/item/0/extension/0/extension/2/valueExpression')).toEqual([
        'renderer:any-as-fhirpath',
      ]);
    });

    it('is not replaced by a later one with the same key that the renderer does not build', () => {
      const resource = questionnaire({
        extension: [targetConstraint(cql())],
        item: [item({ extension: [targetConstraint(fhirpath(), { human: undefined })] })],
      });
      expect(readersAt(resource, '/extension/0/extension/2/valueExpression')).toEqual([
        'renderer:any-as-fhirpath',
      ]);
    });

    it('reads only the first expression sub-extension', () => {
      const constraint = targetConstraint(fhirpath());
      (constraint.extension as unknown[]).push({ url: 'expression', valueExpression: cql() });
      expect(
        readersAt(onItem(constraint), '/item/0/extension/0/extension/4/valueExpression'),
      ).toEqual([]);
    });
  });

  describe('answerOptionsToggleExpression', () => {
    it('is evaluated as FHIRPath by the renderer with an option', () => {
      expect(
        readersAt(onItem(toggle(cql())), '/item/0/extension/0/extension/1/valueExpression'),
      ).toEqual(['renderer:any-as-fhirpath']);
    });

    it('is read by nothing without an option, or with an option of another type', () => {
      expect(
        readersAt(
          onItem(toggle(cql(), { option: undefined })),
          '/item/0/extension/0/extension/0/valueExpression',
        ),
      ).toEqual([]);
      expect(
        readersAt(
          onItem(toggle(cql(), { option: { url: 'option', valueBoolean: true } })),
          '/item/0/extension/0/extension/1/valueExpression',
        ),
      ).toEqual([]);
    });

    it('reads only the first expression sub-extension', () => {
      const extension = toggle(fhirpath());
      (extension.extension as unknown[]).push({ url: 'expression', valueExpression: cql() });
      expect(
        readersAt(onItem(extension), '/item/0/extension/0/extension/2/valueExpression'),
      ).toEqual([]);
    });
  });

  it('crashes when ctx.compat names no renderer or populate version', () => {
    const { document, sites } = analyse(onItem(ext(VARIABLE, cql('1', 'x'))));
    const [site] = sites;
    if (site === undefined) throw new Error('no site');
    expect(() => readBy({ document, compat: { renderer: '1.4.0' } }, site)).toThrow(/populate/);
    expect(() => readBy({ document, compat: undefined as never }, site)).toThrow(/renderer/);
  });

  it('crashes for a selected version that has no facts', () => {
    const { document, sites } = analyse(onItem(ext(VARIABLE, cql('1', 'x'))));
    const [site] = sites;
    if (site === undefined) throw new Error('no site');
    expect(() => readBy({ document, compat: { ...compat, renderer: '9.9.9' } }, site)).toThrow(
      /renderer 9\.9\.9/,
    );
  });
});

import type { SiteItem } from 'sdc-questionnaire-lint';
import { describe, expect, it } from 'vitest';
// Tests only: core's elementName is internal; the plugin's copy must print the same.
import { elementName as coreElementName } from '../../core/src/rules/describe.js';
import { elementName, extensionOf, resolve } from '../src/document.js';
import {
  analyse,
  documentOf,
  ext,
  questionnaire,
  targetConstraint,
  VARIABLE,
} from './support/sites.js';

describe('elementName', () => {
  const document = documentOf(
    questionnaire({
      item: [{ linkId: 'a', text: 'Age "years"' }, { linkId: 'b' }, { text: 'No linkId' }, {}],
    }),
  );
  const items: (SiteItem | undefined)[] = [
    undefined,
    { pointer: '/item/0', linkId: 'a' },
    { pointer: '/item/1', linkId: 'b' },
    { pointer: '/item/2' },
    { pointer: '/item/3' },
  ];

  it('names the root and items as core does', () => {
    expect(items.map((item) => elementName(document, item))).toEqual([
      'the Questionnaire root',
      'item "Age \\"years\\"" (a)',
      'item b',
      'item "No linkId"',
      'an item that has no linkId',
    ]);
    expect(items.map((item) => elementName(document, item))).toEqual(
      items.map((item) => coreElementName(document, item)),
    );
  });
});

describe('resolve', () => {
  it('resolves a pointer from the input file root inside a Bundle', () => {
    const resource = questionnaire({ item: [{ linkId: 'a/b' }] });
    const document = { ...documentOf(resource), resourcePointer: '/entry/0/resource' };
    expect(resolve(document, '/entry/0/resource/item/0/linkId')).toBe('a/b');
    expect(resolve(document, '/entry/0/resource')).toBe(resource);
    expect(resolve(document, '/entry/0/resource/item/1')).toBe(undefined);
  });

  it('decodes ~1 and ~0', () => {
    const document = documentOf(questionnaire({ 'a/b': { '~c': 1 } }));
    expect(resolve(document, '/a~1b/~0c')).toBe(1);
  });
});

describe('extensionOf', () => {
  it('gives the extension holding a site, and the sub-extension of a complex extension', () => {
    const variable = ext(VARIABLE, { language: 'text/fhirpath', expression: '1', name: 'x' });
    const constraint = targetConstraint({ language: 'text/fhirpath', expression: 'true' });
    const { document, sites } = analyse(questionnaire({ extension: [variable, constraint] }));
    const [variableSite, constraintSite] = sites;
    if (variableSite === undefined || constraintSite === undefined) throw new Error('no sites');
    expect(extensionOf(document, variableSite)).toEqual({
      holder: { extension: variable, siblings: [variable, constraint], index: 0 },
    });
    expect(extensionOf(document, constraintSite)).toMatchObject({
      holder: { extension: constraint, index: 1 },
      sub: { index: 2 },
    });
  });
});

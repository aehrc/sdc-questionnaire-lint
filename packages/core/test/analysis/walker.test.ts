import { describe, expect, it } from 'vitest';
import { findSites } from '../../src/analysis/walker.js';
import type { QuestionnaireDocument } from '../../src/plugins/types.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const CQF = 'http://hl7.org/fhir/StructureDefinition/cqf-expression';

function fhirPath(expression: string, name?: string) {
  return { language: 'text/fhirpath', expression, ...(name === undefined ? {} : { name }) };
}

function extension(url: string, valueExpression: object) {
  return { url, valueExpression };
}

function sitesOf(resource: Record<string, unknown>) {
  const document: QuestionnaireDocument = {
    file: 'Questionnaire-Q.json',
    resource: { resourceType: 'Questionnaire', ...resource },
    resourcePointer: '',
    localResources: [],
  };
  return findSites(document);
}

describe('findSites', () => {
  it('finds variables on the root and on an item, with their names and use cases', () => {
    const sites = sitesOf({
      extension: [extension(VARIABLE, fhirPath('1', 'a'))],
      item: [{ linkId: 'q', extension: [extension(VARIABLE, fhirPath('2', 'b'))] }],
    });
    expect(sites).toEqual([
      {
        pointer: '/extension/0/valueExpression/expression',
        expressionPointer: '/extension/0/valueExpression',
        carrier: 'expression',
        location: { url: VARIABLE },
        registered: true,
        language: 'text/fhirpath',
        text: '1',
        name: 'a',
        declares: true,
        useCases: ['rendering', 'population', 'extraction'],
      },
      {
        pointer: '/item/0/extension/0/valueExpression/expression',
        expressionPointer: '/item/0/extension/0/valueExpression',
        carrier: 'expression',
        location: { url: VARIABLE },
        registered: true,
        item: { pointer: '/item/0', linkId: 'q' },
        language: 'text/fhirpath',
        text: '2',
        name: 'b',
        declares: true,
        useCases: ['rendering', 'population', 'extraction'],
      },
    ]);
  });

  it('gives a site on a nested item the innermost item', () => {
    const [site] = sitesOf({
      item: [
        {
          linkId: 'group',
          item: [
            { linkId: 'a' },
            { linkId: 'bmi', extension: [extension(`${sdc}calculatedExpression`, fhirPath('1'))] },
          ],
        },
      ],
    });
    expect(site).toMatchObject({
      pointer: '/item/0/item/1/extension/0/valueExpression/expression',
      item: { pointer: '/item/0/item/1', linkId: 'bmi' },
      location: { url: `${sdc}calculatedExpression` },
      registered: true,
      declares: false,
      useCases: ['rendering'],
    });
  });

  it('registers a cqf-expression on a listed element only', () => {
    const cqf = () => ({ extension: [extension(CQF, fhirPath("'Hi'"))] });
    const sites = sitesOf({ item: [{ linkId: 'q', _text: cqf(), _linkId: cqf() }] });
    expect(sites).toMatchObject([
      { pointer: '/item/0/_text/extension/0/valueExpression/expression', registered: true },
      { pointer: '/item/0/_linkId/extension/0/valueExpression/expression', registered: false },
    ]);
    expect(sites[0]).toMatchObject({ element: 'text', location: { url: CQF } });
    expect(sites[1]).not.toHaveProperty('element');
    expect(sites[1]).not.toHaveProperty('location');
  });

  it('finds the expression sub-extension of an answerOptionsToggleExpression', () => {
    const [site, ...rest] = sitesOf({
      item: [
        {
          linkId: 'q',
          extension: [
            {
              url: `${sdc}answerOptionsToggleExpression`,
              extension: [
                { url: 'option', valueCoding: { code: 'a' } },
                { url: 'expression', valueExpression: fhirPath('true') },
              ],
            },
          ],
        },
      ],
    });
    expect(rest).toEqual([]);
    expect(site).toMatchObject({
      pointer: '/item/0/extension/0/extension/1/valueExpression/expression',
      location: { url: `${sdc}answerOptionsToggleExpression`, subExtension: 'expression' },
      registered: true,
    });
  });

  it('points at the Expression object of a reference-only site, which has no text', () => {
    const [site] = sitesOf({
      item: [
        {
          linkId: 'q',
          extension: [
            extension(`${sdc}initialExpression`, {
              language: 'text/cql',
              reference: 'Library/x#y',
            }),
          ],
        },
      ],
    });
    expect(site).toMatchObject({
      pointer: '/item/0/extension/0/valueExpression',
      expressionPointer: '/item/0/extension/0/valueExpression',
      reference: 'Library/x#y',
      registered: true,
    });
    expect(site).not.toHaveProperty('text');
  });

  it('keeps the enclosing item for an unregistered expression on an answerOption', () => {
    const [site] = sitesOf({
      item: [
        {
          linkId: 'smoking',
          answerOption: [
            {
              valueString: 'Yes',
              extension: [extension('http://example.org/option-enabled', fhirPath('%age > 18'))],
            },
          ],
        },
      ],
    });
    expect(site).toEqual({
      pointer: '/item/0/answerOption/0/extension/0/valueExpression/expression',
      expressionPointer: '/item/0/answerOption/0/extension/0/valueExpression',
      carrier: 'expression',
      registered: false,
      item: { pointer: '/item/0', linkId: 'smoking' },
      language: 'text/fhirpath',
      text: '%age > 18',
      declares: false,
      useCases: [],
    });
  });

  it('treats an expression in a contained resource as unregistered, with no item', () => {
    const [site] = sitesOf({
      contained: [
        {
          resourceType: 'Questionnaire',
          item: [{ linkId: 'q', extension: [extension(VARIABLE, fhirPath('1', 'x'))] }],
        },
      ],
    });
    expect(site).toMatchObject({
      pointer: '/contained/0/item/0/extension/0/valueExpression/expression',
      registered: false,
      declares: false,
    });
    expect(site).not.toHaveProperty('item');
  });

  it('prefixes every pointer with the resource pointer of a Bundle entry', () => {
    const [site] = findSites({
      file: 'Bundle-B.json',
      resource: {
        resourceType: 'Questionnaire',
        item: [{ linkId: 'q', extension: [extension(VARIABLE, fhirPath('1', 'x'))] }],
      },
      resourcePointer: '/entry/1/resource',
      localResources: [],
    });
    expect(site).toMatchObject({
      pointer: '/entry/1/resource/item/0/extension/0/valueExpression/expression',
      expressionPointer: '/entry/1/resource/item/0/extension/0/valueExpression',
      item: { pointer: '/entry/1/resource/item/0', linkId: 'q' },
    });
  });

  it('lists sites in document order across _text, extension and nested items', () => {
    const sites = sitesOf({
      item: [
        {
          linkId: 'a',
          _text: { extension: [extension(CQF, fhirPath('1'))] },
          extension: [extension(`${sdc}enableWhenExpression`, fhirPath('2'))],
          item: [
            { linkId: 'b', extension: [extension(`${sdc}calculatedExpression`, fhirPath('3'))] },
          ],
        },
        { linkId: 'c', extension: [extension(`${sdc}calculatedExpression`, fhirPath('4'))] },
      ],
      extension: [extension(VARIABLE, fhirPath('5', 'v'))],
    });
    expect(sites.map((site) => site.text)).toEqual(['1', '2', '3', '4', '5']);
  });
});

import { describe, expect, it } from 'vitest';
import type { QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const CQF = 'http://hl7.org/fhir/StructureDefinition/cqf-expression';

function fhirPath(expression: string, name?: string) {
  return { language: 'text/fhirpath', expression, ...(name === undefined ? {} : { name }) };
}

function query(expression: string, name?: string) {
  return {
    language: 'application/x-fhir-query',
    expression,
    ...(name === undefined ? {} : { name }),
  };
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
  return findExpressionSites(document);
}

describe('findExpressionSites', () => {
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
        catalogued: true,
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
        catalogued: true,
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
      catalogued: true,
      declares: false,
      useCases: ['rendering'],
    });
  });

  it('registers a cqf-expression on a listed element only', () => {
    const cqf = () => ({ extension: [extension(CQF, fhirPath("'Hi'"))] });
    const sites = sitesOf({ item: [{ linkId: 'q', _text: cqf(), _linkId: cqf() }] });
    expect(sites).toMatchObject([
      { pointer: '/item/0/_text/extension/0/valueExpression/expression', catalogued: true },
      { pointer: '/item/0/_linkId/extension/0/valueExpression/expression', catalogued: false },
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
      catalogued: true,
    });
  });

  it('finds the expression sub-extension of a contextExpression, as SDC STU4 defines it', () => {
    const [site, ...rest] = sitesOf({
      item: [
        {
          linkId: 'q',
          extension: [
            {
              url: `${sdc}contextExpression`,
              extension: [
                { url: 'label', valueString: 'Recent encounters' },
                { url: 'expression', valueExpression: query('Encounter?status=finished') },
              ],
            },
          ],
        },
      ],
    });
    expect(rest).toEqual([]);
    expect(site).toMatchObject({
      pointer: '/item/0/extension/0/extension/1/valueExpression/expression',
      location: { url: `${sdc}contextExpression`, subExtension: 'expression' },
      catalogued: true,
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
      catalogued: true,
    });
    expect(site).not.toHaveProperty('text');
  });

  it('keeps the enclosing item for an uncatalogued expression on an answerOption', () => {
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
      catalogued: false,
      item: { pointer: '/item/0', linkId: 'smoking' },
      language: 'text/fhirpath',
      text: '%age > 18',
      declares: false,
      useCases: [],
    });
  });

  it('treats an expression in a contained resource as uncatalogued, with no item', () => {
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
      catalogued: false,
      declares: false,
    });
    expect(site).not.toHaveProperty('item');
  });

  it('prefixes every pointer with the resource pointer of a Bundle entry', () => {
    const [site] = findExpressionSites({
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

  describe('fragments', () => {
    const POPULATION_CONTEXT = `${sdc}itemPopulationContext`;
    const text = 'Observation?subject={{%patient.id}}&date=gt{{%today}}';

    it('follows a query with one site per fragment, in order', () => {
      const sites = sitesOf({ extension: [extension(POPULATION_CONTEXT, query(text, 'obs'))] });
      expect(sites.map((site) => [site.carrier, site.text])).toEqual([
        ['expression', text],
        ['fragment', '%patient.id'],
        ['fragment', '%today'],
      ]);
      expect(sites[0]).not.toHaveProperty('fragment');
      expect(sites[1]).toEqual({
        pointer: '/extension/0/valueExpression/expression',
        expressionPointer: '/extension/0/valueExpression',
        carrier: 'fragment',
        location: { url: POPULATION_CONTEXT },
        catalogued: true,
        language: 'text/fhirpath',
        text: '%patient.id',
        declares: false,
        useCases: ['population'],
        fragment: { query: text, startOffset: 22, endOffset: 33 },
      });
    });

    it('finds the fragments of a query in the R5 language code', () => {
      const r5 = { ...query(text, 'obs'), language: 'text/x-fhir-query' };
      const sites = sitesOf({ extension: [extension(POPULATION_CONTEXT, r5)] });
      expect(sites.map((site) => [site.carrier, site.language, site.text])).toEqual([
        ['expression', 'text/x-fhir-query', text],
        ['fragment', 'text/fhirpath', '%patient.id'],
        ['fragment', 'text/fhirpath', '%today'],
      ]);
    });

    it('gives the fragments of an uncatalogued query its item and no location', () => {
      const sites = sitesOf({
        item: [{ linkId: 'q', extension: [extension('http://example.org/q', query(text))] }],
      });
      expect(sites).toHaveLength(3);
      for (const site of sites) {
        expect(site).toMatchObject({
          catalogued: false,
          item: { pointer: '/item/0', linkId: 'q' },
        });
        expect(site).not.toHaveProperty('location');
      }
    });

    it('keeps the element of a query on a primitive', () => {
      const sites = sitesOf({
        item: [{ linkId: 'q', _text: { extension: [extension(CQF, query('Patient/{{%id}}'))] } }],
      });
      expect(sites[1]).toMatchObject({ carrier: 'fragment', element: 'text', text: '%id' });
    });

    it('never gives a FHIRPath site fragments', () => {
      const sites = sitesOf({ extension: [extension(VARIABLE, fhirPath("'{{%a}}'", 'v'))] });
      expect(sites.map((site) => site.carrier)).toEqual(['expression']);
    });

    it('gives a query with no text no fragments', () => {
      const reference = { language: 'application/x-fhir-query', reference: '#q' };
      const sites = sitesOf({ extension: [extension(POPULATION_CONTEXT, reference)] });
      expect(sites.map((site) => site.carrier)).toEqual(['expression']);
    });

    it('stops at an unclosed {{, keeping the fragments before it', () => {
      const sites = sitesOf({
        extension: [extension(POPULATION_CONTEXT, query('Patient/{{%a}}?x={{%b', 'p'))],
      });
      expect(sites.map((site) => site.text)).toEqual(['Patient/{{%a}}?x={{%b', '%a']);
    });
  });
});

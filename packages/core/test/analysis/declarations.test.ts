import { describe, expect, it } from 'vitest';
import { findDeclarations } from '../../src/analysis/declarations.js';
import type { QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const LAUNCH_CONTEXT = `${sdc}launchContext`;
const ALLOCATE_ID = `${sdc}extractAllocateId`;

function expression(url: string, name: string | undefined, text = '1') {
  return {
    url,
    valueExpression: {
      language: 'text/fhirpath',
      expression: text,
      ...(name === undefined ? {} : { name }),
    },
  };
}

const variable = (name?: string) => expression(VARIABLE, name);

function launchContext(name: Record<string, unknown>) {
  return {
    url: LAUNCH_CONTEXT,
    extension: [
      { url: 'name', ...name },
      { url: 'type', valueCode: 'Patient' },
    ],
  };
}

const allocateId = (name: string) => ({ url: ALLOCATE_ID, valueString: name });

function declarationsIn(resource: Record<string, unknown>, resourcePointer = '') {
  const document: QuestionnaireDocument = {
    file: 'Questionnaire-Q.json',
    resource: { resourceType: 'Questionnaire', ...resource },
    resourcePointer,
    localResources: [],
  };
  return findDeclarations(document, findExpressionSites(document));
}

describe('findDeclarations', () => {
  it('finds the named Expressions on the root and items, with their kinds and sites', () => {
    const resource = {
      extension: [variable('a')],
      item: [
        {
          linkId: 'q',
          extension: [
            expression(`${sdc}itemPopulationContext`, 'ctx', '%patient'),
            expression(`${sdc}calculatedExpression`, 'total'),
            expression(`${sdc}calculatedExpression`, undefined),
            variable(),
          ],
        },
      ],
    };
    const declarations = declarationsIn(resource);
    expect(declarations.map(({ site, ...rest }) => ({ site: site?.text, ...rest }))).toEqual([
      {
        name: 'a',
        kind: 'variable',
        pointer: '/extension/0/valueExpression/expression',
        useCases: ['rendering', 'population'],
        site: '1',
      },
      {
        name: 'ctx',
        kind: 'itemPopulationContext',
        pointer: '/item/0/extension/0/valueExpression/expression',
        item: { pointer: '/item/0', linkId: 'q' },
        useCases: ['population'],
        site: '%patient',
      },
      {
        name: 'total',
        kind: 'namedExpression',
        pointer: '/item/0/extension/1/valueExpression/expression',
        item: { pointer: '/item/0', linkId: 'q' },
        useCases: ['rendering'],
        site: '1',
      },
    ]);
  });

  it('gives each declaration with an Expression the site the walker found', () => {
    const document: QuestionnaireDocument = {
      file: 'Questionnaire-Q.json',
      resource: { resourceType: 'Questionnaire', extension: [variable('a')] },
      resourcePointer: '',
      localResources: [],
    };
    const sites = findExpressionSites(document);
    expect(findDeclarations(document, sites)[0]?.site).toBe(sites[0]);
  });

  it.each([
    ['valueCoding.code', { valueCoding: { code: 'patient' } }, 'patient'],
    ['valueId, for legacy ballot compatibility', { valueId: 'user' }, 'user'],
    ['valueCoding.code before valueId', { valueId: 'user', valueCoding: { code: 'x' } }, 'x'],
    [
      'valueId when valueCoding.code is not a string',
      { valueId: 'user', valueCoding: { code: 1 } },
      'user',
    ],
  ])('reads a launchContext name from %s', (_, value, name) => {
    expect(declarationsIn({ extension: [launchContext(value)] })).toEqual([
      {
        name,
        kind: 'launchContext',
        pointer: '/extension/0',
        useCases: ['rendering', 'population'],
      },
    ]);
  });

  it('skips a launchContext without a usable name, and one on an item', () => {
    const declarations = declarationsIn({
      extension: [
        launchContext({ valueCoding: { system: 'http://example.org' } }),
        launchContext({ valueString: 'patient' }),
        { url: LAUNCH_CONTEXT },
      ],
      item: [{ linkId: 'q', extension: [launchContext({ valueCoding: { code: 'patient' } })] }],
    });
    expect(declarations).toEqual([]);
  });

  it('finds extractAllocateId names on the root and on items, for extraction', () => {
    const declarations = declarationsIn({
      extension: [allocateId('bundleId')],
      item: [{ linkId: 'g', item: [{ linkId: 'q', extension: [allocateId('obsId')] }] }],
    });
    expect(declarations).toEqual([
      { name: 'bundleId', kind: 'allocateId', pointer: '/extension/0', useCases: ['extraction'] },
      {
        name: 'obsId',
        kind: 'allocateId',
        pointer: '/item/0/item/0/extension/0',
        item: { pointer: '/item/0/item/0', linkId: 'q' },
        useCases: ['extraction'],
      },
    ]);
  });

  it('lists declarations in document order across kinds, elements and nested items', () => {
    const declarations = declarationsIn({
      extension: [allocateId('r1'), variable('r2'), launchContext({ valueId: 'r3' })],
      item: [
        {
          linkId: 'g',
          _text: {
            extension: [expression('http://hl7.org/fhir/StructureDefinition/cqf-expression', 'g1')],
          },
          extension: [variable('g2'), allocateId('g3')],
          item: [{ linkId: 'q', extension: [variable('q1')] }],
        },
        { linkId: 'last', extension: [allocateId('l1')] },
      ],
    });
    expect(declarations.map(({ name }) => name)).toEqual([
      'r1',
      'r2',
      'r3',
      'g1',
      'g2',
      'g3',
      'q1',
      'l1',
    ]);
  });

  it('finds nothing in contained resources', () => {
    const contained = {
      resourceType: 'Questionnaire',
      extension: [variable('a'), launchContext({ valueId: 'patient' }), allocateId('id')],
      item: [{ linkId: 'q', extension: [variable('b')] }],
    };
    expect(declarationsIn({ contained: [contained] })).toEqual([]);
  });

  it('prefixes every pointer with the resource pointer of a Bundle entry', () => {
    const declarations = declarationsIn(
      {
        extension: [launchContext({ valueId: 'patient' })],
        item: [{ linkId: 'q', extension: [variable('a')] }],
      },
      '/entry/1/resource',
    );
    expect(declarations.map(({ pointer, item }) => [pointer, item?.pointer])).toEqual([
      ['/entry/1/resource/extension/0', undefined],
      [
        '/entry/1/resource/item/0/extension/0/valueExpression/expression',
        '/entry/1/resource/item/0',
      ],
    ]);
  });
});

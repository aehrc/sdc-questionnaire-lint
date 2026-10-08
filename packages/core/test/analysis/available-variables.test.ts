import { describe, expect, it } from 'vitest';
import { builtinNames } from '../../src/analysis/available-variables.js';
import { analyseDocument } from '../../src/analysis/document-analysis.js';
import type { ExpressionSite, QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function expression(
  extension: string,
  name: string | undefined,
  text = '1',
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

const launchContext = (name: string) => ({
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { code: name } },
    { url: 'type', valueCode: 'Patient' },
  ],
});

const allocateId = (name: string) => ({ url: `${sdc}extractAllocateId`, valueString: name });

const filler = Array.from({ length: 8 }, (_, index) => ({ linkId: `f${String(index + 2)}` }));

const resource = {
  resourceType: 'Questionnaire',
  extension: [launchContext('patient'), variable('rootVar'), allocateId('rootId'), variable('x')],
  contained: [{ resourceType: 'Questionnaire', extension: [variable('inContained', '%rootVar')] }],
  item: [
    {
      linkId: 'a',
      extension: [
        variable('x'),
        expression('itemPopulationContext', 'ctx', '%patient'),
        expression('calculatedExpression', 'calc', '%init'),
        expression('candidateExpression', 'cand'),
        allocateId('aId'),
        expression('itemExtractionContext', 'extractCtx', '%aId'),
        expression('initialExpression', 'init'),
      ],
      item: [
        {
          linkId: 'a1',
          extension: [
            variable('x'),
            expression('initialExpression', undefined, '%cand'),
            expression('itemExtractionContext', undefined, '%extractCtx'),
            expression('variable', 'q', 'Patient?_id={{%patient.id}}', 'application/x-fhir-query'),
          ],
        },
      ],
    },
    { linkId: 'b', extension: [expression('enableWhenExpression', undefined, '%calc')] },
    ...filler,
    { linkId: 'ten', extension: [variable('ten')] },
  ],
};

const document: QuestionnaireDocument = {
  file: 'Q.json',
  resource,
  resourcePointer: '',
  localResources: [],
};
const sites = findExpressionSites(document);
const analysis = analyseDocument(document, sites, ['PrePopQuery']);

const at = (pointer: string, carrier = 'expression'): ExpressionSite => {
  const site = sites.find(
    (each) => each.pointer === `${pointer}/valueExpression/expression` && each.carrier === carrier,
  );
  if (site === undefined) throw new Error(`no site at ${pointer}`);
  return site;
};

// What a name resolves to: the declaration's pointer, or the origin of a name nothing declares.
function resolve(site: ExpressionSite, name: string): string | undefined {
  const variable = analysis.variablesAt(site)?.resolve(name);
  return variable?.declaration?.pointer ?? variable?.origin;
}

const root = at('/extension/1');
const calc = at('/item/0/extension/2');
const a1Variable = at('/item/0/item/0/extension/0');
const a1Initial = at('/item/0/item/0/extension/1');
const a1Extraction = at('/item/0/item/0/extension/2');
const a1Fragment = at('/item/0/item/0/extension/3', 'fragment');
const b = at('/item/1/extension/0');

describe('available variables', () => {
  it.each([
    ['a launchContext on the root', root, 'patient', '/extension/0'],
    ['a root variable', root, 'x', '/extension/3/valueExpression/expression'],
    ['an item declaration, on the root', root, 'ctx', undefined],
    ['%qitem, on the root', root, 'qitem', undefined],
    ['%questionnaire, on the root', root, 'questionnaire', 'builtin'],
    [
      'an item variable overriding a root one',
      calc,
      'x',
      '/item/0/extension/0/valueExpression/expression',
    ],
    [
      'the innermost of a name',
      a1Variable,
      'x',
      '/item/0/item/0/extension/0/valueExpression/expression',
    ],
    [
      'a candidateExpression, from a descendant initialExpression (D13)',
      a1Initial,
      'cand',
      '/item/0/extension/3/valueExpression/expression',
    ],
    [
      'a named initialExpression, from rendering (D13)',
      calc,
      'init',
      '/item/0/extension/6/valueExpression/expression',
    ],
    [
      'an itemPopulationContext on the same item',
      calc,
      'ctx',
      '/item/0/extension/1/valueExpression/expression',
    ],
    [
      'a named extraction context, outside extraction (D13)',
      calc,
      'extractCtx',
      '/item/0/extension/5/valueExpression/expression',
    ],
    ['an extractAllocateId, outside extraction (D17)', calc, 'aId', undefined],
    ['%qitem, on an item', calc, 'qitem', 'builtin'],
    [
      'a named extraction context, in extraction (D19)',
      a1Extraction,
      'extractCtx',
      '/item/0/extension/5/valueExpression/expression',
    ],
    ['an ancestor extractAllocateId, in extraction', a1Extraction, 'aId', '/item/0/extension/4'],
    ['a root extractAllocateId, in extraction', a1Extraction, 'rootId', '/extension/2'],
    ['a variable, in extraction (D19)', a1Extraction, 'x', undefined],
    ['a launchContext, in extraction (D12)', a1Extraction, 'patient', undefined],
    ['%resource, in extraction', a1Extraction, 'resource', 'builtin'],
    ['%qitem, in extraction', a1Extraction, 'qitem', 'builtin'],
    ['a host variable, in extraction', a1Extraction, 'PrePopQuery', 'host'],
    ['a launchContext, in a fragment', a1Fragment, 'patient', '/extension/0'],
    [
      'the innermost of a name, in a fragment',
      a1Fragment,
      'x',
      '/item/0/item/0/extension/0/valueExpression/expression',
    ],
    ['a declaration on a sibling item', b, 'calc', undefined],
    ['a declaration on /item/10, from /item/1', b, 'ten', undefined],
    ['a root variable, from an item', b, 'rootVar', '/extension/1/valueExpression/expression'],
    ['a host variable', root, 'PrePopQuery', 'host'],
    ['a name that is not a host variable', root, 'sourceQuery1', undefined],
    ['a vs- name', root, 'vs-conditions', 'builtin'],
    ['an ext- name', root, 'ext-birthPlace', 'builtin'],
    ['a name like a vs- name', root, 'vsconditions', undefined],
  ])('resolves %s', (_, site, name, expected) => {
    expect(resolve(site, name)).toBe(expected);
  });

  it.each([
    'resource',
    'rootResource',
    'context',
    'ucum',
    'questionnaire',
    'sct',
    'loinc',
    'terminologies',
    'factory',
    'server',
  ])('makes the built-in name %s available on the root', (name) => {
    expect(resolve(root, name)).toBe('builtin');
  });

  it('lists each available name once, the innermost declarations first, then built-in and host names', () => {
    const names = analysis
      .variablesAt(a1Extraction)
      ?.variables.map(({ name, origin }) => `${origin}:${name}`);
    expect(names).toEqual([
      'declaration:aId',
      'declaration:extractCtx',
      'declaration:rootId',
      ...[...builtinNames.keys()].map((name) => `builtin:${name}`),
      'host:PrePopQuery',
    ]);
  });

  it('leaves out %qitem from the names on the root', () => {
    const names = analysis.variablesAt(root)?.variables.map(({ name }) => name);
    expect(names).not.toContain('qitem');
    expect(names).toContain('questionnaire');
  });

  it('gives no available variables at an uncatalogued site, such as one in a contained resource', () => {
    const contained = sites.find((site) => site.pointer.startsWith('/contained/'));
    expect(contained?.catalogued).toBe(false);
    expect(analysis.variablesAt(contained as ExpressionSite)).toBeUndefined();
  });
});

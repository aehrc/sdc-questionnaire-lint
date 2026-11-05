/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

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
      a1Initial,
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

describe("a declaration's own name (D25)", () => {
  const own: QuestionnaireDocument = {
    file: 'D.json',
    resource: {
      resourceType: 'Questionnaire',
      extension: [variable('y'), variable('q')],
      item: [
        {
          linkId: 'd',
          extension: [
            variable('y', '%y'),
            variable('y', '%y'),
            expression('variable', 'q', 'Observation?x={{%q}}', 'application/x-fhir-query'),
          ],
        },
      ],
    },
    resourcePointer: '',
    localResources: [],
  };
  const ownSites = findExpressionSites(own);
  const ownAnalysis = analyseDocument(own, ownSites);
  const resolveAt = (pointer: string, carrier: string, name: string) => {
    const site = ownSites.find(
      (each) =>
        each.pointer === `${pointer}/valueExpression/expression` && each.carrier === carrier,
    );
    if (site === undefined) throw new Error(`no site at ${pointer}`);
    return ownAnalysis.variablesAt(site)?.resolve(name)?.declaration?.pointer;
  };

  it.each([
    [
      'resolves to the declaration of the nearest ancestor element',
      '/item/0/extension/0',
      'expression',
      'y',
      '/extension/0/valueExpression/expression',
    ],
    [
      'does not apply to a later duplicate on the element, which the first overrides',
      '/item/0/extension/1',
      'expression',
      'y',
      '/item/0/extension/0/valueExpression/expression',
    ],
    [
      "applies in a fragment of the declaration's query",
      '/item/0/extension/2',
      'fragment',
      'q',
      '/extension/1/valueExpression/expression',
    ],
    [
      'resolves to the declaration itself when nothing else supplies the name',
      '/extension/0',
      'expression',
      'y',
      '/extension/0/valueExpression/expression',
    ],
  ])('%s', (_, pointer, carrier, name, expected) => {
    expect(resolveAt(pointer, carrier, name)).toBe(expected);
  });
});

describe('available variables in a module', () => {
  const assembleContext = (name: unknown) => ({ url: `${sdc}assembleContext`, valueString: name });
  const module: QuestionnaireDocument = {
    file: 'M.json',
    resource: {
      resourceType: 'Questionnaire',
      extension: [
        assembleContext('person'),
        assembleContext('linkIdPrefix'),
        assembleContext(1),
        variable('x', '%person'),
      ],
      item: [
        {
          linkId: 'a',
          extension: [
            variable('linkIdPrefix', "%linkIdPrefix + 'a.'"),
            expression('itemExtractionContext', undefined, '%person'),
            { url: `${sdc}assembleContext`, valueString: 'onItem' },
            expression('calculatedExpression', undefined, '%linkIdPrefix'),
          ],
        },
      ],
    },
    resourcePointer: '',
    localResources: [],
  };
  const moduleSites = findExpressionSites(module);
  const moduleAnalysis = analyseDocument(module, moduleSites, ['person']);
  const site = (pointer: string) => {
    const found = moduleSites.find(
      (each) => each.pointer === `${pointer}/valueExpression/expression`,
    );
    if (found === undefined) throw new Error(`no site at ${pointer}`);
    return found;
  };
  const resolveIn = (pointer: string, name: string) => {
    const variable = moduleAnalysis.variablesAt(site(pointer))?.resolve(name);
    return variable?.declaration?.pointer ?? variable?.origin;
  };

  it.each([
    ['on the root', '/extension/3', 'person', 'assembled'],
    ['on an item', '/item/0/extension/0', 'person', 'assembled'],
    ['in extraction', '/item/0/extension/1', 'person', 'assembled'],
    [
      'in extraction, where the item variable of the name is not',
      '/item/0/extension/1',
      'linkIdPrefix',
      'assembled',
    ],
    [
      'overridden by a declaration on the item',
      '/item/0/extension/3',
      'linkIdPrefix',
      '/item/0/extension/0/valueExpression/expression',
    ],
    [
      "but not in that declaration's own expression (D25)",
      '/item/0/extension/0',
      'linkIdPrefix',
      'assembled',
    ],
    ['not when it sits on an item', '/item/0/extension/0', 'onItem', undefined],
  ])('makes an assembleContext name available %s', (_, pointer, name, expected) => {
    expect(resolveIn(pointer, name)).toBe(expected);
  });

  it('lists each assembleContext name once, after the built-in names; a host variable of the same name is not listed again', () => {
    const names = moduleAnalysis
      .variablesAt(site('/extension/3'))
      ?.variables.map(({ name, origin }) => `${origin}:${name}`);
    expect(names?.slice(-2)).toEqual(['assembled:person', 'assembled:linkIdPrefix']);
  });
});

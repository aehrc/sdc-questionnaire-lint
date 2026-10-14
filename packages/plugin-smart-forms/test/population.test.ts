// The population model answers, for one form, whether population runs and what it binds for each
// declaration, and when. Forms are JSON, with sites and declarations as core finds them.
import type { Declaration } from 'sdc-questionnaire-lint';
import { describe, expect, it } from 'vitest';
import { type Binder, type Binding, population } from '../src/population.js';
import {
  analyseDeclarations,
  expression,
  ext,
  questionnaire,
  sdc,
  VARIABLE,
} from './support/sites.js';

type Json = Record<string, unknown>;

const compat = { renderer: '1.4.0', populate: '4.7.1' };

const LAUNCH_CONTEXT = `${sdc}launchContext`;
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;
const SOURCE_QUERIES = `${sdc}sourceQueries`;

const launch: Json = {
  url: LAUNCH_CONTEXT,
  extension: [
    { url: 'name', valueCoding: { system: LAUNCH_CONTEXT, code: 'patient' } },
    { url: 'type', valueCode: 'Patient' },
  ],
};
const fhirPath = (name: string, text = "'v'"): Json =>
  ext(VARIABLE, expression('text/fhirpath', text, name));
const query = (name: string, text: string): Json =>
  ext(VARIABLE, expression('application/x-fhir-query', text, name));
const context = (name: string, text = '%patient'): Json =>
  ext(ITEM_POPULATION_CONTEXT, expression('text/fhirpath', text, name));
const item = (linkId: string | undefined, extension: Json[], item: Json[] = []): Json => ({
  ...(linkId === undefined ? {} : { linkId }),
  type: 'group',
  extension,
  ...(item.length === 0 ? {} : { item }),
});
const leaf = (linkId: string): Json => ({ linkId, type: 'string' });

const sourceQuery = (reference: string): Json => ({
  url: SOURCE_QUERIES,
  valueReference: { reference },
});
const bundle = (id: string): Json => ({ resourceType: 'Bundle', id, type: 'batch', entry: [] });

// The model of a form, and each of its declarations by name, the first of each name.
function model(fields: Json): {
  runs: boolean;
  sourceQueries: readonly (string | undefined)[];
  bindingOf: (name: string, which?: number) => Binding | undefined;
  // Each binder of a name: a sourceQueries result's pointer, or the pointer of a declaration's
  // extension and when.
  bindersOf: (name: string) => readonly (string | [string, Binding['at']])[];
} {
  const { document, declarations } = analyseDeclarations(questionnaire(fields));
  const pop = population({ document, compat, declarations });
  const named = (name: string, which = 0): Declaration => {
    const declaration = declarations.filter((each) => each.name === name)[which];
    if (declaration === undefined) throw new Error(`no declaration ${name}`);
    return declaration;
  };
  const describe = (binder: Binder): string | [string, Binding['at']] =>
    binder.kind === 'sourceQuery'
      ? binder.pointer
      : [binder.declaration.pointer.replace('/valueExpression/expression', ''), binder.at];
  return {
    runs: pop.runs,
    sourceQueries: pop.sourceQueries.map(({ name }) => name),
    bindingOf: (name, which) => pop.bindingOf(named(name, which)),
    bindersOf: (name) => pop.bindersOf(name).map(describe),
  };
}

describe('population runs', () => {
  it('runs with a root launchContext', () => {
    expect(model({ extension: [launch] }).runs).toBe(true);
  });

  it('runs with a root sourceQueries that has a valueReference', () => {
    const sourceQueries = { url: SOURCE_QUERIES, valueReference: { reference: '#b' } };
    expect(model({ extension: [sourceQueries] }).runs).toBe(true);
  });

  it('runs with an application/x-fhir-query variable that has text, on an item', () => {
    expect(model({ item: [item('g', [query('q', 'Patient')], [leaf('a')])] }).runs).toBe(true);
  });

  it('does not run without input', () => {
    expect(model({ extension: [fhirPath('a')], item: [leaf('a')] }).runs).toBe(false);
  });

  it('does not run for a query variable without text', () => {
    expect(model({ extension: [query('q', '')] }).runs).toBe(false);
  });

  it('does not run for a subjectType without Patient', () => {
    expect(model({ subjectType: ['Group'], extension: [launch] }).runs).toBe(false);
  });

  it('runs for a subjectType that includes Patient', () => {
    expect(model({ subjectType: ['Group', 'Patient'], extension: [launch] }).runs).toBe(true);
  });

  // populate 4.7.1 throws on it; it is invalid FHIR, which the Validator reports.
  it('treats a subjectType that is not an array as no restriction', () => {
    expect(model({ subjectType: 'Group', extension: [launch] }).runs).toBe(true);
  });
});

describe('population bindingOf', () => {
  it('binds a launchContext, then root variables, then item variables, in array order', () => {
    const form = model({
      extension: [launch, fhirPath('a'), fhirPath('b')],
      item: [item('g', [fhirPath('c'), fhirPath('d')], [leaf('q')])],
    });
    expect(form.bindingOf('patient')).toEqual({ name: 'patient', at: [1, 0, 0] });
    expect(form.bindingOf('a')).toEqual({ name: 'a', at: [2, 0, 1] });
    expect(form.bindingOf('b')).toEqual({ name: 'b', at: [2, 0, 2] });
    expect(form.bindingOf('c')).toEqual({ name: 'c', at: [3, 0, 0] });
    expect(form.bindingOf('d')).toEqual({ name: 'd', at: [3, 0, 1] });
  });

  it('binds no name for a launchContext whose first sub-extension is its type', () => {
    const typeFirst = { ...launch, extension: [...(launch.extension as Json[])].reverse() };
    expect(model({ extension: [typeFirst] }).bindingOf('patient')).toBeUndefined();
  });

  it('orders integer-like linkIds first', () => {
    const form = model({
      extension: [launch],
      item: [item('b', [fhirPath('x')]), item('2', [fhirPath('y')]), item('1', [fhirPath('z')])],
    });
    expect(form.bindingOf('z')?.at).toEqual([3, 0, 0]);
    expect(form.bindingOf('y')?.at).toEqual([3, 1, 0]);
    expect(form.bindingOf('x')?.at).toEqual([3, 2, 0]);
  });

  it('orders a child item before its group', () => {
    const form = model({
      extension: [launch],
      item: [item('g', [fhirPath('x')], [item('c', [fhirPath('y')])])],
    });
    expect(form.bindingOf('y')?.at).toEqual([3, 0, 0]);
    expect(form.bindingOf('x')?.at).toEqual([3, 1, 0]);
  });

  it('counts only items with an extension property in the key order', () => {
    const form = model({
      extension: [launch],
      item: [leaf('a'), item('g', [fhirPath('x')])],
    });
    expect(form.bindingOf('x')?.at).toEqual([3, 0, 0]);
  });

  it('keeps the name but not the order of an item with a duplicate linkId', () => {
    const form = model({
      extension: [launch],
      item: [item('d', [fhirPath('x')]), item('d', [fhirPath('y')])],
    });
    expect(form.bindingOf('x')).toEqual({ name: 'x', at: 'unknown' });
    expect(form.bindingOf('y')).toEqual({ name: 'y', at: 'unknown' });
  });

  it('keeps the name but not the order of an item without a linkId', () => {
    const form = model({ extension: [launch], item: [item(undefined, [fhirPath('x')])] });
    expect(form.bindingOf('x')).toEqual({ name: 'x', at: 'unknown' });
  });

  it('never evaluates the variables of an item with the linkId __proto__', () => {
    const form = model({ extension: [launch], item: [item('__proto__', [fhirPath('x')])] });
    expect(form.bindingOf('x')).toEqual({ name: 'x', at: 'never' });
  });

  it('never evaluates a variable in a modifierExtension', () => {
    const form = model({ extension: [launch], modifierExtension: [fhirPath('x')] });
    expect(form.bindingOf('x')).toEqual({ name: 'x', at: 'never' });
  });

  it('fetches an application/x-fhir-query variable in step 1, but only with text', () => {
    const form = model({
      extension: [launch, query('q', 'Patient'), query('empty', '')],
      item: [item('g', [query('r', 'Observation')])],
    });
    expect(form.bindingOf('q')).toEqual({ name: 'q', at: [1, 0, 0] });
    expect(form.bindingOf('r')).toEqual({ name: 'r', at: [1, 0, 0] });
    expect(form.bindingOf('empty')).toEqual({ name: 'empty', at: 'never' });
  });

  it('skips item text/fhirpath variables when the root has no extensions', () => {
    const form = model({ item: [item('g', [fhirPath('x')])] });
    expect(form.bindingOf('x')).toBeUndefined();
  });

  it('binds an itemPopulationContext it reads after every variable', () => {
    const form = model({ extension: [launch], item: [item('g', [context('ctx')], [leaf('a')])] });
    expect(form.bindingOf('ctx')).toEqual({ name: 'ctx', at: [4, 0, 0] });
  });

  it('keeps the name of an itemPopulationContext a later one of its name replaces, but never evaluates it', () => {
    const form = model({
      extension: [launch],
      item: [
        item('g', [context('ctx')], [leaf('a')]),
        item('h', [context('ctx', '%patient.name')], [leaf('b')]),
      ],
    });
    expect(form.bindingOf('ctx', 0)).toEqual({ name: 'ctx', at: 'never' });
    expect(form.bindingOf('ctx', 1)).toEqual({ name: 'ctx', at: [4, 0, 0] });
  });

  it('binds no name for an itemPopulationContext it does not read', () => {
    const form = model({ extension: [launch], item: [item('g', [context('ctx')])] });
    expect(form.bindingOf('ctx')).toBeUndefined();
  });

  it('binds no name for a named expression other than a variable', () => {
    const calculated = ext(`${sdc}calculatedExpression`, expression('text/fhirpath', '1', 'calc'));
    const form = model({ extension: [launch], item: [{ ...leaf('a'), extension: [calculated] }] });
    expect(form.bindingOf('calc')).toBeUndefined();
  });
});

describe('population sourceQueries', () => {
  it('binds a #id with a bound contained Bundle and any other reference by index', () => {
    const form = model({
      contained: [bundle('b'), { resourceType: 'Bundle', id: 'empty' }],
      extension: [
        sourceQuery('#b'),
        sourceQuery('#empty'),
        sourceQuery('#missing'),
        sourceQuery('Patient?_id=1'),
        sourceQuery('#%x'),
      ],
    });
    expect(form.sourceQueries).toEqual(['b', 'sourceQuery3']);
  });

  it('binds none for a subjectType without Patient', () => {
    const form = model({
      subjectType: ['Group'],
      contained: [bundle('b')],
      extension: [sourceQuery('#b')],
    });
    expect(form.sourceQueries).toEqual([]);
  });

  it('is what the hook works from, without declarations', () => {
    const { document } = analyseDeclarations(
      questionnaire({ contained: [bundle('b')], extension: [sourceQuery('#b')] }),
    );
    const pop = population({ document, compat });
    expect(pop.bindersOf('b').map(({ kind }) => kind)).toEqual(['sourceQuery']);
  });
});

describe('population bindersOf', () => {
  it('gives a sourceQueries result first, then the declarations of the name, earliest first', () => {
    const form = model({
      contained: [bundle('x')],
      extension: [sourceQuery('#x'), launch],
      item: [
        item('g', [fhirPath('x')], [item('c', [fhirPath('x')])]),
        item('d', [fhirPath('x')]),
        item('d', [fhirPath('x')]),
        item('h', [context('x')], [leaf('a')]),
      ],
    });
    expect(form.bindersOf('x')).toEqual([
      '/extension/0',
      ['/item/0/item/0/extension/0', [3, 0, 0]],
      ['/item/0/extension/0', [3, 1, 0]],
      ['/item/3/extension/0', [4, 0, 0]],
      ['/item/1/extension/0', 'unknown'],
      ['/item/2/extension/0', 'unknown'],
    ]);
  });

  it('gives no binder for a name nothing binds', () => {
    expect(model({ extension: [launch, fhirPath('a')] }).bindersOf('b')).toEqual([]);
  });

  it('leaves out a declaration population stores no name for', () => {
    const calculated = ext(`${sdc}calculatedExpression`, expression('text/fhirpath', '1', 'x'));
    const form = model({
      extension: [launch, fhirPath('x')],
      item: [{ ...leaf('a'), extension: [calculated] }],
    });
    expect(form.bindersOf('x')).toEqual([['/extension/1', [2, 0, 1]]]);
  });
});

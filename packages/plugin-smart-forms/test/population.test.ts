// The population model answers, for one form, whether population runs and what it binds for each
// declaration, and when. Forms are JSON, with sites and declarations as core finds them. The last
// tests run the pinned populate (test/reproduction/populate.ts) beside the model; they are not
// fact evidence, which stays in the reproduction tests.
import type { Declaration } from '@aehrc/sdc-questionnaire-lint';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Binder,
  type Binding,
  compare,
  type Population,
  population,
} from '../src/population.js';
import { patient, populate, undefinedVariable } from './reproduction/populate.js';
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
  const summary = (binder: Binder): string | [string, Binding['at']] =>
    binder.kind === 'sourceQuery'
      ? binder.pointer
      : [binder.declaration.pointer.replace('/valueExpression/expression', ''), binder.at];
  return {
    runs: pop.runs,
    sourceQueries: pop.sourceQueries.map(({ name }) => name),
    bindingOf: (name, which) => pop.bindingOf(named(name, which)),
    bindersOf: (name) => pop.bindersOf(name).map(summary),
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
    expect(form.bindingOf('q')).toEqual({ name: 'q', at: [1, 3, 0] });
    expect(form.bindingOf('r')).toEqual({ name: 'r', at: [1, 3, 1] });
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

  // As for runs: populate 4.7.1 throws on it, and the Validator reports it.
  it('treats a subjectType that is not an array as no restriction', () => {
    const form = model({
      subjectType: 'Group',
      contained: [bundle('b')],
      extension: [sourceQuery('#b')],
    });
    expect(form.sourceQueries).toEqual(['b']);
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

  it('orders step 1: launch resources, contained Bundles, references, then query variables', () => {
    const form = model({
      contained: [bundle('patient')],
      extension: [
        query('patient', 'Patient'),
        sourceQuery('Patient?_id=1'),
        sourceQuery('#patient'),
        launch,
      ],
      item: [
        item('g', [query('patient', 'Observation')], [item('c', [query('patient', 'Encounter')])]),
      ],
    });
    expect(form.bindersOf('patient')).toEqual([
      ['/extension/3', [1, 0, 3]],
      '/extension/2',
      ['/extension/0', [1, 3, 0]],
      ['/item/0/item/0/extension/0', [1, 3, 1]],
      ['/item/0/extension/0', [1, 3, 2]],
    ]);
  });

  it('binds a contained Bundle with the references when no launch resource is bound', () => {
    const form = model({
      contained: [bundle('x')],
      extension: [sourceQuery('#x'), query('x', 'Patient')],
    });
    expect(form.bindersOf('x')).toEqual(['/extension/0', ['/extension/1', [1, 3, 0]]]);
    const { document, declarations } = analyseDeclarations(
      questionnaire({
        contained: [bundle('x')],
        extension: [query('y', 'Patient'), sourceQuery('Patient?_id=1'), sourceQuery('#x')],
      }),
    );
    const pop = population({ document, compat, declarations });
    expect(pop.bindersOf('x')).toMatchObject([{ kind: 'sourceQuery', at: [1, 2, 1] }]);
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

describe('population readsContext', () => {
  // The reason population gives for the itemPopulationContext named ctx, the first of the name.
  const readsContext = (fields: Json): ReturnType<Population['readsContext']> => {
    const { document, sites } = analyseDeclarations(questionnaire(fields));
    const site = sites.find(({ name }) => name === 'ctx');
    if (site === undefined) throw new Error('no site ctx');
    return population({ document, compat }).readsContext(site);
  };

  it('reads the first itemPopulationContext on an item with child items', () => {
    expect(readsContext({ item: [item('g', [context('ctx')], [leaf('a')])] })).toBe(true);
  });

  it('reads one a later one of its name replaces', () => {
    expect(
      readsContext({
        item: [item('g', [context('ctx')], [leaf('a')]), item('h', [context('ctx')], [leaf('b')])],
      }),
    ).toBe(true);
  });

  it('does not read one on the root', () => {
    expect(readsContext({ extension: [context('ctx')] })).toBe('on-root');
  });

  it('does not read one on an item without child items', () => {
    expect(readsContext({ item: [item('g', [context('ctx')])] })).toBe('no-child-items');
  });

  it('does not read one after another on the item', () => {
    expect(
      readsContext({ item: [item('g', [context('first'), context('ctx')], [leaf('a')])] }),
    ).toBe('not-first');
  });

  it('does not read one without expression text', () => {
    expect(readsContext({ item: [item('g', [context('ctx', '')], [leaf('a')])] })).toBe('no-text');
  });

  it('does not read one without a name', () => {
    const { document, sites } = analyseDeclarations(
      questionnaire({
        item: [
          item('g', [ext(ITEM_POPULATION_CONTEXT, expression('text/fhirpath', '%p'))], [leaf('a')]),
        ],
      }),
    );
    const site = sites.find(({ location }) => location?.url === ITEM_POPULATION_CONTEXT);
    if (site === undefined) throw new Error('no itemPopulationContext site');
    expect(population({ document, compat }).readsContext(site)).toBe('no-name');
  });
});

describe('population against populate 4.7.1', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  // Each form gives every FHIRPath variable and itemPopulationContext a literal value, its tag, so
  // that none fails and the value tells which declaration of a name won.
  const forms: readonly { readonly title: string; readonly form: Json }[] = [
    {
      title: 'root and item variables, integer-like linkIds and a named calculatedExpression',
      form: {
        extension: [launch, fhirPath('a', "'a'")],
        item: [
          item('g', [fhirPath('b', "'b'")], [item('1', [fhirPath('c', "'c'")], [leaf('q')])]),
          item('b2', [fhirPath('d', "'d'")], [leaf('r')]),
          {
            ...leaf('s'),
            extension: [ext(`${sdc}calculatedExpression`, expression('text/fhirpath', "'e'", 'e'))],
          },
        ],
      },
    },
    {
      title: 'a name on the root, a group and its child',
      form: {
        extension: [launch, fhirPath('x', "'root'")],
        item: [item('g', [fhirPath('x', "'group'")], [item('c', [fhirPath('x', "'child'")])])],
      },
    },
    {
      title: 'a name on items keyed b, 2 and 1',
      form: {
        extension: [launch],
        item: [
          item('b', [fhirPath('x', "'b'")]),
          item('2', [fhirPath('x', "'two'")]),
          item('1', [fhirPath('x', "'one'")]),
        ],
      },
    },
    {
      title: 'a variable on an item whose linkId is __proto__',
      form: {
        extension: [launch],
        item: [item('g', [], [{ ...leaf('__proto__'), extension: [fhirPath('x', "'proto'")] }])],
      },
    },
    {
      title: 'a variable in the root modifierExtension',
      form: { extension: [launch], modifierExtension: [fhirPath('x', "'modifier'")] },
    },
    {
      title: 'application/x-fhir-query variables with and without text',
      form: {
        extension: [launch, query('q', 'Patient'), query('empty', '')],
        item: [item('g', [query('r', 'Observation')], [leaf('a')])],
      },
    },
    {
      title: 'an item query variable as the only input, with no root extensions',
      form: { item: [item('g', [query('q', 'Patient'), fhirPath('v', "'v'")], [leaf('a')])] },
    },
    {
      title: 'itemPopulationContexts of one name, and one on a leaf',
      form: {
        extension: [launch],
        item: [
          item('g', [context('ctx', "'first'")], [leaf('a')]),
          item('h', [context('ctx', "'second'")], [leaf('b')]),
          item('k', [context('leaf', "'leaf'")]),
        ],
      },
    },
    {
      title: 'a variable and an itemPopulationContext of one name',
      form: {
        extension: [launch, fhirPath('c', "'variable'")],
        item: [item('g', [context('c', "'context'")], [leaf('a')])],
      },
    },
    {
      title: 'a sourceQueries result and a variable of one name',
      form: {
        contained: [bundle('x')],
        extension: [sourceQuery('#x'), fhirPath('x', "'variable'")],
      },
    },
    {
      title: 'a launchContext whose first sub-extension is its type',
      form: {
        extension: [
          { ...launch, extension: [...(launch.extension as Json[])].reverse() },
          fhirPath('a', "'a'"),
        ],
      },
    },
    {
      title: 'a subjectType without Patient',
      form: { subjectType: ['Group'], extension: [launch, fhirPath('a', "'a'")] },
    },
    { title: 'no input', form: { extension: [fhirPath('a', "'a'")] } },
    {
      title: 'a launchContext and a contained sourceQueries Bundle of one name',
      form: { contained: [bundle('patient')], extension: [sourceQuery('#patient'), launch] },
    },
    {
      title: 'a sourceQueries reference and query variables of its name',
      form: {
        extension: [launch, query('sourceQuery0', 'Observation'), sourceQuery('Patient?_id=1')],
        item: [item('g', [query('sourceQuery0', 'Encounter')], [leaf('a')])],
      },
    },
    // The contained Bundle is bound before the references with a launch resource, and fetched
    // with them, in index order, without one.
    ...[[launch], []].map((launches) => ({
      title: `a reference and a later contained Bundle of its name, ${launches.length === 0 ? 'without' : 'with'} a launch resource`,
      form: {
        contained: [bundle('sourceQuery0')],
        extension: [...launches, sourceQuery('Patient?_id=1'), sourceQuery('#sourceQuery0')],
      },
    })),
  ];

  // Each fetch returns a resource that names its URL, so a fetched value tells which binder won.
  const fetched = (url: string): Json => ({ resourceType: 'Basic', code: { text: url } });

  // The value population binds for a binder, when the test can tell it.
  const valueOf = (binder: Binder | undefined): unknown => {
    if (binder === undefined) return undefined;
    if (binder.kind === 'sourceQuery') {
      const { reference, bundle: contained } = binder.query;
      return binder.at[1] === 1 ? contained?.resource : fetched(reference ?? '');
    }
    const { declaration } = binder;
    if (declaration.kind === 'launchContext') return patient;
    const text = declaration.site?.text ?? '';
    if (declaration.site?.language === 'application/x-fhir-query') return fetched(text);
    const tag = /^'(.*)'$/.exec(text)?.[1];
    return tag === undefined ? undefined : [tag];
  };

  it.each(forms)('binds what populate binds: $title', async ({ form }) => {
    const resource = questionnaire(form);
    const { document, declarations } = analyseDeclarations(resource);
    const pop = population({ document, compat, declarations });
    const { context } = await populate(resource, { fetch: fetched });
    const ran = context !== undefined && Object.keys(context).length > 0;
    expect(pop.runs).toBe(ran);
    if (context === undefined || !ran) return;
    const names = new Set([
      ...declarations.map((declaration) => declaration.name),
      ...pop.sourceQueries.flatMap(({ name }) => name ?? []),
    ]);
    for (const name of names) {
      const binders = pop.bindersOf(name);
      // A duplicate linkId can replace an item's variables, so their name may not be bound.
      if (binders.some((binder) => binder.kind === 'declaration' && binder.at === 'unknown')) {
        continue;
      }
      const bound = binders.filter(
        (binder) => binder.kind === 'sourceQuery' || binder.at !== 'never',
      );
      expect(Object.hasOwn(context, name), name).toBe(bound.length > 0);
      const value = valueOf(bound.at(-1));
      if (binders.length > 1 && value !== undefined) expect(context[name], name).toEqual(value);
    }
  });

  // Root variables, a child keyed 1 before its group g, an item b, then an itemPopulationContext.
  // texts replaces a declaration's expression.
  const ordered = (texts: Readonly<Record<string, string>> = {}): Json =>
    questionnaire({
      extension: [launch, fhirPath('r1', texts.r1), fhirPath('r2', texts.r2)],
      item: [
        item('g', [fhirPath('gv', texts.gv)], [item('1', [fhirPath('cv', texts.cv)], [leaf('a')])]),
        item('b', [fhirPath('bv', texts.bv)], [leaf('c')]),
        item('h', [context('ctx', texts.ctx ?? "'ctx'")], [leaf('d')]),
      ],
    });

  it('orders declarations as populate evaluates them', async () => {
    const { document, declarations } = analyseDeclarations(ordered());
    const pop = population({ document, compat, declarations });
    const order = declarations
      .flatMap((declaration) => {
        const at = pop.bindingOf(declaration)?.at;
        return at === undefined || typeof at === 'string' || declaration.kind === 'launchContext'
          ? []
          : [{ name: declaration.name, at }];
      })
      .sort((a, b) => compare(a.at, b.at))
      .map(({ name }) => name);
    expect(order).toEqual(['r1', 'r2', 'cv', 'gv', 'bv', 'ctx']);
    for (const [i, earlier] of order.entries()) {
      for (const later of order.slice(i + 1)) {
        const forward = await populate(ordered({ [later]: `%${earlier}` }));
        expect(forward.issues, `${later} reads ${earlier}`).toEqual([]);
        const backward = await populate(ordered({ [earlier]: `%${later}` }));
        expect(backward.issues, `${earlier} reads ${later}`).toContainEqual(
          undefinedVariable(later),
        );
      }
    }
  });
});

/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// Reproduces, against @aehrc/sdc-populate 4.7.1, the order in which population evaluates the
// variables a form declares (src/facts/variables.ts, population-evaluation-order): a reference to a
// name not yet bound fails with an OperationOutcome warning and leaves the variable unset, unless
// fhirpath.js skips evaluating it. Each test asserts the issues, and the value an initialExpression
// gets or the names in populatedContext.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import { answersOf, populate, undefinedVariable, withPatientLaunch } from './populate.js';

type Json = Record<string, unknown>;

const INITIAL_EXPRESSION = `${sdc}initialExpression`;
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;

const fhirPathVariable = (name: string, text: string): Json =>
  ext(VARIABLE, expression('text/fhirpath', text, name));
const queryVariable = (name: string, text: string): Json =>
  ext(VARIABLE, expression('application/x-fhir-query', text, name));
const populationContext = (name: string, text: string): Json =>
  ext(ITEM_POPULATION_CONTEXT, expression('text/fhirpath', text, name));
const question = (linkId: string, text: string): Json => ({
  linkId,
  type: 'string',
  extension: [ext(INITIAL_EXPRESSION, expression('text/fhirpath', text))],
});
// An item with variables and, below it, the question q reading %x.
const holder = (linkId: string, extension: Json[], item: Json[] = []): Json => ({
  linkId,
  type: 'group',
  extension,
  item,
});

// Populates a form whose root has a patient launchContext, so population runs and evaluates item
// variables, with the question q reading %x last.
const populateWith = (fields: Json, options?: Parameters<typeof populate>[1]) =>
  populate(
    withPatientLaunch(
      questionnaire({
        ...fields,
        item: [...((fields.item as Json[] | undefined) ?? []), question('q', '%x')],
      }),
    ),
    options,
  );

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('populate 4.7.1 evaluation order', () => {
  it('fails a root variable that reads a later root variable, and leaves a dependent initialExpression empty', async () => {
    const { success, issues, context, response } = await populateWith({
      extension: [fhirPathVariable('x', '%y'), fhirPathVariable('y', "'y'")],
    });
    expect(success).toBe(true);
    expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
    expect(context).not.toHaveProperty('x');
    expect(context?.y).toEqual(['y']);
    expect(answersOf(response, 'q')).toEqual([]);
  });

  it('fails an item variable that reads a later variable on the same item', async () => {
    const { issues, response } = await populateWith({
      item: [holder('g', [fhirPathVariable('x', '%y'), fhirPathVariable('y', "'y'")])],
    });
    expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
    expect(answersOf(response, 'q')).toEqual([]);
  });

  it('gives a variable the value of an earlier variable on the same item', async () => {
    const { issues, response } = await populateWith({
      item: [holder('g', [fhirPathVariable('y', "'y'"), fhirPathVariable('x', '%y')])],
    });
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'y' }]);
  });

  // Items are keyed by linkId in a plain object filled children first, and read in Object.keys
  // order: integer-like linkIds first, in ascending order, then the others in insertion order.
  const groupAndChild = (parent: string, child: string) =>
    populateWith({
      item: [
        holder(
          parent,
          [fhirPathVariable('y', "'group'")],
          [holder(child, [fhirPathVariable('x', '%y')], [{ linkId: 'c', type: 'string' }])],
        ),
      ],
    });

  it('fails a child that reads the variable of a group later in key order: g/a, 2/1 and 10/2', async () => {
    for (const [parent, child] of [
      ['g', 'a'],
      ['2', '1'],
      ['10', '2'],
    ] as const) {
      const { issues, response } = await groupAndChild(parent, child);
      expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
      expect(answersOf(response, 'q')).toEqual([]);
    }
  });

  it('gives a child the variable of an integer-like group earlier in key order: 1/a and 1/1.1', async () => {
    for (const child of ['a', '1.1']) {
      const { issues, response } = await groupAndChild('1', child);
      expect(issues).toEqual([]);
      expect(answersOf(response, 'q')).toEqual([{ valueString: 'group' }]);
    }
  });

  it('fails a grandchild that reads the variable of its grandparent', async () => {
    const { issues } = await populateWith({
      item: [
        holder(
          'g',
          [fhirPathVariable('y', "'group'")],
          [holder('h', [], [holder('a', [fhirPathVariable('x', '%y')])])],
        ),
      ],
    });
    expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
  });

  it('fails a variable that reads an itemPopulationContext, evaluated after every variable', async () => {
    const ownGroup = await populateWith({
      item: [
        holder(
          'g',
          [populationContext('ctx', "'context'"), fhirPathVariable('x', '%ctx')],
          [{ linkId: 'a', type: 'string' }],
        ),
      ],
    });
    expect(ownGroup.issues).toEqual([undefinedVariable('ctx'), undefinedVariable('x')]);
    expect(ownGroup.context?.ctx).toEqual(['context']);
    const descendant = await populateWith({
      item: [
        holder(
          'g',
          [populationContext('ctx', "'context'")],
          [holder('a', [fhirPathVariable('x', '%ctx')], [{ linkId: 'b', type: 'string' }])],
        ),
      ],
    });
    expect(descendant.issues).toEqual([undefinedVariable('ctx'), undefinedVariable('x')]);
  });

  it('does not fail a later variable in an iif branch, but fails it in the criterion', async () => {
    const branch = await populateWith({
      extension: [fhirPathVariable('x', "iif(true, 'a', %y)"), fhirPathVariable('y', "'y'")],
    });
    expect(branch.issues).toEqual([]);
    expect(answersOf(branch.response, 'q')).toEqual([{ valueString: 'a' }]);
    const criterion = await populateWith({
      extension: [
        fhirPathVariable('x', "iif(%y.exists(), 'a', 'b')"),
        fhirPathVariable('y', "'y'"),
      ],
    });
    expect(criterion.issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
  });

  it('does not fail a later variable in a coalesce argument after a non-empty one', async () => {
    const { issues, response } = await populateWith({
      extension: [fhirPathVariable('x', "coalesce('a', %y)"), fhirPathVariable('y', "'y'")],
    });
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'a' }]);
  });

  it('does not fail a later variable in a where over %resource, the empty response', async () => {
    const { issues, context } = await populateWith({
      extension: [
        fhirPathVariable('x', '%resource.item.where(linkId = %y).count()'),
        fhirPathVariable('y', "'y'"),
      ],
    });
    expect(issues).toEqual([]);
    expect(context?.x).toEqual([0]);
  });

  it('fails a later variable in an and operand, a combine argument and a defineVariable value', async () => {
    for (const text of ['false and %y', '{}.combine(%y)', "{}.defineVariable('z', %y)"]) {
      const { issues } = await populateWith({
        extension: [fhirPathVariable('x', text), fhirPathVariable('y', "'y'")],
      });
      expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
    }
  });

  it('gives a reference the value of a root variable of its name instead of a later item variable', async () => {
    const { issues, response } = await populateWith({
      extension: [fhirPathVariable('y', "'root'")],
      item: [holder('g', [fhirPathVariable('x', '%y'), fhirPathVariable('y', "'item'")])],
    });
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'root' }]);
  });

  // withPatientLaunch adds a patient launchContext, which population binds to the launch Patient.
  it('gives a reference the launch resource of a launchContext of its name instead of a later variable', async () => {
    const { issues, response } = await populateWith({
      extension: [fhirPathVariable('x', '%patient.id'), fhirPathVariable('patient', "'later'")],
    });
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'pat-1' }]);
  });

  it('gives a reference a contained sourceQueries Bundle of its name instead of a later variable', async () => {
    const { issues, response } = await populateWith({
      contained: [{ resourceType: 'Bundle', id: 'y', type: 'batch', entry: [] }],
      extension: [
        { url: `${sdc}sourceQueries`, valueReference: { reference: '#y' } },
        fhirPathVariable('x', '%y.type'),
        fhirPathVariable('y', "'later'"),
      ],
    });
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'batch' }]);
  });

  it('binds an application/x-fhir-query variable before every FHIRPath variable, on the root and on an item', async () => {
    const searchset = { resourceType: 'Bundle', type: 'searchset', entry: [] };
    const fields: Json[] = [
      { extension: [fhirPathVariable('x', '%y.type'), queryVariable('y', 'Observation')] },
      {
        item: [holder('g', [fhirPathVariable('x', '%y.type'), queryVariable('y', 'Observation')])],
      },
    ];
    for (const each of fields) {
      const { issues, response } = await populateWith(each, { fetch: () => searchset });
      expect(issues).toEqual([]);
      expect(answersOf(response, 'q')).toEqual([{ valueString: 'searchset' }]);
    }
  });

  it('does not fail a reference to an Object property name, which fhirpath.js finds with in', async () => {
    const { issues } = await populateWith({
      extension: [fhirPathVariable('x', '%constructor.exists()'), fhirPathVariable('y', "'y'")],
    });
    expect(issues).toEqual([]);
  });
});

describe('populate 4.7.1 evaluation order with duplicate linkIds', () => {
  // Items d, e, then d again: the second d's variables take the first one's position, before e.
  const items = (second: Json): Json[] => [
    holder('d', [fhirPathVariable('x', "'first'")]),
    holder('e', [fhirPathVariable('y', "'e'")]),
    { linkId: 'd', type: 'group', item: [{ linkId: 'f', type: 'string' }], ...second },
  ];

  it('replaces the variables of an item with those of a later item with its linkId, at the position of the first', async () => {
    const { issues, context } = await populateWith({
      item: items({ extension: [fhirPathVariable('w', '%y')] }),
    });
    expect(issues).toEqual([undefinedVariable('y'), undefinedVariable('x')]);
    expect(context).not.toHaveProperty('x');
    expect(context?.y).toEqual(['e']);
  });

  it('replaces them with none when the later item has an empty extension array', async () => {
    const { context } = await populateWith({ item: items({ extension: [] }) });
    expect(context).not.toHaveProperty('x');
  });

  it('keeps them when the later item has no extension property', async () => {
    const { issues, context } = await populateWith({ item: items({}) });
    expect(issues).toEqual([]);
    expect(context?.x).toEqual(['first']);
  });

  // The key __proto__ sets the prototype of population's object instead of adding a key.
  it('never evaluates the variables of an item whose linkId is __proto__', async () => {
    const { success, issues, context } = await populateWith({
      item: [
        holder(
          'g',
          [],
          [{ linkId: '__proto__', type: 'string', extension: [fhirPathVariable('x', "'proto'")] }],
        ),
      ],
    });
    expect(success).toBe(true);
    expect(issues).toEqual([undefinedVariable('x')]);
    expect(context).not.toHaveProperty('x');
  });

  // Adding display text reads answerOptions['__proto__'], Object.prototype, and calls its map.
  it('fails population when the response gets an item whose linkId is __proto__', async () => {
    const { success, response } = await populateWith({
      item: [holder('__proto__', [], [{ linkId: 'a', type: 'string' }])],
    });
    expect(success).toBe(false);
    expect(response).toBeUndefined();
  });
});

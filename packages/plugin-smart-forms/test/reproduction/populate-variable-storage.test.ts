// Reproduces, against @aehrc/sdc-populate 4.7.1, how population stores the names a form declares
// (src/facts/variables.ts): one value per name for the whole form, whichever element declares it.
// Each test asserts the value an initialExpression gets, or the names in populatedContext, which
// the app passes on as additionalContext.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import {
  answersOf,
  patient,
  populate,
  responseItems,
  undefinedVariable,
  withPatientLaunch,
} from './populate.js';

type Json = Record<string, unknown>;

const INITIAL_EXPRESSION = `${sdc}initialExpression`;
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;
const LAUNCH_CONTEXT = `${sdc}launchContext`;
const CALCULATED_EXPRESSION = `${sdc}calculatedExpression`;
const ITEM_EXTRACTION_CONTEXT = `${sdc}itemExtractionContext`;

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
const group = (linkId: string, extension: Json[], item: Json[], fields: Json = {}): Json => ({
  linkId,
  type: 'group',
  extension,
  item,
  ...fields,
});
const launchContext = (...extension: Json[]): Json => ({ url: LAUNCH_CONTEXT, extension });
const patientName = { url: 'name', valueCoding: { system: LAUNCH_CONTEXT, code: 'patient' } };
const patientType = { url: 'type', valueCode: 'Patient' };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('populate 4.7.1 variable storage', () => {
  it('keeps one value for a name declared on the root and on an item', async () => {
    const { issues, context, response } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [fhirPathVariable('x', "'root'")],
          item: [
            group('g', [fhirPathVariable('x', "'item'")], [{ linkId: 'a', type: 'string' }]),
            question('q', '%x'),
          ],
        }),
      ),
    );
    expect(issues).toEqual([]);
    expect(context?.x).toEqual(['item']);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'item' }]);
  });

  it('keeps one value for a name declared on two sibling items, the later linkId in key order winning', async () => {
    // A record keyed by linkId: the integer-like linkId 2 comes first, then a.
    const { context } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group('a', [fhirPathVariable('x', "'from a'")], [{ linkId: 'a1', type: 'string' }]),
            group('2', [fhirPathVariable('x', "'from 2'")], [{ linkId: 'b1', type: 'string' }]),
          ],
        }),
      ),
    );
    expect(context?.x).toEqual(['from a']);
  });

  it('keeps one value for a name declared on two sibling items, the later linkId in document order winning when neither is integer-like', async () => {
    const { context } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group('b', [fhirPathVariable('x', "'from b'")], [{ linkId: 'b1', type: 'string' }]),
            group('c', [fhirPathVariable('x', "'from c'")], [{ linkId: 'c1', type: 'string' }]),
          ],
        }),
      ),
    );
    expect(context?.x).toEqual(['from c']);
  });

  it('gives the expressions of an inner item the value of an outer item that declares the same name', async () => {
    const { response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group(
              'outer',
              [fhirPathVariable('x', "'outer'")],
              [group('inner', [fhirPathVariable('x', "'inner'")], [question('q', '%x')])],
            ),
          ],
        }),
      ),
    );
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'outer' }]);
  });

  it('replaces the launch Patient with an item variable named patient, in populatedContext too', async () => {
    const { context, response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group(
              'g',
              [fhirPathVariable('patient', "'not a patient'")],
              [{ linkId: 'a', type: 'string' }],
            ),
            question('q', '%patient'),
          ],
        }),
      ),
    );
    expect(context?.patient).toEqual(['not a patient']);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'not a patient' }]);
  });

  it('replaces a variable with an itemPopulationContext of the same name', async () => {
    const { context, response } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [fhirPathVariable('x', "'variable'")],
          item: [
            group('g', [populationContext('x', "'context'")], [{ linkId: 'a', type: 'string' }]),
            question('q', '%x'),
          ],
        }),
      ),
    );
    expect(context?.x).toEqual(['context']);
    expect(answersOf(response, 'q')).toEqual([{ valueString: 'context' }]);
  });

  it('replaces an application/x-fhir-query variable with a FHIRPath variable of the same name', async () => {
    const { urls, context } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group(
              'g',
              [queryVariable('x', 'Observation?code=1')],
              [{ linkId: 'a', type: 'string' }],
            ),
            group('h', [fhirPathVariable('x', "'fhirpath'")], [{ linkId: 'b', type: 'string' }]),
          ],
        }),
      ),
    );
    expect(urls).toEqual(['Observation?code=1']);
    expect(context?.x).toEqual(['fhirpath']);
  });

  it('replaces a contained sourceQueries Bundle with a FHIRPath variable of the same name', async () => {
    const { context } = await populate(
      withPatientLaunch(
        questionnaire({
          contained: [{ resourceType: 'Bundle', id: 'pre', type: 'batch', entry: [] }],
          extension: [
            { url: `${sdc}sourceQueries`, valueReference: { reference: '#pre' } },
            fhirPathVariable('pre', "'variable'"),
          ],
          item: [{ linkId: 'a', type: 'string' }],
        }),
      ),
    );
    expect(context?.pre).toEqual(['variable']);
  });

  // A repeating group's children are bound by the text between the first % and the first . of
  // their initialExpression.
  it('builds both groups of two itemPopulationContexts with one name from the values of the last one', async () => {
    const { response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group('g', [populationContext('c', "'g1' | 'g2'")], [question('qg', '%c.toString()')], {
              repeats: true,
            }),
            group('h', [populationContext('c', "'h1'")], [question('qh', '%c.toString()')], {
              repeats: true,
            }),
          ],
        }),
      ),
    );
    const answers = (linkId: string) => responseItems(response, linkId).map((item) => item.answer);
    expect(answers('qg')).toEqual([[{ valueString: 'h1' }]]);
    expect(answers('qh')).toEqual([[{ valueString: 'h1' }]]);
  });

  it('evaluates an item variable on a repeating group once, against an empty input', async () => {
    const { context } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group(
              'g',
              [fhirPathVariable('v', 'linkId.exists() | %context.count()')],
              [{ linkId: 'a', type: 'string' }],
              { repeats: true },
            ),
          ],
        }),
      ),
    );
    expect(context?.v).toEqual([false, 1]);
  });
});

describe('populate 4.7.1 launchContext names', () => {
  it('binds a launchContext named by valueId', async () => {
    const { context } = await populate(
      questionnaire({
        extension: [launchContext({ url: 'name', valueId: 'patient' }, patientType)],
        item: [{ linkId: 'a', type: 'string' }],
      }),
    );
    expect(context?.patient).toMatchObject(patient);
  });

  it('reads the name from the first sub-extension, so a launchContext written type-first binds nothing', async () => {
    const { context } = await populate(
      questionnaire({
        extension: [launchContext(patientType, patientName)],
        item: [{ linkId: 'a', type: 'string' }],
      }),
    );
    expect(context).not.toHaveProperty('patient');
  });

  it('prefers valueId to valueCoding.code in the first sub-extension', async () => {
    const { context } = await populate(
      questionnaire({
        extension: [
          launchContext(
            { url: 'name', valueId: 'patient', valueCoding: { code: 'subject' } },
            patientType,
          ),
        ],
        item: [{ linkId: 'a', type: 'string' }],
      }),
    );
    expect(context).toHaveProperty('patient');
    expect(context).not.toHaveProperty('subject');
  });

  it('reads the resource type from the second sub-extension, so a description before the type binds nothing', async () => {
    const { context } = await populate(
      questionnaire({
        extension: [
          launchContext(
            patientName,
            { url: 'description', valueString: 'The patient' },
            patientType,
          ),
        ],
        item: [{ linkId: 'a', type: 'string' }],
      }),
    );
    expect(context).not.toHaveProperty('patient');
  });
});

// What population does not store: a reference to the name fails with "undefined environment
// variable", or gets the value of another declaration of the name.
describe('populate 4.7.1 names a form does not make available', () => {
  // An initialExpression that reads %x, beside the declarations under test.
  async function populateWith(fields: Json, root: Json[] = []) {
    return populate(
      withPatientLaunch(
        questionnaire({
          ...fields,
          extension: [...root, ...((fields.extension as Json[] | undefined) ?? [])],
          item: [...((fields.item as Json[] | undefined) ?? []), question('q', '%x')],
        }),
      ),
    );
  }

  // A form whose only declaration of %x is the given one: the reference fails and x is absent.
  async function expectUnavailable(fields: Json) {
    const { issues, context, response } = await populateWith(fields);
    expect(issues).toEqual([undefinedVariable('x')]);
    expect(context).not.toHaveProperty('x');
    expect(answersOf(response, 'q')).toEqual([]);
  }

  const onItem = (extension: Json): Json => ({
    item: [{ linkId: 'a', type: 'string', extension: [extension] }],
  });
  const named = (url: string): Json => ext(url, expression('text/fhirpath', "'named'", 'x'));
  const child = [{ linkId: 'a', type: 'string' }];

  it('stores no name for a named initialExpression', async () => {
    await expectUnavailable(onItem(named(INITIAL_EXPRESSION)));
  });

  it('stores no name for a named calculatedExpression', async () => {
    await expectUnavailable(onItem(named(CALCULATED_EXPRESSION)));
  });

  it('stores no name for a named itemExtractionContext', async () => {
    await expectUnavailable(onItem(named(ITEM_EXTRACTION_CONTEXT)));
  });

  it('stores no name for an itemPopulationContext on the root', async () => {
    await expectUnavailable({ extension: [populationContext('x', "'context'")] });
  });

  it('stores no name for an itemPopulationContext on an item with no child items', async () => {
    await expectUnavailable(onItem(populationContext('x', "'context'")));
  });

  it('stores no name for an itemPopulationContext on a group with an empty item array', async () => {
    await expectUnavailable({ item: [group('g', [populationContext('x', "'context'")], [])] });
  });

  it('stores no name for an itemPopulationContext after another on its item', async () => {
    await expectUnavailable({
      item: [
        group(
          'g',
          [populationContext('first', "'first'"), populationContext('x', "'context'")],
          child,
        ),
      ],
    });
  });

  it('stores no name for an itemPopulationContext without expression text', async () => {
    await expectUnavailable({
      item: [
        group('g', [ext(ITEM_POPULATION_CONTEXT, { language: 'text/fhirpath', name: 'x' })], child),
      ],
    });
  });

  it('gives a reference to a named expression the value of a contained sourceQueries Bundle of its name', async () => {
    const { context, response } = await populateWith(
      {
        contained: [{ resourceType: 'Bundle', id: 'x', type: 'batch', entry: [] }],
        item: [
          {
            linkId: 'a',
            type: 'string',
            extension: [ext(INITIAL_EXPRESSION, expression('text/fhirpath', "'named'", 'x'))],
          },
        ],
      },
      [{ url: `${sdc}sourceQueries`, valueReference: { reference: '#x' } }],
    );
    expect(context?.x).toMatchObject({ resourceType: 'Bundle', id: 'x' });
    expect(responseItems(response, 'q')).toHaveLength(1);
    expect(answersOf(response, 'q')).not.toEqual([]);
  });

  it('binds a variable beside a named calculatedExpression of the same name on one item', async () => {
    const { context } = await populateWith({
      item: [
        {
          linkId: 'a',
          type: 'string',
          extension: [
            ext(CALCULATED_EXPRESSION, expression('text/fhirpath', "'named'", 'x')),
            fhirPathVariable('x', "'variable'"),
          ],
        },
      ],
    });
    expect(context?.x).toEqual(['variable']);
  });
});

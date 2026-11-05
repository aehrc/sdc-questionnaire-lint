/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// Reproduces, against @aehrc/sdc-populate 4.7.1, what population needs before it reads an
// expression (src/facts/prerequisites.ts), and when population runs at all.
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import {
  answersOf,
  populate,
  responseItems,
  undefinedVariable,
  withPatientLaunch,
} from './populate.js';

const INITIAL_EXPRESSION = `${sdc}initialExpression`;
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;

const initial = (text: string) => ext(INITIAL_EXPRESSION, expression('text/fhirpath', text));
const question = (linkId: string, ...texts: string[]) => ({
  linkId,
  type: 'string',
  extension: texts.map(initial),
});
const context = (name: string | undefined, text?: string) =>
  ext(ITEM_POPULATION_CONTEXT, {
    language: 'text/fhirpath',
    ...(text === undefined ? {} : { expression: text }),
    ...(name === undefined ? {} : { name }),
  });

// A root query variable %obs whose search returns two Observations, one per repetition.
const twoObservations = {
  extension: [
    ext(
      VARIABLE,
      expression('application/x-fhir-query', 'Observation?patient={{%patient.id}}', 'obs'),
    ),
  ],
};
const fetchTwo = (url: string) =>
  url.startsWith('Observation?')
    ? {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: ['a', 'b'].map((value) => ({
          resource: { resourceType: 'Observation', valueString: value },
        })),
      }
    : undefined;

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('populate 4.7.1 initialExpression prerequisites', () => {
  it('evaluates only the first initialExpression on an item', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(questionnaire({ item: [question('q1', "'first'", '%missing')] })),
    );
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'first' }]);
  });

  it('evaluates an initialExpression in a repeating group without an itemPopulationContext, but prefills nothing', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              item: [question('q1', "'x'"), question('q2', '%missing')],
            },
          ],
        }),
      ),
    );
    expect(issues).toEqual([undefinedVariable('missing')]);
    expect(answersOf(response, 'q1')).toEqual([]);
  });

  it('prefills a child of a repeating group bound by its itemPopulationContext once per repetition', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          ...twoObservations,
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              extension: [context('ob', '%obs.entry.resource')],
              item: [question('q1', '%ob.valueString')],
            },
          ],
        }),
      ),
      { fetch: fetchTwo },
    );
    expect(issues).toEqual([]);
    expect(responseItems(response, 'q1').map((item) => item.answer)).toEqual([
      [{ valueString: 'a' }],
      [{ valueString: 'b' }],
    ]);
  });

  it('does not evaluate an item in a nested repeating group without its own itemPopulationContext', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          ...twoObservations,
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              extension: [context('ob', '%obs.entry.resource')],
              item: [
                question('q1', '%ob.valueString'),
                {
                  linkId: 'h',
                  type: 'group',
                  repeats: true,
                  item: [question('q2', '%ob.valueString'), question('q3', '%missing')],
                },
              ],
            },
          ],
        }),
      ),
      { fetch: fetchTwo },
    );
    expect(responseItems(response, 'q1')).toHaveLength(2);
    expect(responseItems(response, 'q2').flatMap((item) => item.answer ?? [])).toEqual([]);
    // A failing expression there neither adds an issue nor warns: it is never evaluated.
    expect(issues).toEqual([]);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('missing'));
  });

  it('only warns, adding no issue, when a child of a repeating itemPopulationContext group fails', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          ...twoObservations,
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              extension: [context('ob', '%obs.entry.resource')],
              item: [question('q1', '%ob.valueString'), question('q2', '%ob.valueString & %qitem')],
            },
          ],
        }),
      ),
      { fetch: fetchTwo },
    );
    expect(issues).toEqual([]);
    expect(responseItems(response, 'q2').flatMap((item) => item.answer ?? [])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('undefined environment variable: qitem'),
    );
  });
});

describe('populate 4.7.1 itemPopulationContext prerequisites', () => {
  const group = (extension: unknown[], children = [question('q1', "'x'")]) => ({
    linkId: 'g',
    type: 'group',
    repeats: true,
    extension,
    item: children,
  });

  // An itemPopulationContext with failing text that population never evaluates: no issue.
  async function expectNotEvaluated(fields: Record<string, unknown>) {
    const { issues } = await populate(withPatientLaunch(questionnaire(fields)));
    expect(issues).toEqual([]);
  }

  it('does not evaluate one on a leaf item', async () => {
    await expectNotEvaluated({
      item: [{ linkId: 'q1', type: 'string', extension: [context('a', '%missing')] }],
    });
  });

  it('does not evaluate one on the root', async () => {
    await expectNotEvaluated({
      extension: [context('a', '%missing')],
      item: [question('q1', "'x'")],
    });
  });

  it('does not evaluate one without a name', async () => {
    await expectNotEvaluated({ item: [group([context(undefined, '%missing')])] });
  });

  it('does not evaluate one after another on the same item', async () => {
    await expectNotEvaluated({ item: [group([context('a', "'x'"), context('b', '%missing')])] });
  });

  it('does not evaluate one with no text', async () => {
    const { issues } = await populate(
      withPatientLaunch(questionnaire({ item: [group([context('a')])] })),
    );
    expect(issues).toEqual([]);
  });

  it('never evaluates one that a later one with the same name replaces', async () => {
    const { issues } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            group([context('a', '%missing')]),
            { ...group([context('a', '%obs2')]), linkId: 'h' },
          ],
        }),
      ),
    );
    // The kept one fails, once for each time populate evaluates it; the replaced one never does.
    expect(issues).not.toEqual([]);
    for (const issue of issues) expect(issue).toEqual(undefinedVariable('obs2'));
  });
});

describe('populate 4.7.1 environment', () => {
  it('does not populate a form with no launchContext, sourceQueries or query variable', async () => {
    const { success, response } = await populate(
      questionnaire({
        extension: [ext(VARIABLE, expression('text/fhirpath', "'x'", 'v'))],
        item: [question('q1', '%v')],
      }),
    );
    expect(success).toBe(false);
    expect(response).toBeUndefined();
  });

  it('populates a form whose only input is a query variable', async () => {
    const { success, urls } = await populate(
      questionnaire({
        extension: [ext(VARIABLE, expression('application/x-fhir-query', 'Observation', 'obs'))],
        item: [question('q1', "'x'")],
      }),
    );
    expect(success).toBe(true);
    expect(urls).toEqual(['Observation']);
  });

  it('populates a form whose only input is a sourceQueries reference', async () => {
    const { success } = await populate(
      questionnaire({
        extension: [{ url: `${sdc}sourceQueries`, valueReference: { reference: 'Observation' } }],
        item: [question('q1', "'x'")],
      }),
    );
    expect(success).toBe(true);
  });

  it('populates a form whose only input is an item query variable', async () => {
    const { success } = await populate(
      questionnaire({
        item: [
          {
            ...question('q1', "'x'"),
            extension: [
              ext(VARIABLE, expression('application/x-fhir-query', 'Observation', 'obs')),
            ],
          },
        ],
      }),
    );
    expect(success).toBe(true);
  });

  it('populates a form whose launchContext has its name and type found by URL, whatever their order', async () => {
    const typeFirst = {
      url: `${sdc}launchContext`,
      extension: [
        { url: 'type', valueCode: 'Patient' },
        { url: 'name', valueCoding: { code: 'patient' } },
      ],
    };
    const { success, context } = await populate(
      questionnaire({ extension: [typeFirst], item: [question('q1', "'x'")] }),
    );
    expect(success).toBe(true);
    expect(context).not.toHaveProperty('patient');
  });

  it('does not populate a form with a query variable without text, or a launchContext without a type', async () => {
    const noText = await populate(
      questionnaire({
        extension: [ext(VARIABLE, { language: 'application/x-fhir-query', name: 'obs' })],
        item: [question('q1', "'x'")],
      }),
    );
    expect(noText.success).toBe(false);
    const noType = await populate(
      questionnaire({
        extension: [
          {
            url: `${sdc}launchContext`,
            extension: [{ url: 'name', valueCoding: { code: 'patient' } }],
          },
        ],
        item: [question('q1', "'x'")],
      }),
    );
    expect(noType.success).toBe(false);
  });

  it('does not populate a form whose subjectType lacks Patient', async () => {
    const { success, response } = await populate(
      withPatientLaunch(questionnaire({ subjectType: ['Group'], item: [question('q1', "'x'")] })),
    );
    expect(success).toBe(false);
    expect(response).toBeUndefined();
  });

  it('skips item FHIRPath variables when the root has no extensions', async () => {
    const item = {
      linkId: 'g',
      type: 'group',
      extension: [ext(VARIABLE, expression('text/fhirpath', "'item value'", 'v'))],
      item: [question('q1', '%v')],
    };
    // The patient launchContext is a contained-free alternative to root extensions: a query
    // variable on the item lets population run with none on the root.
    const query = ext(VARIABLE, expression('application/x-fhir-query', 'Observation', 'obs'));
    const withoutRoot = await populate(
      questionnaire({ item: [{ ...item, extension: [query, ...item.extension] }] }),
    );
    expect(withoutRoot.success).toBe(true);
    expect(withoutRoot.issues).toEqual([undefinedVariable('v')]);
    const withRoot = await populate(withPatientLaunch(questionnaire({ item: [item] })));
    expect(answersOf(withRoot.response, 'q1')).toEqual([{ valueString: 'item value' }]);
  });
});

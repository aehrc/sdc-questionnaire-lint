/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// Reproduces, against @aehrc/sdc-template-extract 1.0.15, how extraction reads a
// templateExtractContext (src/facts/extraction.ts). Each context is on an Observation component,
// never on the template root, and each warning is matched with its logical path: a
// templateExtractValue without valueString gets the same text.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { questionnaire, templateExtract } from '../support/sites.js';
import { component, context, extract, observation, responseTo } from './extract.js';

type Json = Record<string, unknown>;

const fhirpath = (expression: string, name?: string): Json => ({
  language: 'text/fhirpath',
  expression,
  ...(name === undefined ? {} : { name }),
});

// The group g references the template obs, whose components are given; its children c and d are
// answered A and D.
const extractComponents = (components: readonly Json[]) =>
  extract(
    questionnaire({
      contained: [observation('obs', { component: components })],
      item: [
        {
          linkId: 'g',
          type: 'group',
          extension: [templateExtract('#obs')],
          item: [
            { linkId: 'c', type: 'string' },
            { linkId: 'd', type: 'string' },
          ],
        },
      ],
    }),
    responseTo([
      {
        linkId: 'g',
        item: [
          { linkId: 'c', answer: [{ valueString: 'A' }] },
          { linkId: 'd', answer: [{ valueString: 'D' }] },
        ],
      },
    ]),
  );

// The Observation extracted from obs, which loses its id, with the given components.
const extracted = (components: readonly Json[]): Json => ({
  resourceType: 'Observation',
  status: 'final',
  code: { text: 'obs' },
  component: components,
});

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const both = "item.where(linkId='c' or linkId='d')";
const noValueString = (path: string): string =>
  `Template obs: TemplateExtractContext extension found on ${path} but no valueString found.`;

describe('template-extract 1.0.15 templateExtractContext', () => {
  it('warns about a context without valueString and extracts the values below it without it', async () => {
    const ignored = context({ valueExpression: fhirpath(both) });
    const { success, issues, resources } = await extractComponents([
      component([ignored], "item.where(linkId='c').answer.value"),
    ]);
    expect(success).toBe(true);
    expect(issues).toEqual([noValueString('Observation.component[0].extension[0]')]);
    // One component, not one per result of the context; its value is evaluated against the
    // response item of g, and the extension is left in the output.
    expect(resources).toEqual([
      extracted([{ extension: [ignored], code: { text: 'c' }, valueString: 'A' }]),
    ]);
  });

  it('repeats the element for each result of a valueString context and removes it', async () => {
    const { issues, resources } = await extractComponents([
      component([context({ valueString: both })]),
    ]);
    expect(issues).toEqual([]);
    expect(resources).toEqual([
      extracted([
        { code: { text: 'c' }, valueString: 'A' },
        { code: { text: 'c' }, valueString: 'D' },
      ]),
    ]);
  });

  it('reads valueString when both valueString and valueExpression are present', async () => {
    const { issues, resources } = await extractComponents([
      component([
        context({
          valueString: "item.where(linkId='c')",
          valueExpression: fhirpath("item.where(linkId='d')"),
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
    expect(resources).toEqual([extracted([{ code: { text: 'c' }, valueString: 'A' }])]);
  });

  it('reads only the first templateExtractContext in an extension array', async () => {
    const second = context({ valueExpression: fhirpath("item.where(linkId='d')") });
    const first = await extractComponents([
      component([context({ valueString: "item.where(linkId='c')" }), second]),
    ]);
    // The second is never read: no warning, and it stays in the output.
    expect(first.issues).toEqual([]);
    expect(first.resources).toEqual([
      extracted([{ extension: [second], code: { text: 'c' }, valueString: 'A' }]),
    ]);

    const ignored = context({ valueExpression: fhirpath("item.where(linkId='c')") });
    const later = context({ valueString: "item.where(linkId='d')" });
    const { issues, resources } = await extractComponents([component([ignored, later])]);
    expect(issues).toEqual([noValueString('Observation.component[0].extension[0]')]);
    // The later valueString context is not used either: the value has no context.
    expect(resources).toEqual([extracted([{ extension: [ignored, later], code: { text: 'c' } }])]);
  });

  it('binds no name to a context', async () => {
    const undefinedCtx = 'Error: Attempting to access an undefined environment variable: ctx';
    const named = await extractComponents([
      component(
        [context({ valueExpression: fhirpath("item.where(linkId='c')", 'ctx') })],
        '%ctx.answer.value',
      ),
    ]);
    expect(named.issues).toEqual([
      noValueString('Observation.component[0].extension[0]'),
      undefinedCtx,
    ]);

    // Not even a context read from valueString binds the name of its valueExpression.
    const read = await extractComponents([
      component(
        [
          context({
            valueString: "item.where(linkId='c')",
            valueExpression: fhirpath("item.where(linkId='c')", 'ctx'),
          }),
        ],
        '%ctx.answer.value',
      ),
    ]);
    expect(read.issues).toEqual([undefinedCtx]);
  });
});

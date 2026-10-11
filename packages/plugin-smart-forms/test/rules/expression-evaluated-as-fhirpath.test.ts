import { describe, expect, it } from 'vitest';
import { findingsOf } from '../support/lint.js';
import { expression, ext, questionnaire, sdc, targetConstraint, toggle } from '../support/sites.js';

const ruleId = 'smart-forms/expression-evaluated-as-fhirpath';
const check = (resource: Record<string, unknown>, config = '') =>
  findingsOf(ruleId, resource, config);

const rewrite = 'rewrite it in FHIRPath with the language text/fhirpath';
const contextHelp =
  'fetch the resources in an application/x-fhir-query variable on the Questionnaire root, and ' +
  'set itemPopulationContext to FHIRPath over it, such as %name.entry.resource';

const item = (fields: Record<string, unknown> = {}) => ({
  linkId: 'bp',
  text: 'Blood pressure',
  type: 'integer',
  ...fields,
});
const onItem = (...extension: unknown[]) => questionnaire({ item: [item({ extension })] });
const group = (extension: unknown[], children: unknown[] = [item()]) =>
  questionnaire({
    item: [
      {
        linkId: 'meds',
        text: 'Medications',
        type: 'group',
        repeats: true,
        extension,
        item: children,
      },
    ],
  });

describe(ruleId, () => {
  describe('reports', () => {
    it.each(['text/cql', 'text/cql-identifier', 'text/cql-expression'])(
      'a %s targetConstraint, saying the CQL is never run',
      async (language) => {
        const resource = onItem(targetConstraint(expression(language, 'intersectCheck')));
        expect(await check(resource)).toEqual([
          {
            pointer: '/item/0/extension/0/extension/2/valueExpression/expression',
            message:
              'Smart Forms renderer evaluates this targetConstraint on item "Blood pressure" (bp) ' +
              `as FHIRPath although it is written in ${language}, so the ${language} is never run.`,
            help: rewrite,
          },
        ]);
      },
    );

    it.each(['application/x-fhir-query', 'text/x-fhir-query'])(
      'a %s targetConstraint on the root',
      async (language) => {
        const resource = questionnaire({
          extension: [targetConstraint(expression(language, 'Observation?code=x'))],
        });
        expect(await check(resource)).toEqual([
          {
            pointer: '/extension/0/extension/2/valueExpression/expression',
            message:
              'Smart Forms renderer evaluates this targetConstraint on the Questionnaire root as ' +
              `FHIRPath although it is written in ${language}, so the constraint never reports a ` +
              'problem.',
            help: rewrite,
          },
        ]);
      },
    );

    it('a query targetConstraint whose text contains intersect, saying the query is never run', async () => {
      const resource = onItem(
        targetConstraint(expression('application/x-fhir-query', 'intersect')),
      );
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(
            'so the application/x-fhir-query is never run.',
          ) as string,
        }),
      ]);
    });

    it.each(['text/cql', 'text/cql-expression'])(
      'a %s answerOptionsToggleExpression',
      async (language) => {
        const resource = onItem(toggle(expression(language, 'true')));
        expect(await check(resource)).toEqual([
          {
            pointer: '/item/0/extension/0/extension/1/valueExpression/expression',
            message:
              'Smart Forms renderer evaluates this answerOptionsToggleExpression on item "Blood ' +
              `pressure" (bp) as FHIRPath although it is written in ${language}, so the ${language} ` +
              'is never run.',
            help: rewrite,
          },
        ]);
      },
    );

    it('a text/cql initialExpression', async () => {
      const resource = onItem(ext(`${sdc}initialExpression`, expression('text/cql', 'Systolic')));
      expect(await check(resource)).toEqual([
        {
          pointer: '/item/0/extension/0/valueExpression/expression',
          message:
            'Smart Forms population evaluates this initialExpression on item "Blood pressure" (bp) ' +
            'as FHIRPath although it is written in text/cql, so the text/cql is never run.',
          help: rewrite,
        },
      ]);
    });

    it('an application/x-fhir-query initialExpression on an item without text', async () => {
      const resource = questionnaire({
        item: [
          {
            linkId: 'bp',
            type: 'integer',
            extension: [
              ext(
                `${sdc}initialExpression`,
                expression('application/x-fhir-query', 'Observation?code=x'),
              ),
            ],
          },
        ],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          message:
            'Smart Forms population evaluates this initialExpression on item bp as FHIRPath ' +
            'although it is written in application/x-fhir-query, so the answer is not prefilled.',
          help: rewrite,
        }),
      ]);
    });

    it('an initialExpression on a child of a repeating itemPopulationContext group', async () => {
      const resource = group(
        [
          ext(
            `${sdc}itemPopulationContext`,
            expression('text/fhirpath', '%meds.entry.resource', 'med'),
          ),
        ],
        [
          item({
            linkId: 'name',
            extension: [
              ext(`${sdc}initialExpression`, expression('text/fhirpath', '%med.code.text')),
            ],
          }),
          item({
            linkId: 'dose',
            extension: [ext(`${sdc}initialExpression`, expression('text/cql', 'Dose'))],
          }),
        ],
      );
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: '/item/0/item/1/extension/0/valueExpression/expression',
        }),
      ]);
    });

    it.each(['application/x-fhir-query', 'text/x-fhir-query'])(
      'a %s itemPopulationContext on a group with child items',
      async (language) => {
        const resource = group([
          ext(
            `${sdc}itemPopulationContext`,
            expression(language, 'MedicationStatement?patient=1', 'med'),
          ),
        ]);
        expect(await check(resource)).toEqual([
          {
            pointer: '/item/0/extension/0/valueExpression/expression',
            message:
              'Smart Forms population evaluates this itemPopulationContext on item "Medications" ' +
              `(meds) as FHIRPath although it is written in ${language}, so the group is not ` +
              'prefilled.',
            help: contextHelp,
          },
        ]);
      },
    );
  });

  describe('stays silent', () => {
    it.each(['application/x-fhir-query', 'text/x-fhir-query'])(
      'on a %s answerOptionsToggleExpression, which SDC does not allow, even with the core rule off',
      async (language) => {
        const resource = onItem(toggle(expression(language, 'Patient?_id=1')));
        expect(await check(resource)).toEqual([]);
        expect(await check(resource, "rules: { 'sdc/language-not-allowed': 'off' }")).toEqual([]);
      },
    );

    it('on a language outside the six codes, even with the core rule off', async () => {
      const resource = onItem(targetConstraint(expression('text/fhir-path', 'true')));
      expect(await check(resource)).toEqual([]);
      expect(await check(resource, "rules: { 'sdc/language-not-in-value-set': 'off' }")).toEqual(
        [],
      );
    });

    it('on a targetConstraint with severity fatal', async () => {
      const resource = onItem(
        targetConstraint(expression('text/cql', 'true'), {
          severity: { url: 'severity', valueCode: 'fatal' },
        }),
      );
      expect(await check(resource)).toEqual([]);
    });

    it('on a targetConstraint a later one with the same key replaces', async () => {
      const resource = questionnaire({
        extension: [targetConstraint(expression('text/cql', 'true'))],
        item: [item({ extension: [targetConstraint(expression('text/fhirpath', 'true'))] })],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('but reports the targetConstraint that replaces an earlier one with the same key', async () => {
      const resource = questionnaire({
        extension: [targetConstraint(expression('text/fhirpath', 'true'))],
        item: [item({ extension: [targetConstraint(expression('text/cql', 'true'))] })],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: '/item/0/extension/0/extension/2/valueExpression/expression',
        }),
      ]);
    });

    it('on an itemPopulationContext a later one with the same name replaces', async () => {
      const context = (language: string) =>
        ext(`${sdc}itemPopulationContext`, expression(language, 'Patient', 'ctx'));
      const resource = questionnaire({
        item: [
          {
            linkId: 'a',
            type: 'group',
            extension: [context('application/x-fhir-query')],
            item: [item()],
          },
          {
            linkId: 'b',
            type: 'group',
            extension: [context('text/fhirpath')],
            item: [item({ linkId: 'c' })],
          },
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('on a toggle without an option', async () => {
      expect(
        await check(onItem(toggle(expression('text/cql', 'true'), { option: undefined }))),
      ).toEqual([]);
    });

    it('on an itemPopulationContext without child items, without a name, or on the root', async () => {
      const context = (name?: string) =>
        ext(`${sdc}itemPopulationContext`, expression('application/x-fhir-query', 'Patient', name));
      expect(await check(onItem(context('p')))).toEqual([]);
      expect(await check(group([context()]))).toEqual([]);
      expect(await check(questionnaire({ extension: [context('p')] }))).toEqual([]);
    });

    it('on a second initialExpression', async () => {
      const resource = onItem(
        ext(`${sdc}initialExpression`, expression('text/fhirpath', '1')),
        ext(`${sdc}initialExpression`, expression('text/cql', '1')),
      );
      expect(await check(resource)).toEqual([]);
    });

    it('on text/fhirpath at every location', async () => {
      const fhirpath = (name?: string) => expression('text/fhirpath', 'true', name);
      const resource = group(
        [targetConstraint(fhirpath()), ext(`${sdc}itemPopulationContext`, fhirpath('ctx'))],
        // The initialExpression names the context, so population evaluates it.
        [
          item({
            extension: [
              ext(`${sdc}initialExpression`, expression('text/fhirpath', '%ctx.id')),
              toggle(fhirpath()),
            ],
          }),
        ],
      );
      expect(await check(resource)).toEqual([]);
    });

    it('on locations the other rule checks', async () => {
      const resource = onItem(ext(`${sdc}calculatedExpression`, expression('text/cql', '1')));
      expect(await check(resource)).toEqual([]);
    });
  });
});

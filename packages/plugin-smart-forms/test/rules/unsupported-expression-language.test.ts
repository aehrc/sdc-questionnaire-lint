import { describe, expect, it } from 'vitest';
import { findingsOf } from '../support/lint.js';
import { CQF_EXPRESSION, expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';

const ruleId = 'smart-forms/unsupported-expression-language';
const check = (resource: Record<string, unknown>, config = '') =>
  findingsOf(ruleId, resource, config);

const rewrite =
  'rewrite it in FHIRPath with the language text/fhirpath; to use server data, fetch it in an ' +
  'application/x-fhir-query variable on this item or an ancestor and reference that variable';
const queryCode =
  'Smart Forms runs a query in a variable only when its language is application/x-fhir-query';

const item = (fields: Record<string, unknown> = {}) => ({
  linkId: 'age',
  text: 'Age',
  type: 'integer',
  ...fields,
});
const onItem = (...extension: unknown[]) => questionnaire({ item: [item({ extension })] });

describe(ruleId, () => {
  describe('reports', () => {
    it('a text/x-fhir-query variable on the root', async () => {
      const resource = questionnaire({
        extension: [ext(VARIABLE, expression('text/x-fhir-query', 'Condition?patient=1', 'conds'))],
      });
      expect(await check(resource)).toEqual([
        {
          pointer: '/extension/0/valueExpression/expression',
          message:
            'Smart Forms ignores this variable on the Questionnaire root because it is written in ' +
            'text/x-fhir-query; it uses only text/fhirpath here, so this variable never sets %conds.',
          help: queryCode,
        },
      ]);
    });

    it('a text/x-fhir-query variable on an item, naming the item', async () => {
      const resource = onItem(
        ext(VARIABLE, expression('text/x-fhir-query', 'Condition?patient=1', 'conds')),
      );
      expect(await check(resource)).toEqual([
        {
          pointer: '/item/0/extension/0/valueExpression/expression',
          message:
            'Smart Forms ignores this variable on item "Age" (age) because it is written in ' +
            'text/x-fhir-query; it uses only text/fhirpath here, so this variable never sets %conds.',
          help: queryCode,
        },
      ]);
    });

    it('a text/cql variable', async () => {
      const resource = onItem(ext(VARIABLE, expression('text/cql', 'AgeInYears()', 'years')));
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          message:
            'Smart Forms ignores this variable on item "Age" (age) because it is written in ' +
            'text/cql; it uses only text/fhirpath here, so this variable never sets %years.',
          help: rewrite,
        }),
      ]);
    });

    it('a CQL variable on an item whose name a root FHIRPath variable also declares', async () => {
      const resource = questionnaire({
        extension: [ext(VARIABLE, expression('text/fhirpath', '1', 'x'))],
        item: [item({ extension: [ext(VARIABLE, expression('text/cql', '2', 'x'))] })],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: '/item/0/extension/0/valueExpression/expression',
          message: expect.stringContaining('so this variable never sets %x.') as string,
        }),
      ]);
    });

    it('an application/x-fhir-query calculatedExpression', async () => {
      const resource = onItem(
        ext(
          `${sdc}calculatedExpression`,
          expression('application/x-fhir-query', 'Observation?code=x'),
        ),
      );
      expect(await check(resource)).toEqual([
        {
          pointer: '/item/0/extension/0/valueExpression/expression',
          message:
            'Smart Forms ignores this calculatedExpression on item "Age" (age) because it is ' +
            'written in application/x-fhir-query; it uses only text/fhirpath here, so the answer ' +
            'is never calculated from it.',
          help: rewrite,
        },
      ]);
    });

    it('a lone text/cql enableWhenExpression', async () => {
      const resource = onItem(ext(`${sdc}enableWhenExpression`, expression('text/cql', 'true')));
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          message:
            'Smart Forms ignores this enableWhenExpression on item "Age" (age) because it is ' +
            'written in text/cql; it uses only text/fhirpath here, so this expression never ' +
            'disables the item.',
        }),
      ]);
    });

    it.each(['application/x-fhir-query', 'text/x-fhir-query'])(
      'a lone %s answerExpression',
      async (language) => {
        const resource = onItem(
          ext(`${sdc}answerExpression`, expression(language, 'ValueSet?url=x')),
        );
        expect(await check(resource)).toEqual([
          expect.objectContaining({
            message:
              'Smart Forms ignores this answerExpression on item "Age" (age) because it is ' +
              `written in ${language}; it uses only text/fhirpath here, so its answers are not ` +
              'computed from it.',
            help: rewrite,
          }),
        ]);
      },
    );

    it.each([
      ['text', 'cqf-expression on text', 'the text is not updated from it'],
      ['prefix', 'cqf-expression on prefix', 'the prefix is not updated from it'],
      [
        'answerValueSet',
        'cqf-expression on answerValueSet',
        'the answer value set is not computed from it',
      ],
    ])('a text/cql cqf-expression on _%s', async (element, name, consequence) => {
      const resource = questionnaire({
        item: [
          item({
            [`_${element}`]: { extension: [ext(CQF_EXPRESSION, expression('text/cql', "'x'"))] },
          }),
        ],
      });
      expect(await check(resource)).toEqual([
        {
          pointer: `/item/0/_${element}/extension/0/valueExpression/expression`,
          message:
            `Smart Forms ignores this ${name} on item "Age" (age) because it is written in ` +
            `text/cql; it uses only text/fhirpath here, so ${consequence}.`,
          help: rewrite,
        },
      ]);
    });

    it('naming an item without text by its linkId', async () => {
      const resource = questionnaire({
        item: [
          {
            linkId: 'age',
            type: 'integer',
            extension: [ext(`${sdc}calculatedExpression`, expression('text/cql', '1'))],
          },
        ],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(
            'this calculatedExpression on item age because',
          ) as string,
        }),
      ]);
    });
  });

  describe('stays silent', () => {
    it.each(['text/x-fhir-query', 'application/x-fhir-query'])(
      'on a %s enableWhenExpression, which SDC does not allow, even with the core rule off',
      async (language) => {
        const resource = onItem(
          ext(`${sdc}enableWhenExpression`, expression(language, 'Patient?_id=1')),
        );
        expect(await check(resource)).toEqual([]);
        expect(await check(resource, "rules: { 'sdc/language-not-allowed': 'off' }")).toEqual([]);
      },
    );

    it('on a language outside the six codes, even with the core rule off', async () => {
      const resource = onItem(ext(`${sdc}calculatedExpression`, expression('text/fhir-path', '1')));
      expect(await check(resource)).toEqual([]);
      expect(await check(resource, "rules: { 'sdc/language-not-in-value-set': 'off' }")).toEqual(
        [],
      );
    });

    it('on an uncatalogued expression', async () => {
      const resource = questionnaire({
        contained: [
          {
            resourceType: 'Library',
            id: 'l',
            extension: [ext(VARIABLE, expression('text/cql', '1', 'x'))],
          },
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('on an initialExpression', async () => {
      expect(
        await check(onItem(ext(`${sdc}initialExpression`, expression('text/cql', '1')))),
      ).toEqual([]);
    });

    it('on a location nothing reads', async () => {
      const resource = questionnaire({
        _title: { extension: [ext(CQF_EXPRESSION, expression('text/cql', "'x'"))] },
        item: [
          item({ extension: [ext(`${sdc}candidateExpression`, expression('text/cql', '1'))] }),
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it.each(['enableWhenExpression', 'answerExpression', 'calculatedExpression'])(
      'on a text/cql %s next to a text/fhirpath one',
      async (name) => {
        const resource = onItem(
          ext(`${sdc}${name}`, expression('text/cql', 'true')),
          ext(`${sdc}${name}`, expression('text/fhirpath', 'true')),
        );
        expect(await check(resource)).toEqual([]);
      },
    );

    it('on a text/cql cqf-expression next to a text/fhirpath one', async () => {
      const resource = questionnaire({
        item: [
          item({
            _text: {
              extension: [
                ext(CQF_EXPRESSION, expression('text/cql', "'x'")),
                ext(CQF_EXPRESSION, expression('text/fhirpath', "'x'")),
              ],
            },
          }),
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it.each(['text/fhirpath', 'application/x-fhir-query'])(
      'on a CQL variable next to a %s variable with the same name, even with the core rule off',
      async (language) => {
        const resource = onItem(
          ext(VARIABLE, expression('text/cql', '1', 'x')),
          ext(VARIABLE, expression(language, language === 'text/fhirpath' ? '1' : 'Patient', 'x')),
        );
        expect(await check(resource)).toEqual([]);
        expect(await check(resource, "rules: { 'sdc/duplicate-declaration': 'off' }")).toEqual([]);
      },
    );

    it('on an unnamed CQL variable', async () => {
      expect(await check(onItem(ext(VARIABLE, expression('text/cql', '1'))))).toEqual([]);
    });

    it('on application/x-fhir-query variables on the root and items', async () => {
      const query = () =>
        ext(VARIABLE, expression('application/x-fhir-query', 'Patient?_id=1', 'p'));
      const resource = questionnaire({
        extension: [query()],
        item: [item({ extension: [query()] })],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('on text/fhirpath at every location', async () => {
      const fhirpath = (name?: string) => expression('text/fhirpath', 'true', name);
      const resource = questionnaire({
        extension: [ext(VARIABLE, fhirpath('r'))],
        item: [
          item({
            _text: { extension: [ext(CQF_EXPRESSION, fhirpath())] },
            _prefix: { extension: [ext(CQF_EXPRESSION, fhirpath())] },
            _answerValueSet: { extension: [ext(CQF_EXPRESSION, fhirpath())] },
            extension: [
              ext(VARIABLE, fhirpath('v')),
              ext(`${sdc}calculatedExpression`, fhirpath()),
              ext(`${sdc}enableWhenExpression`, fhirpath()),
              ext(`${sdc}answerExpression`, fhirpath()),
            ],
          }),
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('on a reference-only Expression', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, { language: 'text/cql', reference: 'Library/x' }),
      );
      expect(await check(resource)).toEqual([]);
    });
  });
});

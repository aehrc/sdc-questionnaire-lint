import { describe, expect, it } from 'vitest';
import { lintWithPlugin } from '../support/lint.js';
import {
  CQF_EXPRESSION,
  expression,
  ext,
  questionnaire,
  sdc,
  targetConstraint,
  toggle,
  VARIABLE,
} from '../support/sites.js';

const ruleId = 'smart-forms/questionnaire-variable-unavailable';

// The rule's findings, with the range and note the report gives them.
async function check(resource: Record<string, unknown>, config = '') {
  const report = await lintWithPlugin({ 'Questionnaire-Q.json': JSON.stringify(resource) }, config);
  return report.findings.flatMap((finding) =>
    finding.ruleId === ruleId
      ? [
          {
            pointer: finding.jsonLocation.pointer,
            range: finding.expression?.range,
            message: finding.message,
            help: finding.help,
            note: finding.note,
          },
        ]
      : [],
  );
}

const copy = 'copy the value the expression needs from the Questionnaire into the expression';
const note = (name: string) =>
  `if the application running the form supplies %${name}, suppress this finding with a reason that names the application`;
const patientLaunch = {
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { system: `${sdc}launchContext`, code: 'patient' } },
    { url: 'type', valueCode: 'Patient' },
  ],
};

const fhirpath = (text: string, name?: string) => expression('text/fhirpath', text, name);
const item = (fields: Record<string, unknown> = {}) => ({
  linkId: 'age',
  text: 'Age',
  type: 'integer',
  ...fields,
});
// A Questionnaire with a patient launchContext, so that population runs, and one item.
const onItem = (...extension: unknown[]) =>
  questionnaire({ extension: [patientLaunch], item: [item({ extension })] });
const at = (index: number) => `/item/0/extension/${String(index)}/valueExpression/expression`;
const general = (name: string, extension: string, element: string, consequence: string) =>
  `Smart Forms does not supply %${name}, so this ${extension} on ${element} fails when the ` +
  `reference is evaluated, and ${consequence}.`;

describe(ruleId, () => {
  describe('reports', () => {
    it('a root variable that uses %questionnaire', async () => {
      const resource = questionnaire({
        extension: [patientLaunch, ext(VARIABLE, fhirpath('%questionnaire.title', 'title'))],
      });
      expect(await check(resource)).toEqual([
        {
          pointer: '/extension/1/valueExpression/expression',
          range: { startOffset: 0, endOffset: 14 },
          message: general(
            'questionnaire',
            'variable',
            'the Questionnaire root',
            '%title gets no value from it',
          ),
          help: copy,
          note: note('questionnaire'),
        },
      ]);
    });

    it('an item variable that uses %qitem', async () => {
      expect(await check(onItem(ext(VARIABLE, fhirpath('%qitem.text', 't'))))).toEqual([
        {
          pointer: at(0),
          range: { startOffset: 0, endOffset: 6 },
          message: general('qitem', 'variable', 'item "Age" (age)', '%t gets no value from it'),
          help: copy,
          note: note('qitem'),
        },
      ]);
    });

    it.each<[string, Record<string, unknown>, string]>([
      [
        'calculatedExpression',
        ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title')),
        'the answer is not calculated from it',
      ],
      [
        'enableWhenExpression',
        ext(`${sdc}enableWhenExpression`, fhirpath('%questionnaire.title.exists()')),
        'it does not change whether the item is enabled; the item starts disabled',
      ],
      [
        'targetConstraint',
        targetConstraint(fhirpath('%questionnaire.title.exists()')),
        'the constraint result is not updated from this evaluation',
      ],
      [
        'answerOptionsToggleExpression',
        toggle(fhirpath('%questionnaire.title.exists()')),
        'its options are not toggled; they start disabled',
      ],
    ])('a %s, with its consequence', async (extension, extensionJson, consequence) => {
      const [finding] = await check(onItem(extensionJson));
      expect(finding).toMatchObject({
        message: general('questionnaire', extension, 'item "Age" (age)', consequence),
        note: note('questionnaire'),
      });
    });

    it('a cqf-expression on text', async () => {
      const resource = questionnaire({
        item: [
          item({
            _text: { extension: [ext(CQF_EXPRESSION, fhirpath('%questionnaire.title'))] },
          }),
        ],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: '/item/0/_text/extension/0/valueExpression/expression',
          message: general(
            'questionnaire',
            'cqf-expression on text',
            'item "Age" (age)',
            'the text is not updated from it',
          ),
          note: note('questionnaire'),
        }),
      ]);
    });

    it('an answerExpression with %questionnaire as its head, without the note', async () => {
      const findings = await check(
        onItem(ext(`${sdc}answerExpression`, fhirpath('%questionnaire.item.answerOption'))),
      );
      expect(findings).toEqual([
        {
          pointer: at(0),
          range: { startOffset: 0, endOffset: 14 },
          message:
            'Smart Forms does not supply %questionnaire to an answerExpression, so its answers on ' +
            'item "Age" (age) are not computed from this expression.',
          help: copy,
          note: undefined,
        },
      ]);
    });

    it('an answerExpression that uses %qitem after another name', async () => {
      const findings = await check(
        onItem(ext(`${sdc}answerExpression`, fhirpath('%patient.name.where(text = %qitem.text)'))),
      );
      expect(findings).toEqual([
        expect.objectContaining({
          range: { startOffset: 27, endOffset: 33 },
          message:
            'Smart Forms does not supply %qitem to an answerExpression, so its answers on ' +
            'item "Age" (age) are not computed from this expression.',
          note: undefined,
        }),
      ]);
    });

    it('an initialExpression that uses %qitem.linkId, with the literal as help', async () => {
      expect(
        await check(onItem(ext(`${sdc}initialExpression`, fhirpath('%qitem . linkId')))),
      ).toEqual([
        {
          pointer: at(0),
          range: { startOffset: 0, endOffset: 6 },
          message: general(
            'qitem',
            'initialExpression',
            'item "Age" (age)',
            'the answer is not prefilled',
          ),
          help: "use the literal value instead, such as 'age'",
          note: note('qitem'),
        },
      ]);
    });

    it('a text/fhirpath initialExpression after a text/cql one, which only the renderer reads', async () => {
      const resource = onItem(
        ext(`${sdc}initialExpression`, expression('text/cql', "'x'")),
        ext(`${sdc}initialExpression`, fhirpath('%qitem.text')),
      );
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: at(1),
          message: general(
            'qitem',
            'initialExpression',
            'item "Age" (age)',
            'the answer is not refilled from it when the form is repopulated',
          ),
        }),
      ]);
    });

    it('an itemPopulationContext on a group with child items', async () => {
      const resource = questionnaire({
        extension: [patientLaunch],
        item: [
          {
            linkId: 'g',
            text: 'Items',
            type: 'group',
            repeats: true,
            extension: [ext(`${sdc}itemPopulationContext`, fhirpath('%questionnaire.item', 'it'))],
            item: [item({ extension: [ext(`${sdc}initialExpression`, fhirpath('%it.text'))] })],
          },
        ],
      });
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          pointer: at(0),
          message: general(
            'questionnaire',
            'itemPopulationContext',
            'item "Items" (g)',
            'the group is not prefilled',
          ),
        }),
      ]);
    });

    it('a reference inside an iif branch', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, fhirpath("iif(false, %qitem.text, 'x')")),
      );
      expect(await check(resource)).toEqual([
        expect.objectContaining({ range: { startOffset: 11, endOffset: 17 } }),
      ]);
    });

    it('each reference in an expression, with its range', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title & %qitem.text')),
      );
      expect((await check(resource)).map(({ range }) => range)).toEqual([
        { startOffset: 0, endOffset: 14 },
        { startOffset: 23, endOffset: 29 },
      ]);
    });

    it('a backticked name', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, fhirpath('%`questionnaire`.title')),
      );
      expect(await check(resource)).toEqual([
        expect.objectContaining({
          range: { startOffset: 0, endOffset: 16 },
          message: expect.stringContaining('does not supply %questionnaire,') as unknown,
        }),
      ]);
    });

    it('a name listed in hostVariables, because built-in names resolve first', async () => {
      const resource = onItem(ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title')));
      expect(await check(resource, "hostVariables: ['questionnaire']")).toHaveLength(1);
    });
  });

  describe('stays silent', () => {
    it('in a variable named questionnaire that uses %questionnaire, even with sdc/reserved-name off', async () => {
      const resource = questionnaire({
        extension: [ext(VARIABLE, fhirpath('%questionnaire.title', 'questionnaire'))],
      });
      expect(await check(resource, "rules: { 'sdc/reserved-name': 'off' }")).toEqual([]);
    });

    it('on %qitem at the root, even with sdc/undefined-variable off', async () => {
      const resource = questionnaire({ extension: [ext(VARIABLE, fhirpath('%qitem.text', 't'))] });
      expect(await check(resource, "rules: { 'sdc/undefined-variable': 'off' }")).toEqual([]);
    });

    it('when an ancestor declares questionnaire, even with sdc/reserved-name off', async () => {
      const resource = questionnaire({
        item: [
          {
            linkId: 'g',
            type: 'group',
            extension: [ext(VARIABLE, fhirpath("'x'", 'questionnaire'))],
            item: [
              item({ extension: [ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire'))] }),
            ],
          },
        ],
      });
      expect(await check(resource, "rules: { 'sdc/reserved-name': 'off' }")).toEqual([]);
    });

    it('when a leaf item on another branch declares questionnaire, even with sdc/reserved-name off', async () => {
      const resource = questionnaire({
        item: [
          {
            linkId: 'other',
            type: 'string',
            extension: [ext(VARIABLE, fhirpath("'x'", 'questionnaire'))],
          },
          item({
            extension: [ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title'))],
          }),
        ],
      });
      expect(await check(resource, "rules: { 'sdc/reserved-name': 'off' }")).toEqual([]);
    });

    it('on an embedding in a query', async () => {
      const resource = questionnaire({
        extension: [
          patientLaunch,
          ext(
            VARIABLE,
            expression('application/x-fhir-query', 'Observation?q={{%questionnaire.id}}', 'obs'),
          ),
        ],
      });
      expect(await check(resource)).toEqual([]);
    });

    it('on CQL text', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, expression('text/cql', '%questionnaire.title')),
      );
      expect(await check(resource)).toEqual([]);
    });

    it('on a candidateExpression, which nothing reads', async () => {
      const resource = onItem(ext(`${sdc}candidateExpression`, fhirpath('%questionnaire.item')));
      expect(await check(resource)).toEqual([]);
    });

    it.each(['initialExpression', 'enableWhenExpression', 'answerExpression'])(
      'on a second text/fhirpath %s, which Smart Forms never reads',
      async (name) => {
        const resource = onItem(
          ext(`${sdc}${name}`, fhirpath('true')),
          ext(`${sdc}${name}`, fhirpath('%qitem.text')),
        );
        expect(await check(resource)).toEqual([]);
      },
    );

    it('on text that does not parse', async () => {
      const resource = onItem(
        ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title.(')),
      );
      expect(await check(resource)).toEqual([]);
    });

    it('after a defineVariable with a computed name', async () => {
      const resource = onItem(
        ext(
          `${sdc}calculatedExpression`,
          fhirpath("defineVariable('a' + 'b', 1).select(%questionnaire.title)"),
        ),
      );
      expect(await check(resource)).toEqual([]);
    });

    it('on a suppressed finding', async () => {
      const resource = onItem(ext(`${sdc}calculatedExpression`, fhirpath('%questionnaire.title')));
      const suppress = `suppress: [{ rule: '${ruleId}', file: 'Questionnaire-Q.json', linkId: 'age', extensionUrl: '${sdc}calculatedExpression', reason: 'The host supplies %questionnaire.' }]`;
      expect(await check(resource, suppress)).toEqual([]);
    });
  });
});

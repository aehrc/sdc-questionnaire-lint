// What the lint cases cannot build: an item without a linkId, which the lint case config requires.
import { describe, expect, it } from 'vitest';
import { lintWithPlugin } from './support/lint.js';
import { expression, ext, questionnaire, sdc, VARIABLE } from './support/sites.js';

type Json = Record<string, unknown>;

const variable = (name: string, text: string): Json =>
  ext(VARIABLE, expression('text/fhirpath', text, name));
const initial = (text: string): Json =>
  ext(`${sdc}initialExpression`, expression('text/fhirpath', text));
const launch = {
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { system: `${sdc}launchContext`, code: 'patient' } },
    { url: 'type', valueCode: 'Patient' },
  ],
};

// A group with the variable y, whose child references it in x, read by the initialExpression of q.
const form = (group: Json, child: Json): string =>
  JSON.stringify(
    questionnaire({
      extension: [launch],
      item: [
        {
          ...group,
          type: 'group',
          extension: [variable('y', "'1'")],
          item: [
            {
              ...child,
              type: 'group',
              extension: [variable('x', '%y')],
              item: [{ linkId: 'q', type: 'string', extension: [initial('%x')] }],
            },
          ],
        },
      ],
    }),
  );

const findings = async (content: string) =>
  (await lintWithPlugin({ 'Questionnaire-Q.json': content })).findings
    .filter(({ ruleId }) => ruleId === 'smart-forms/forward-variable-reference')
    .map(({ message }) => message);

describe('smart-forms/forward-variable-reference', () => {
  it('reports a child that references its group g, as a control', async () => {
    expect(await findings(form({ linkId: 'g' }, { linkId: 'a' }))).toEqual([
      '%x references %y on item g, which Smart Forms evaluates after %x when it prefills the ' +
        'form, so %x has no value while the form is prefilled.',
    ]);
  });

  it('stays silent when the referencing item has no linkId', async () => {
    expect(await findings(form({ linkId: 'g' }, {}))).toEqual([]);
  });

  it("stays silent when the declaration's item has no linkId", async () => {
    expect(await findings(form({}, { linkId: 'a' }))).toEqual([]);
  });

  it("stays silent when an itemPopulationContext's item has no linkId", async () => {
    const content = JSON.stringify(
      questionnaire({
        extension: [launch],
        item: [
          {
            type: 'group',
            extension: [
              ext(
                `${sdc}itemPopulationContext`,
                expression('text/fhirpath', '%patient.name', 'ctx'),
              ),
            ],
            item: [
              {
                linkId: 'a',
                type: 'group',
                extension: [variable('x', '%ctx.given.first()')],
                item: [{ linkId: 'q', type: 'string', extension: [initial('%x')] }],
              },
            ],
          },
        ],
      }),
    );
    expect(await findings(content)).toEqual([]);
  });
});

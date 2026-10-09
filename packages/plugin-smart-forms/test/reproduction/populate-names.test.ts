// Reproduces, against @aehrc/sdc-populate 4.7.1, that population supplies neither %questionnaire nor
// %qitem (src/facts/names.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import { answersOf, populate, responseItems, withPatientLaunch } from './populate.js';

const INITIAL_EXPRESSION = `${sdc}initialExpression`;

const undefinedVariable = (name: string): unknown =>
  expect.stringMatching(new RegExp(`undefined environment variable: ${name}$`));

const question = (linkId: string, text: string) => ({
  linkId,
  type: 'string',
  extension: [ext(INITIAL_EXPRESSION, expression('text/fhirpath', text))],
});

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('populate 4.7.1 does not supply %questionnaire or %qitem', () => {
  it('fails a root variable that uses %questionnaire, and the initialExpression that uses it', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          title: 'Intake',
          extension: [ext(VARIABLE, expression('text/fhirpath', '%questionnaire.title', 'title'))],
          item: [question('q1', '%title')],
        }),
      ),
    );
    expect(issues).toEqual([undefinedVariable('questionnaire'), undefinedVariable('title')]);
    expect(answersOf(response, 'q1')).toEqual([]);
  });

  it('fails an item variable that uses %qitem, and the initialExpression that uses it', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              text: 'Group',
              extension: [ext(VARIABLE, expression('text/fhirpath', '%qitem.text', 't'))],
              item: [question('q1', '%t')],
            },
          ],
        }),
      ),
    );
    expect(issues).toEqual([undefinedVariable('qitem'), undefinedVariable('t')]);
    expect(answersOf(response, 'q1')).toEqual([]);
  });

  it('fails an initialExpression that uses %qitem', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(questionnaire({ item: [question('q1', '%qitem.linkId')] })),
    );
    expect(issues).toEqual([undefinedVariable('qitem')]);
    expect(answersOf(response, 'q1')).toEqual([]);
  });

  it('fails an itemPopulationContext that uses %questionnaire, so the group is absent', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              extension: [
                ext(
                  `${sdc}itemPopulationContext`,
                  expression('text/fhirpath', '%questionnaire.item', 'items'),
                ),
              ],
              item: [question('q1', '%items.linkId')],
            },
          ],
        }),
      ),
    );
    expect(issues).toEqual([
      undefinedVariable('questionnaire'),
      undefinedVariable('questionnaire'),
    ]);
    expect(responseItems(response, 'g')).toEqual([]);
  });

  it('does not fail a reference in an iif branch that is not taken', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(questionnaire({ item: [question('q1', "iif(false, %qitem, 'x')")] })),
    );
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'x' }]);
  });

  it('supplies %resource, the response being populated', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(questionnaire({ item: [question('q1', '%resource.status')] })),
    );
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'in-progress' }]);
  });
});

// What the lint cases cannot build: a templateExtractContext with both valueString and
// valueExpression, or an Expression with no language or with neither expression nor reference,
// which SUSHI does not write; and an explicit compat, which a case config cannot set.
import { describe, expect, it } from 'vitest';
import { lintWithPlugin } from './support/lint.js';
import { questionnaire, sdc } from './support/sites.js';

type Json = Record<string, unknown>;

// A form whose item bp references the Observation template obs, with the context on its
// component.
const form = (context: Json): string =>
  JSON.stringify(
    questionnaire({
      contained: [
        {
          resourceType: 'Observation',
          id: 'obs',
          status: 'final',
          code: { text: 'Blood pressure' },
          component: [
            {
              extension: [{ url: `${sdc}templateExtractContext`, ...context }],
              code: { text: 'Systolic' },
            },
          ],
        },
      ],
      item: [
        {
          linkId: 'bp',
          type: 'group',
          extension: [
            {
              url: `${sdc}templateExtract`,
              extension: [{ url: 'template', valueReference: { reference: '#obs' } }],
            },
          ],
          item: [{ linkId: 'systolic', type: 'decimal' }],
        },
      ],
    }),
  );

const systolic = { language: 'text/fhirpath', expression: "item.where(linkId = 'systolic')" };

async function findings(context: Json, config?: string): Promise<{ message: string }[]> {
  const report = await lintWithPlugin({ 'Questionnaire-Q.json': form(context) }, config);
  return report.findings
    .filter(({ ruleId }) => ruleId === 'smart-forms/unsupported-template-extract-context')
    .map(({ message }) => ({ message }));
}

const reported = [
  {
    message:
      'When Smart Forms extracts this template, it ignores this templateExtractContext because ' +
      'it reads only valueString, so the values below it are extracted without this context.',
  },
];

describe('smart-forms/unsupported-template-extract-context', () => {
  it('stays silent for a valueString with a valueExpression, which Smart Forms reads', async () => {
    expect(
      await findings({ valueString: "item.where(linkId = 'systolic')", valueExpression: systolic }),
    ).toEqual([]);
  });

  it('stays silent for an empty valueString with a valueExpression, which the Validator reports', async () => {
    expect(await findings({ valueString: '', valueExpression: systolic })).toEqual([]);
  });

  it('stays silent for an Expression with no language, which has no expression site', async () => {
    expect(
      await findings({ valueExpression: { expression: "item.where(linkId = 'systolic')" } }),
    ).toEqual([]);
  });

  it('stays silent for an Expression with neither expression nor reference', async () => {
    expect(
      await findings({ valueExpression: { language: 'text/fhirpath', name: 'systolic' } }),
    ).toEqual([]);
  });

  it('reports with an explicit compat that selects template-extract', async () => {
    expect(
      await findings(
        { valueExpression: systolic },
        "compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1', 'template-extract': '1.0.15' } }",
      ),
    ).toEqual(reported);
  });

  it('stays silent with an explicit compat without template-extract', async () => {
    expect(
      await findings(
        { valueExpression: systolic },
        "compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } }",
      ),
    ).toEqual([]);
  });
});

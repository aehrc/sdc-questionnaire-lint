import { describe, expect, it } from 'vitest';
import { runCliWithPlugin } from '../support/lint.js';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';

// One fixture per rule, in text and JSON, so wording changes are reviewed like code
// (linter-design-guidelines.md § 3). Only the findings are kept: the summary names versions.
const fixtures = {
  'smart-forms/unsupported-expression-language': questionnaire({
    item: [
      {
        linkId: 'conditions',
        text: 'Current conditions',
        type: 'string',
        extension: [
          ext(
            VARIABLE,
            expression('text/x-fhir-query', 'Condition?clinical-status=active', 'conds'),
          ),
          ext(`${sdc}calculatedExpression`, expression('text/fhirpath', '%conds.count()')),
        ],
      },
    ],
  }),
  'smart-forms/expression-evaluated-as-fhirpath': questionnaire({
    item: [
      {
        linkId: 'meds',
        text: 'Medications',
        type: 'group',
        repeats: true,
        extension: [
          ext(
            `${sdc}itemPopulationContext`,
            expression('application/x-fhir-query', 'MedicationStatement?status=active', 'med'),
          ),
        ],
        item: [{ linkId: 'name', text: 'Name', type: 'string' }],
      },
    ],
  }),
};

describe.each(Object.entries(fixtures))('%s', (ruleId, resource) => {
  const files = { 'Questionnaire-Q.json': JSON.stringify(resource, null, 2) };

  it('prints its finding in text', async () => {
    const { code, stdout } = await runCliWithPlugin(files, ['lint']);
    expect(code).toBe(1);
    expect(stdout).toContain(ruleId);
    expect(stdout.slice(0, stdout.indexOf('\n\n'))).toMatchSnapshot();
  });

  it('prints its finding in JSON', async () => {
    const { code, stdout } = await runCliWithPlugin(files, ['lint', '--format', 'json']);
    expect(code).toBe(1);
    const { findings } = JSON.parse(stdout) as { findings: { ruleId: string }[] };
    expect(findings.map((finding) => finding.ruleId)).toEqual([ruleId]);
    expect(findings).toMatchSnapshot();
  });
});

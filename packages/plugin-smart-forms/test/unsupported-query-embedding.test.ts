/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// What the lint cases cannot build: a line break in an embedding, and an embedding population finds
// inside a fragment.
import { describe, expect, it } from 'vitest';
import { lintWithPlugin } from './support/lint.js';
import { expression, ext, questionnaire, sdc, VARIABLE } from './support/sites.js';

const launch = {
  url: `${sdc}launchContext`,
  extension: [
    { url: 'name', valueCoding: { system: `${sdc}launchContext`, code: 'patient' } },
    { url: 'type', valueCode: 'Patient' },
  ],
};

async function findingsOf(fields: Record<string, unknown>) {
  const report = await lintWithPlugin({
    'Questionnaire-Q.json': JSON.stringify(questionnaire(fields)),
  });
  return report.findings.filter(
    ({ ruleId }) => ruleId === 'smart-forms/unsupported-query-embedding',
  );
}

const query = (text: string, name = 'q') =>
  ext(VARIABLE, expression('application/x-fhir-query', text, name));

describe('smart-forms/unsupported-query-embedding', () => {
  it('reports an embedding with a line break', async () => {
    const findings = await findingsOf({
      extension: [launch, query('Condition?patient={{%patient\n.id}}')],
    });
    expect(findings.map(({ message }) => message)).toEqual([
      'Smart Forms does not replace this embedding, because it contains a line break, so the ' +
        'query is sent with its braces.',
    ]);
  });

  // A name with both values is not valid FHIR, so FSH cannot write it.
  it.each([
    ['a valueCoding without a code', { system: `${sdc}launchContext` }],
    ['a valueCoding with another code', { code: 'other' }],
  ])('reads a launch name from valueId first, as population does, beside %s', async (_, coding) => {
    const findings = await findingsOf({
      extension: [
        {
          url: `${sdc}launchContext`,
          extension: [
            { url: 'name', valueCoding: coding, valueId: 'patient' },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
        query('Condition?patient={{%patient.id}}'),
      ],
    });
    expect(findings).toEqual([]);
  });

  it('does not check a fragment that population finds an embedding inside', async () => {
    const findings = await findingsOf({
      extension: [launch, query('Condition?patient={{{%patient.id}}')],
    });
    expect(findings).toEqual([]);
  });
});

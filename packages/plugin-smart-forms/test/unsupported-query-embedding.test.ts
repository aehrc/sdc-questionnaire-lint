// What the lint cases cannot build: a contained sourceQueries Bundle, a line break in an embedding,
// and an embedding population finds inside a fragment.
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
  it('reports a sourceQueries request URL its pattern corrupts, as a related location', async () => {
    const findings = await findingsOf({
      contained: [
        {
          resourceType: 'Bundle',
          id: 'prepop',
          type: 'batch',
          entry: [{ request: { method: 'GET', url: 'Observation?subject={{%patient.id}}' } }],
        },
      ],
      extension: [
        launch,
        { url: `${sdc}sourceQueries`, valueReference: { reference: '#prepop' } },
        query('Condition?patient={{%patient.id|x}}'),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe(
      'Smart Forms builds a regular expression from the text inside {{…}} and applies it to ' +
        'every query, and this text also matches other text in this query and a request URL in ' +
        'the sourceQueries Bundle prepop, so it corrupts those URLs.',
    );
    expect(
      (findings[0]?.relatedLocations ?? []).map((related) => [
        related.message,
        related.kind === 'questionnaire' ? related.jsonLocation.pointer : undefined,
      ]),
    ).toEqual([['this query is corrupted', '/contained/0/entry/0/request/url']]);
  });

  it('ignores a Bundle that sourceQueries does not reference', async () => {
    const findings = await findingsOf({
      contained: [
        {
          resourceType: 'Bundle',
          id: 'other',
          type: 'batch',
          entry: [{ request: { method: 'GET', url: 'Observation?subject={{%patientXid}}' } }],
        },
      ],
      extension: [launch, query('Condition?patient={{%patient.id}}')],
    });
    expect(findings).toEqual([]);
  });

  it('reports an embedding with a line break', async () => {
    const findings = await findingsOf({
      extension: [launch, query('Condition?patient={{%patient\n.id}}')],
    });
    expect(findings.map(({ message }) => message)).toEqual([
      'Smart Forms does not replace this embedding, because it contains a line break, so the ' +
        'query is sent with its braces.',
    ]);
  });

  it('does not check a fragment that population finds an embedding inside', async () => {
    const findings = await findingsOf({
      extension: [launch, query('Condition?patient={{{%patient.id}}')],
    });
    expect(findings).toEqual([]);
  });
});

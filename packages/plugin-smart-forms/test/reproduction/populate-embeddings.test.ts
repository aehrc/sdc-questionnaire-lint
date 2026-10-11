// Reproduces, against @aehrc/sdc-populate 4.7.1, how population replaces the {{%…}} embeddings in
// its x-fhir-query variables (src/facts/embeddings.ts). Each test asserts the URLs passed to the
// fetch callback, or the failed population.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import { populate, withPatientLaunch } from './populate.js';

// A Questionnaire whose root declares an application/x-fhir-query variable for each query, named
// v0, v1 and so on.
const withQueries = (...queries: string[]) =>
  questionnaire({
    extension: queries.map((text, index) =>
      ext(VARIABLE, expression('application/x-fhir-query', text, `v${String(index)}`)),
    ),
    item: [{ linkId: 'a', type: 'string' }],
  });

// The URLs population sends for the queries, with a patient launchContext.
async function urlsOf(...queries: string[]): Promise<readonly string[]> {
  return (await populate(withPatientLaunch(withQueries(...queries)))).urls;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('populate 4.7.1 replaces {{%…}} embeddings', () => {
  it('replaces an embedding in a root and an item query variable', async () => {
    const { urls } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [
            ext(
              VARIABLE,
              expression('application/x-fhir-query', 'Condition?p={{%patient.id}}', 'c'),
            ),
          ],
          item: [
            {
              linkId: 'g',
              type: 'group',
              extension: [
                ext(
                  VARIABLE,
                  expression('application/x-fhir-query', 'Encounter?p={{%patient.id}}', 'e'),
                ),
              ],
              item: [{ linkId: 'a', type: 'string' }],
            },
          ],
        }),
      ),
    );
    expect(urls).toEqual(['Condition?p=pat-1', 'Encounter?p=pat-1']);
  });

  it('sends an embedding that does not start with {{% with its braces', async () => {
    expect(
      await urlsOf(
        'Condition?p={{ %patient.id }}',
        'Condition?p={{%}}',
        'Condition?p={{%patient\n.id}}',
      ),
    ).toEqual([
      'Condition?p={{ %patient.id }}',
      'Condition?p={{%}}',
      'Condition?p={{%patient\n.id}}',
    ]);
  });

  it('sends every embedding with its braces when no launch context is declared', async () => {
    const { success, urls } = await populate(
      withQueries('Condition?p={{%patient.id}}', "Condition?p={{%patient.id = ')'}}"),
    );
    expect(success).toBe(true);
    expect(urls).toEqual(['Condition?p={{%patient.id}}', "Condition?p={{%patient.id = ')'}}"]);
  });

  it('fails population of the whole form on an invalid regular expression', async () => {
    const { success, urls } = await populate(
      withPatientLaunch(withQueries("Condition?p={{%patient.id = ')'}}")),
    );
    expect(success).toBe(false);
    expect(urls).toEqual([]);
  });

  it('sends an embedding whose pattern does not match itself with its braces', async () => {
    expect(
      await urlsOf('Condition?p={{%patient.id.first()}}', "Condition?p={{%patient.id + 'x'}}"),
    ).toEqual(['Condition?p={{%patient.id.first()}}', "Condition?p={{%patient.id + 'x'}}"]);
  });

  it('corrupts the queries an embedding pattern matches other text in', async () => {
    expect(await urlsOf('Condition?p={{%patient.id|id}}', 'Encounter?p={{%patient.id}}')).toEqual([
      'Condition?p=pat-1|pat-1',
      'Encounter?p=pat-1}}',
    ]);
    const { urls } = await populate(
      withPatientLaunch(
        questionnaire({
          contained: [
            {
              resourceType: 'Bundle',
              id: 'prepop',
              type: 'batch',
              entry: [{ request: { method: 'GET', url: 'Observation?p={{%patient.id}}' } }],
            },
          ],
          extension: [
            { url: `${sdc}sourceQueries`, valueReference: { reference: '#prepop' } },
            ext(
              VARIABLE,
              expression('application/x-fhir-query', 'Condition?p={{%patient.id|x}}', 'c'),
            ),
          ],
          item: [{ linkId: 'a', type: 'string' }],
        }),
      ),
    );
    expect(urls).toEqual(['Condition?p=pat-1|pat-1', 'Observation?p=pat-1}}']);
  });

  it('replaces an embedding with operators and literals', async () => {
    expect(
      await urlsOf(
        "Condition?p={{%patient.id = 'pat-1'}}",
        "Condition?p={{%patient.id & 'x'}}",
        'Condition?p={{%patient.id.length div 1}}',
      ),
    ).toEqual(['Condition?p=true', 'Condition?p=pat-1x', 'Condition?p=5']);
  });

  it('sends "undefined" for a head that is not a launch context', async () => {
    expect(await urlsOf('Condition?p={{%Condition.id}}', 'Condition?p={{%`patient`.id}}')).toEqual([
      'Condition?p=undefined',
      'Condition?p=undefined',
    ]);
  });

  it('sends an empty value for an embedding with no path after the head', async () => {
    expect(
      await urlsOf('Condition?p={{%patient}}', 'Condition?p={{%other}}', 'Condition?p={{%.id}}'),
    ).toEqual(['Condition?p=', 'Condition?p=', 'Condition?p=']);
  });

  it('evaluates the path with only %context, %ucum, %terminologyUrl and %fhirServerUrl', async () => {
    expect(
      await urlsOf(
        'Condition?p={{%patient.id & %context.id}}',
        'Condition?p={{%patient.id & %ucum}}',
        'Condition?p={{%patient.id & %terminologyUrl}}',
        'Condition?p={{%patient.id & %fhirServerUrl}}',
      ),
    ).toEqual([
      'Condition?p=pat-1pat-1',
      'Condition?p=pat-1http://unitsofmeasure.org',
      'Condition?p=pat-1https://tx.ontoserver.csiro.au/fhir',
      'Condition?p=pat-1https://fhir.example.org',
    ]);
  });

  it('empties an embedding that references another name', async () => {
    expect(
      await urlsOf(
        'Condition?p={{%patient.id}}',
        'Condition?p={{%patient.id & %v0}}',
        'Condition?p={{%patient.id & %patient.id}}',
        'Condition?p={{%patient.id & %resource.id}}',
        'Condition?p={{%patient.id & %sct}}',
      ),
    ).toEqual([
      'Condition?p=pat-1',
      'Condition?p=',
      'Condition?p=',
      'Condition?p=',
      'Condition?p=',
    ]);
  });
});

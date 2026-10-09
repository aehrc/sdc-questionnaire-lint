// Reproduces, against @aehrc/sdc-populate 4.7.1, how population handles the language at each
// location it reads (src/facts/languages.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expression, ext, questionnaire, sdc, VARIABLE } from '../support/sites.js';
import { answersOf, populate, responseItems, withPatientLaunch } from './populate.js';

const INITIAL_EXPRESSION = `${sdc}initialExpression`;
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;

const undefinedVariable = (name: string): unknown =>
  expect.stringMatching(new RegExp(`undefined environment variable: ${name}$`));

// fhirpath.js fails to parse query text at its ?.
const queryParseError: unknown = expect.stringContaining("token recognition error at: '?'");

const question = (linkId: string, language: string, text: string) => ({
  linkId,
  type: 'string',
  extension: [ext(INITIAL_EXPRESSION, expression(language, text))],
});

const observations = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [{ resource: { resourceType: 'Observation', id: 'o1', valueString: 'from the query' } }],
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('populate 4.7.1 variables', () => {
  it('evaluates a root text/fhirpath variable', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [ext(VARIABLE, expression('text/fhirpath', "'root value'", 'v'))],
          item: [question('q1', 'text/fhirpath', '%v')],
        }),
      ),
    );
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'root value' }]);
  });

  it('fetches a root application/x-fhir-query variable', async () => {
    const { issues, response, urls } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [
            ext(
              VARIABLE,
              expression('application/x-fhir-query', 'Observation?patient={{%patient.id}}', 'obs'),
            ),
          ],
          item: [question('q1', 'text/fhirpath', '%obs.entry.resource.valueString.first()')],
        }),
      ),
      { fetch: (url) => (url.startsWith('Observation?') ? observations : undefined) },
    );
    expect(urls).toEqual(['Observation?patient=pat-1']);
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'from the query' }]);
  });

  it('fetches an item application/x-fhir-query variable', async () => {
    const { issues, response, urls } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              extension: [
                ext(
                  VARIABLE,
                  expression(
                    'application/x-fhir-query',
                    'Observation?patient={{%patient.id}}',
                    'obs',
                  ),
                ),
              ],
              item: [question('q1', 'text/fhirpath', '%obs.entry.resource.valueString.first()')],
            },
          ],
        }),
      ),
      { fetch: (url) => (url.startsWith('Observation?') ? observations : undefined) },
    );
    expect(urls).toEqual(['Observation?patient=pat-1']);
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'from the query' }]);
  });

  it.each(['text/x-fhir-query', 'text/cql'])(
    'neither fetches nor evaluates a %s variable',
    async (language) => {
      const { issues, response, urls } = await populate(
        withPatientLaunch(
          questionnaire({
            extension: [ext(VARIABLE, expression(language, 'Observation?code=1', 'v'))],
            item: [question('q1', 'text/fhirpath', '%v')],
          }),
        ),
      );
      expect(urls).toEqual([]);
      expect(issues).toEqual([undefinedVariable('v')]);
      expect(answersOf(response, 'q1')).toEqual([]);
    },
  );
});

describe('populate 4.7.1 initialExpression', () => {
  it('evaluates a text/cql initialExpression as FHIRPath', async () => {
    const { issues, response } = await populate(
      withPatientLaunch(questionnaire({ item: [question('q1', 'text/cql', "'x'")] })),
    );
    expect(issues).toEqual([]);
    expect(answersOf(response, 'q1')).toEqual([{ valueString: 'x' }]);
  });

  it('evaluates an application/x-fhir-query initialExpression as FHIRPath, which fails', async () => {
    const { issues, response, urls } = await populate(
      withPatientLaunch(
        questionnaire({ item: [question('q1', 'application/x-fhir-query', 'Observation?code=1')] }),
      ),
    );
    expect(urls).toEqual([]);
    expect(issues).toEqual([queryParseError]);
    expect(answersOf(response, 'q1')).toEqual([]);
  });
});

describe('populate 4.7.1 itemPopulationContext', () => {
  it('evaluates an application/x-fhir-query itemPopulationContext as FHIRPath, which fails', async () => {
    const { issues, response, urls } = await populate(
      withPatientLaunch(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              repeats: true,
              extension: [
                ext(
                  ITEM_POPULATION_CONTEXT,
                  expression('application/x-fhir-query', 'Observation?code=1', 'obs'),
                ),
              ],
              item: [question('q1', 'text/fhirpath', '%obs.valueString')],
            },
          ],
        }),
      ),
    );
    expect(urls).toEqual([]);
    // Populate evaluates it twice.
    expect(issues).toEqual([queryParseError, queryParseError]);
    expect(responseItems(response, 'g')).toEqual([]);
  });
});

// Reproduces, against @aehrc/sdc-populate 4.7.1, which sourceQueries results population binds,
// and under which names (src/facts/source-queries.ts). Each test asserts the names in
// populatedContext, which the app passes on as additionalContext, or the URLs passed to the fetch
// callback. Without a launch context, population also fetches a #id reference, and the harness
// answers every URL, so a test of an unset #id declares the patient launchContext.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { questionnaire, sdc } from '../support/sites.js';
import { populate, withPatientLaunch } from './populate.js';

type Json = Record<string, unknown>;

const sourceQuery = (valueReference: unknown): Json => ({
  url: `${sdc}sourceQueries`,
  valueReference,
});
const bundle = (id: string, fields: Json = {}): Json => ({
  resourceType: 'Bundle',
  id,
  type: 'batch',
  ...fields,
});
const observations = (url = 'Observation?code=1'): Json => ({
  entry: [{ request: { method: 'GET', url } }],
});
const observation = { resourceType: 'Observation', id: 'obs-1', status: 'final' };

// A fresh Questionnaire with a root item, so population builds a response.
const form = (fields: Json): Json =>
  questionnaire({ item: [{ linkId: 'a', type: 'string' }], ...fields });

// The names population bound, besides %resource and %rootResource.
async function boundNames(
  fields: Json,
  options: Parameters<typeof populate>[1] = {},
): Promise<string[]> {
  const { context } = await populate(withPatientLaunch(form(fields)), options);
  return Object.keys(context ?? {})
    .filter((name) => name !== 'resource' && name !== 'rootResource')
    .sort();
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('populate 4.7.1 sourceQueries', () => {
  it('reads only root sourceQueries extensions with the exact URL', async () => {
    const { urls, context } = await populate(
      withPatientLaunch(
        questionnaire({
          extension: [
            {
              url: `${sdc}sourceQueries|3.0.0`,
              valueReference: { reference: 'Observation?v=1' },
            },
          ],
          item: [
            {
              linkId: 'g',
              type: 'group',
              extension: [sourceQuery({ reference: 'Observation?item=1' })],
              item: [{ linkId: 'a', type: 'string' }],
            },
          ],
        }),
      ),
    );
    expect(urls).toEqual([]);
    expect(Object.keys(context ?? {})).toEqual(['resource', 'rootResource', 'patient']);
  });

  it('names a reference sourceQuery and the index of every extension with a valueReference', async () => {
    expect(
      await boundNames({
        contained: [bundle('a', { entry: [] })],
        extension: [
          { url: `${sdc}sourceQueries`, valueString: 'no reference' },
          sourceQuery({ display: 'display only' }),
          sourceQuery({ reference: '' }),
          sourceQuery({}),
          sourceQuery({ reference: '#' }),
          sourceQuery({ reference: '#a' }),
          sourceQuery({ reference: 'Observation?c=1' }),
        ],
      }),
    ).toEqual(['a', 'patient', 'sourceQuery5']);
  });

  it('binds a #id to the contained Bundle with that id when it has entries', async () => {
    const { context } = await populate(
      withPatientLaunch(
        form({
          contained: [bundle('prepop', observations())],
          extension: [sourceQuery({ reference: '#prepop' })],
        }),
      ),
    );
    expect(context?.prepop).toMatchObject({ resourceType: 'Bundle', id: 'prepop' });
  });

  it('binds a #id to a contained Bundle with an empty entry, of any type', async () => {
    expect(
      await boundNames({
        contained: [bundle('prepop', { type: 'collection', entry: [] })],
        extension: [sourceQuery({ reference: '#prepop' })],
      }),
    ).toEqual(['patient', 'prepop']);
  });

  it('leaves a #id unset for a contained Bundle without entry', async () => {
    expect(
      await boundNames({
        contained: [bundle('prepop'), bundle('other', { entry: null })],
        extension: [sourceQuery({ reference: '#prepop' }), sourceQuery({ reference: '#other' })],
      }),
    ).toEqual(['patient']);
  });

  it('leaves a #id unset without a contained Bundle with that id', async () => {
    expect(
      await boundNames({
        contained: [{ resourceType: 'Patient', id: 'prepop' }],
        extension: [sourceQuery({ reference: '#prepop' }), sourceQuery({ reference: '#missing' })],
      }),
    ).toEqual(['patient']);
  });

  it('uses only the first contained Bundle with the id', async () => {
    const shadowed = await boundNames({
      contained: [bundle('prepop'), bundle('prepop', observations())],
      extension: [sourceQuery({ reference: '#prepop' })],
    });
    expect(shadowed).toEqual(['patient']);
    const { context } = await populate(
      withPatientLaunch(
        form({
          contained: [
            bundle('prepop', observations('Observation?first=1')),
            bundle('prepop', observations('Observation?second=1')),
          ],
          extension: [sourceQuery({ reference: '#prepop' })],
        }),
      ),
    );
    expect(context?.prepop).toMatchObject({
      entry: [{ request: { url: 'Observation?first=1' } }],
    });
  });

  it('binds a fetched reference to the resource it returns', async () => {
    const { context, urls } = await populate(
      withPatientLaunch(form({ extension: [sourceQuery({ reference: 'Observation/obs-1' })] })),
      { fetch: (url) => (url === 'Observation/obs-1' ? observation : undefined) },
    );
    expect(urls).toEqual(['Observation/obs-1']);
    expect(context?.sourceQuery0).toEqual(observation);
  });

  it('leaves a fetched reference unset after a failure or an OperationOutcome', async () => {
    const names = await boundNames(
      {
        extension: [
          sourceQuery({ reference: 'Observation/fails' }),
          sourceQuery({ reference: 'Observation/outcome' }),
        ],
      },
      {
        fetch: (url) => {
          if (url === 'Observation/fails') throw new Error('network');
          return { resourceType: 'OperationOutcome', issue: [] };
        },
      },
    );
    expect(names).toEqual(['patient']);
  });

  it('binds a #%x reference as %x and a #a b reference as a b', async () => {
    expect(
      await boundNames({
        contained: [bundle('%x', { entry: [] }), bundle('a b', { entry: [] })],
        extension: [sourceQuery({ reference: '#%x' }), sourceQuery({ reference: '#a b' })],
      }),
    ).toEqual(['%x', 'a b', 'patient']);
  });

  it('reads no sourceQueries when subjectType lacks Patient', async () => {
    const extension = [sourceQuery({ reference: 'Observation?c=1' })];
    const group = await populate(withPatientLaunch(form({ subjectType: ['Group'], extension })));
    expect(group.urls).toEqual([]);
    expect(group.context).toBeUndefined();
    expect(await boundNames({ subjectType: ['Group', 'Patient'], extension })).toEqual([
      'patient',
      'sourceQuery0',
    ]);
  });

  it('leaves contained Bundle entries unresolved with the app callback', async () => {
    const fields = {
      contained: [bundle('prepop', observations())],
      extension: [sourceQuery({ reference: '#prepop' })],
    };
    const fetch = () => observation;
    const app = await populate(withPatientLaunch(form(fields)), { fetch });
    expect(app.context?.prepop).toMatchObject({ entry: [{ request: { method: 'GET' } }] });
    expect((app.context?.prepop as { entry: Json[] }).entry[0]).not.toHaveProperty('resource');
    expect(app.issues).toContain('The resource for prepop entry 0 could not be resolved.');
    const axios = await populate(withPatientLaunch(form(fields)), { fetch, response: 'data' });
    expect(axios.context?.prepop).toMatchObject({ entry: [{ resource: observation }] });
  });

  it('passes a #id to the fetch callback without a launch resource', async () => {
    const { urls } = await populate(
      form({
        contained: [bundle('prepop', observations())],
        extension: [sourceQuery({ reference: '#prepop' })],
      }),
    );
    expect(urls).toContain('#prepop');
  });
});

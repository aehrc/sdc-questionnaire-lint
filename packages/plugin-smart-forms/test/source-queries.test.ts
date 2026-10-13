import { describe, expect, it } from 'vitest';
import { readSourceQueries } from '../src/source-queries.js';
import { documentOf, questionnaire, sdc, VARIABLE } from './support/sites.js';

const sourceQuery = (valueReference: unknown) => ({ url: `${sdc}sourceQueries`, valueReference });
const bundle = (id: string, fields: Record<string, unknown> = { entry: [] }) => ({
  resourceType: 'Bundle',
  id,
  type: 'batch',
  ...fields,
});

const read = (fields: Record<string, unknown>) =>
  readSourceQueries(documentOf(questionnaire(fields)));

describe('readSourceQueries', () => {
  it('counts every root sourceQueries extension with a valueReference, naming them as population does', () => {
    const records = read({
      extension: [
        { url: VARIABLE, valueString: 'x' },
        { url: `${sdc}sourceQueries`, valueString: 'no reference' },
        sourceQuery({ display: 'display only' }),
        sourceQuery({ reference: '' }),
        sourceQuery({}),
        sourceQuery({ reference: '#' }),
        sourceQuery({ reference: '#a' }),
        sourceQuery({ reference: 'Observation?c=1' }),
        sourceQuery({ reference: '#%x' }),
        sourceQuery({ reference: '#a b' }),
      ],
    });
    expect(
      records.map(({ extensionIndex, index, reference, name }) => [
        extensionIndex,
        index,
        reference,
        name,
      ]),
    ).toEqual([
      [2, 0, undefined, undefined],
      [3, 1, '', undefined],
      [4, 2, undefined, undefined],
      [5, 3, '#', undefined],
      [6, 4, '#a', 'a'],
      [7, 5, 'Observation?c=1', 'sourceQuery5'],
      [8, 6, '#%x', '%x'],
      [9, 7, '#a b', 'a b'],
    ]);
  });

  it('ignores an extension with another URL, a version suffix or on an item', () => {
    expect(
      read({
        extension: [
          { url: `${sdc}sourceQueries|3.0.0`, valueReference: { reference: '#a' } },
          { url: `${sdc}sourceQuery`, valueReference: { reference: '#a' } },
        ],
        item: [{ linkId: 'g', type: 'group', extension: [sourceQuery({ reference: '#a' })] }],
      }),
    ).toEqual([]);
  });

  it('gives a #id the first contained Bundle with that id, with its index', () => {
    const first = bundle('a', {});
    const [record] = read({
      contained: [
        { resourceType: 'Patient', id: 'a' },
        first,
        bundle('a', { entry: [{ request: { method: 'GET', url: 'Patient' } }] }),
      ],
      extension: [sourceQuery({ reference: '#a' })],
    });
    expect(record?.bundle).toEqual({ resource: first, containedIndex: 1 });
  });

  it('gives no Bundle to a #id without one, nor to another reference', () => {
    const records = read({
      contained: [{ resourceType: 'Patient', id: 'a' }, bundle('Observation?c=1')],
      extension: [
        sourceQuery({ reference: '#a' }),
        sourceQuery({ reference: '#missing' }),
        sourceQuery({ reference: 'Observation?c=1' }),
      ],
    });
    expect(records.map((record) => record.bundle)).toEqual([undefined, undefined, undefined]);
  });

  it('reads nothing from a root without extensions or with something else there', () => {
    expect(read({})).toEqual([]);
    expect(read({ extension: 'x', contained: 'y' })).toEqual([]);
    expect(read({ extension: [null, 'x', sourceQuery(null)] })).toEqual([]);
  });
});

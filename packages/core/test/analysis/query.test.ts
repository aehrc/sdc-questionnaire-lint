import { describe, expect, it } from 'vitest';
import { queryShapeProblem, scanQuery } from '../../src/analysis/query.js';

describe('scanQuery', () => {
  it('finds no fragments in a plain query', () => {
    expect(scanQuery('Patient?_id=1')).toEqual({ fragments: [] });
  });

  it('gives the offsets of each fragment, excluding the braces', () => {
    expect(scanQuery('Observation?subject={{%patient.id}}&date=gt{{%today}}')).toEqual({
      fragments: [
        { startOffset: 22, endOffset: 33 },
        { startOffset: 45, endOffset: 51 },
      ],
    });
  });

  it('gives the offset of an unclosed {{', () => {
    expect(scanQuery('Observation?subject={{%patient.id')).toEqual({
      fragments: [],
      unclosedAt: 20,
    });
  });

  it('keeps the closed fragments before an unclosed {{', () => {
    expect(scanQuery('{{%a}}x{{%b')).toEqual({
      fragments: [{ startOffset: 2, endOffset: 4 }],
      unclosedAt: 7,
    });
  });

  it('gives an empty fragment for {{}}', () => {
    expect(scanQuery('Patient/{{}}')).toEqual({ fragments: [{ startOffset: 10, endOffset: 10 }] });
  });

  it('does not end a fragment at a single }', () => {
    const query = "Patient?name={{%a + '}'}}";
    const [fragment] = scanQuery(query).fragments;
    expect(query.slice(fragment?.startOffset, fragment?.endOffset)).toBe("%a + '}'");
  });

  it('ends a fragment at the first }}, even inside a string', () => {
    expect(scanQuery("{{'}}'}}")).toEqual({ fragments: [{ startOffset: 2, endOffset: 3 }] });
  });
});

describe('queryShapeProblem', () => {
  it.each([
    'Patient',
    'Observation?code=x',
    'Patient/{{%id}}',
    'Observation{{%q}}',
    '{{%ref}}',
    '?_type=Patient',
    '$everything',
    '_history',
    'https://example.org/fhir/Patient?x=1',
    'http://example.org/fhir/Patient',
  ])('accepts %j', (query) => {
    expect(queryShapeProblem(query)).toBeUndefined();
  });

  it.each(['%patient.id', 'Patient.name.given', 'today()', 'observation?code=x', ''])(
    'rejects %j as not a search',
    (query) => {
      expect(queryShapeProblem(query)).toBe('not-a-search');
    },
  );

  it.each(['Observation?subject={{%patient.id', '%patient.id {{'])(
    'reports an unclosed {{ in %j, before the shape',
    (query) => {
      expect(queryShapeProblem(query)).toBe('unclosed');
    },
  );
});

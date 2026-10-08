import { describe, expect, it } from 'vitest';
import {
  findQueryShapeProblem,
  isQueryLanguage,
  scanQueryFragments,
} from '../../src/analysis/x-fhir-query.js';

describe('isQueryLanguage', () => {
  it('recognises the R4 and the R5 query code', () => {
    expect(isQueryLanguage('application/x-fhir-query')).toBe(true);
    expect(isQueryLanguage('text/x-fhir-query')).toBe(true);
  });

  it('recognises no other language', () => {
    for (const language of ['text/fhirpath', 'text/cql', 'x-fhir-query', undefined]) {
      expect(isQueryLanguage(language)).toBe(false);
    }
  });
});

describe('scanQueryFragments', () => {
  it('finds no fragments in a plain query', () => {
    expect(scanQueryFragments('Patient?_id=1')).toEqual({ fragments: [] });
  });

  it('gives the offsets of each fragment, excluding the braces', () => {
    expect(scanQueryFragments('Observation?subject={{%patient.id}}&date=gt{{%today}}')).toEqual({
      fragments: [
        { startOffset: 22, endOffset: 33 },
        { startOffset: 45, endOffset: 51 },
      ],
    });
  });

  it('gives the offset of an unclosed {{', () => {
    expect(scanQueryFragments('Observation?subject={{%patient.id')).toEqual({
      fragments: [],
      unclosedAt: 20,
    });
  });

  it('keeps the closed fragments before an unclosed {{', () => {
    expect(scanQueryFragments('{{%a}}x{{%b')).toEqual({
      fragments: [{ startOffset: 2, endOffset: 4 }],
      unclosedAt: 7,
    });
  });

  it('gives an empty fragment for {{}}', () => {
    expect(scanQueryFragments('Patient/{{}}')).toEqual({
      fragments: [{ startOffset: 10, endOffset: 10 }],
    });
  });

  it('does not end a fragment at a single }', () => {
    const query = "Patient?name={{%a + '}'}}";
    const [fragment] = scanQueryFragments(query).fragments;
    expect(query.slice(fragment?.startOffset, fragment?.endOffset)).toBe("%a + '}'");
  });

  it('ends a fragment at the first }}, even inside a string', () => {
    expect(scanQueryFragments("{{'}}'}}")).toEqual({
      fragments: [{ startOffset: 2, endOffset: 3 }],
    });
  });
});

describe('findQueryShapeProblem', () => {
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
    expect(findQueryShapeProblem(query)).toBeUndefined();
  });

  it.each(['%patient.id', 'Patient.name.given', 'today()', 'observation?code=x', ''])(
    'rejects %j as not a search',
    (query) => {
      expect(findQueryShapeProblem(query)).toBe('not-a-search');
    },
  );

  it.each(['Observation?subject={{%patient.id', '%patient.id {{'])(
    'reports an unclosed {{ in %j, before the shape',
    (query) => {
      expect(findQueryShapeProblem(query)).toBe('unclosed');
    },
  );
});

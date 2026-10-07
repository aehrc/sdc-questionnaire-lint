import { describe, expect, it } from 'vitest';
import { findSites } from '../../src/analysis/walker.js';
import type { QuestionnaireDocument } from '../../src/plugins/types.js';
import {
  configFingerprint,
  questionnaireFingerprint,
  siteKeys,
} from '../../src/run/fingerprint.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const resource = { resourceType: 'Questionnaire', id: 'Q', pointer: '' };

function variable(name: string, expression: string) {
  return { url: VARIABLE, valueExpression: { name, language: 'text/fhirpath', expression } };
}

function toggle(expression: string) {
  return {
    url: `${sdc}answerOptionsToggleExpression`,
    extension: [
      { url: 'option', valueCoding: { code: 'a' } },
      { url: 'expression', valueExpression: { language: 'text/fhirpath', expression } },
    ],
  };
}

function document(items: unknown[]): QuestionnaireDocument {
  return {
    file: 'Questionnaire-Q.json',
    resource: { resourceType: 'Questionnaire', id: 'Q', item: items },
    resourcePointer: '',
    localResources: [],
  };
}

// Each site's key, by its expression text.
function keysByText(items: unknown[]): Record<string, string> {
  const doc = document(items);
  const sites = findSites(doc);
  const keys = siteKeys(doc, sites);
  return Object.fromEntries(sites.map((site) => [site.text ?? '', keys.get(site) ?? '']));
}

describe('siteKeys', () => {
  it('keeps repeated locations and repeated variable names distinct', () => {
    const keys = keysByText([
      {
        linkId: 'q',
        extension: [toggle('t1'), toggle('t2'), variable('x', 'v1'), variable('x', 'v2')],
      },
    ]);
    expect(new Set(Object.values(keys)).size).toBe(4);
  });

  it('keeps keys when an item is inserted before the site', () => {
    const site = { linkId: 'q', extension: [variable('x', 'v')] };
    expect(keysByText([{ linkId: 'new' }, site])).toEqual(keysByText([site]));
  });

  it('keeps keys when an extension with another URL is inserted before the site', () => {
    const before = keysByText([{ linkId: 'q', extension: [toggle('t'), variable('x', 'v')] }]);
    const after = keysByText([
      {
        linkId: 'q',
        extension: [
          {
            url: `${sdc}calculatedExpression`,
            valueExpression: { language: 'text/fhirpath', expression: 'c' },
          },
          toggle('t'),
          { url: 'http://example.org/other', valueString: 'x' },
          variable('x', 'v'),
        ],
      },
    ]);
    expect(after).toMatchObject(before);
  });
});

describe('siteKeys for fragments', () => {
  const xFhirQuery = (expression: string) => ({
    language: 'application/x-fhir-query',
    expression,
  });
  const populationContext = (expression: string) => ({
    url: `${sdc}itemPopulationContext`,
    valueExpression: { name: 'obs', ...xFhirQuery(expression) },
  });
  const targetConstraint = (expression: string) => ({
    url: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
    extension: [{ url: 'expression', valueExpression: xFhirQuery(expression) }],
  });

  // Each site's key, in document order.
  function keysOf(extension: unknown[]): string[] {
    const doc = document([{ linkId: 'q', extension }]);
    const sites = findSites(doc);
    const keys = siteKeys(doc, sites);
    return sites.map((site) => keys.get(site) ?? '');
  }

  it("gives each fragment its query's key plus its 1-based index", () => {
    const [query, ...fragments] = keysOf([
      populationContext('Observation?subject={{%a}}&date={{%b}}'),
    ]);
    expect(fragments).toEqual([`${query ?? ''}{{1}}`, `${query ?? ''}{{2}}`]);
  });

  it('keeps the key of a query whether or not it has fragments', () => {
    expect(keysOf([populationContext('Observation?subject={{%a}}')])[0]).toBe(
      keysOf([populationContext('Observation?subject=1')])[0],
    );
  });

  it("keeps a fragment's key when another fragment's text changes", () => {
    expect(keysOf([populationContext('Observation?subject={{%a}}&date={{%b}}')])[2]).toBe(
      keysOf([populationContext('Observation?subject={{%changed}}&date={{%b}}')])[2],
    );
  });

  it('does not count fragments as repeats of their query', () => {
    const queries = (texts: string[]) =>
      keysOf(texts.map(targetConstraint)).filter((key) => !key.endsWith('}}'));
    expect(queries(['Patient?a={{%a}}', 'Patient?b={{%b}}', 'Patient'])).toEqual(
      queries(['Patient?a=1', 'Patient?b=1', 'Patient']),
    );
  });
});

describe('questionnaireFingerprint', () => {
  const parts = { ruleId: 'sdc/parse-error', file: 'Questionnaire-Q.json', resource, key: 'k' };

  it('is stable for the same parts', () => {
    expect(questionnaireFingerprint({ ...parts })).toBe(questionnaireFingerprint(parts));
  });

  it('changes with the rule or the file', () => {
    const fingerprint = questionnaireFingerprint(parts);
    expect(questionnaireFingerprint({ ...parts, ruleId: 'sdc/uncatalogued-expression' })).not.toBe(
      fingerprint,
    );
    expect(questionnaireFingerprint({ ...parts, file: 'Questionnaire-R.json' })).not.toBe(
      fingerprint,
    );
  });
});

describe('configFingerprint', () => {
  const ruleId = 'lint/stale-suppression';
  const entry = {
    rule: 'sdc/parse-error',
    file: 'Questionnaire-Q.json',
    linkId: 'q',
    reason: 'the host supplies %a',
  };

  it('does not change with the reason or the position in suppress', () => {
    const fingerprint = configFingerprint(ruleId, entry);
    expect(configFingerprint(ruleId, { ...entry, reason: 'another reason' })).toBe(fingerprint);
    // The index is not an input; an entry moved in the array has the same fields.
    expect(
      configFingerprint(ruleId, { reason: 'r', linkId: 'q', file: entry.file, rule: entry.rule }),
    ).toBe(fingerprint);
  });

  it.each([
    ['file', { file: 'Questionnaire-R.json' }],
    ['rule', { rule: 'sdc/unknown-function' }],
    ['linkId', { linkId: 'r' }],
    ['extensionUrl', { extensionUrl: 'http://example.org/x' }],
    ['name', { name: 'v' }],
    ['resource', { resource: 'Questionnaire/Q' }],
    ['pointer', { pointer: '/item/0' }],
  ])('changes with %s', (_, change) => {
    expect(configFingerprint(ruleId, { ...entry, ...change })).not.toBe(
      configFingerprint(ruleId, entry),
    );
  });

  it('changes with the reporting rule', () => {
    expect(configFingerprint('lint/other', entry)).not.toBe(configFingerprint(ruleId, entry));
  });
});

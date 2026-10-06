import { describe, expect, it } from 'vitest';
import { findSites } from '../../src/analysis/walker.js';
import type { QuestionnaireDocument } from '../../src/plugins/types.js';
import { questionnaireFingerprint, siteKeys } from '../../src/run/fingerprint.js';

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

/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import smartForms from '../src/index.js';
import { readSourceQueries } from '../src/source-queries.js';
import { lintWithPlugin } from './support/lint.js';
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
    expect(record?.bundle).toEqual({ resource: first, containedIndex: 1, bound: false });
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

describe('the hostVariables hook', () => {
  const compat = Object.freeze({ renderer: '1.4.0', populate: '4.7.1' });
  const supplied = (fields: Record<string, unknown>) =>
    smartForms.hostVariables?.({ document: documentOf(questionnaire(fields)), compat });

  it('supplies a #id with a contained Bundle with entries, empty ones and any type included', () => {
    expect(
      supplied({
        contained: [bundle('a', { entry: [] }), bundle('b', { type: 'collection', entry: [{}] })],
        extension: [sourceQuery({ reference: '#a' }), sourceQuery({ reference: '#b' })],
      }),
    ).toEqual(['a', 'b']);
  });

  it('does not supply a #id without such a Bundle', () => {
    expect(
      supplied({
        contained: [
          { resourceType: 'Patient', id: 'patient' },
          bundle('none', {}),
          bundle('nulled', { entry: null }),
          bundle('shadowed', {}),
          bundle('shadowed', { entry: [] }),
        ],
        extension: [
          sourceQuery({ reference: '#patient' }),
          sourceQuery({ reference: '#none' }),
          sourceQuery({ reference: '#nulled' }),
          sourceQuery({ reference: '#shadowed' }),
          sourceQuery({ reference: '#missing' }),
        ],
      }),
    ).toEqual([]);
  });

  it('supplies sourceQuery<i> for every other reference, counting every valueReference', () => {
    expect(
      supplied({
        contained: [bundle('a', { entry: [] })],
        extension: [
          sourceQuery({ display: 'display only' }),
          sourceQuery({ reference: '' }),
          sourceQuery({}),
          sourceQuery({ reference: '#' }),
          sourceQuery({ reference: '#a' }),
          sourceQuery({ reference: 'Observation?c=1' }),
          sourceQuery({ reference: 'Patient/p1' }),
        ],
      }),
    ).toEqual(['a', 'sourceQuery5', 'sourceQuery6']);
  });

  it('supplies a #a b name, but not a #%x one, which a host variable cannot be', () => {
    expect(
      supplied({
        contained: [bundle('%x', { entry: [] }), bundle('a b', { entry: [] })],
        extension: [sourceQuery({ reference: '#%x' }), sourceQuery({ reference: '#a b' })],
      }),
    ).toEqual(['a b']);
  });

  it('ignores item-level sourceQueries and a URL with a version', () => {
    expect(
      supplied({
        extension: [{ url: `${sdc}sourceQueries|3.0.0`, valueReference: { reference: 'Patient' } }],
        item: [{ linkId: 'g', type: 'group', extension: [sourceQuery({ reference: 'Patient' })] }],
      }),
    ).toEqual([]);
  });

  it('supplies nothing when subjectType lacks Patient', () => {
    const extension = [sourceQuery({ reference: 'Observation?c=1' })];
    expect(supplied({ subjectType: ['Group'], extension })).toEqual([]);
    expect(supplied({ subjectType: ['Group', 'Patient'], extension })).toEqual(['sourceQuery0']);
    expect(supplied({ subjectType: [], extension })).toEqual(['sourceQuery0']);
  });

  it('needs the Smart Forms versions in compat', () => {
    expect(() =>
      smartForms.hostVariables?.({ document: documentOf(questionnaire({})), compat: {} }),
    ).toThrow(/names no Smart Forms renderer version/);
  });
});

// What the lint cases cannot build: SUSHI drops an empty array and an empty object.
describe('the supplied names in a lint run', () => {
  async function undefinedNames(
    fields: Record<string, unknown>,
    rules: Record<string, string> = {},
  ) {
    const report = await lintWithPlugin(
      { 'Questionnaire-Q.json': JSON.stringify(questionnaire(fields)) },
      `rules: ${JSON.stringify({ 'sdc/unused-declaration': 'off', ...rules })}`,
    );
    return report.findings
      .filter(({ ruleId }) => ruleId === 'sdc/undefined-variable')
      .map(({ message }) => message);
  }
  const uses = (expression: string) => ({
    url: VARIABLE,
    valueExpression: { name: 'v', language: 'text/fhirpath', expression },
  });

  it('accepts %id for a contained Bundle with an empty entry', async () => {
    expect(
      await undefinedNames({
        contained: [bundle('prepop', { entry: [] })],
        extension: [sourceQuery({ reference: '#prepop' }), uses('%prepop.entry.count()')],
      }),
    ).toEqual([]);
  });

  it('supplies the names with every smart-forms rule off', async () => {
    const off = Object.fromEntries(
      Object.keys(smartForms.rules).map((key) => [`smart-forms/${key}`, 'off']),
    );
    expect(
      await undefinedNames(
        { extension: [sourceQuery({ reference: 'Patient' }), uses('%sourceQuery0.id')] },
        off,
      ),
    ).toEqual([]);
  });

  it('counts an empty valueReference for the index of sourceQuery<i>', async () => {
    expect(
      await undefinedNames({
        extension: [
          sourceQuery({}),
          sourceQuery({ reference: 'Observation?code=1' }),
          uses('%sourceQuery1.total + %sourceQuery0.total'),
        ],
      }),
    ).toEqual(['%sourceQuery0 is not available on the Questionnaire root.']);
  });
});

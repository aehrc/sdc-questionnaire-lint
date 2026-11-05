/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import {
  findingDetailLines,
  primaryLocation,
  type UnmappedReason,
} from '../../src/report/locations.js';
import type { SourceLocation } from '../../src/report/types.js';
import { questionnaireFinding, staleSuppressionFinding } from '../support/builders.js';

const location: SourceLocation = {
  file: 'input/fsh/Example.fsh',
  line: 42,
  column: 18,
  endLine: 42,
  endColumn: 30,
};
const mapped = questionnaireFinding({
  sourceLocation: { status: 'mapped', confidence: 'exact', location },
});

describe('primaryLocation', () => {
  it('gives the FSH range of a mapped finding', () => {
    expect(primaryLocation(mapped)).toEqual({ kind: 'source', location });
  });

  it.each<UnmappedReason>(['ambiguous', 'multiline', 'not-found', 'source-unavailable'])(
    'gives the compiled site of a finding unmapped as %s, with the reason',
    (reason) => {
      const finding = questionnaireFinding({ sourceLocation: { status: 'unmapped', reason } });
      expect(primaryLocation(finding)).toEqual({
        kind: 'compiled',
        file: 'fsh-generated/resources/Questionnaire-Example.json',
        pointer: '/item/0/extension/0/valueExpression/expression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
        reason,
      });
    },
  );

  it('gives the config entry of a config finding', () => {
    expect(primaryLocation(staleSuppressionFinding())).toEqual({
      kind: 'config',
      file: 'sdc-questionnaire-lint.config.json',
      pointer: '/suppress/0',
    });
  });
});

describe('findingDetailLines', () => {
  it('has only the note and help of a mapped finding', () => {
    const finding = { ...mapped, note: 'a note', help: 'a fix' };
    expect(findingDetailLines(finding)).toEqual(['note: a note', 'help: a fix']);
  });

  it('has nothing for a mapped finding without note, help or related locations', () => {
    expect(findingDetailLines(mapped)).toEqual([]);
  });

  it('locates an unmapped finding in a Bundle Questionnaire without an id, and says why', () => {
    const finding = questionnaireFinding({
      jsonLocation: {
        file: 'bundle.json',
        pointer: '',
        resource: { resourceType: 'Questionnaire', pointer: '/entry/0/resource' },
      },
      sourceLocation: { status: 'unmapped', reason: 'multiline' },
    });
    expect(findingDetailLines(finding)).toEqual([
      'location: compiled JSON; Questionnaire without id at /entry/0/resource; (file root)',
      'note: FSH line not found, the expression spans several lines',
    ]);
  });

  it('locates a config finding at its entry, before its help', () => {
    expect(findingDetailLines(staleSuppressionFinding())).toEqual([
      'location: /suppress/0',
      'help: remove this suppression from the configuration',
    ]);
  });

  it('lists related locations after the location and before the note and help', () => {
    const finding = questionnaireFinding({
      note: 'a note',
      help: 'a fix',
      relatedLocations: [
        {
          kind: 'questionnaire',
          jsonLocation: mapped.jsonLocation,
          sourceLocation: mapped.sourceLocation,
          message: 'first declared here',
        },
        {
          kind: 'questionnaire',
          jsonLocation: mapped.jsonLocation,
          sourceLocation: { status: 'unmapped', reason: 'not-found' },
        },
        {
          kind: 'config',
          configLocation: { file: 'sdc-questionnaire-lint.config.json', pointer: '/suppress/1' },
        },
      ],
    });
    expect(findingDetailLines(finding)).toEqual([
      'location: compiled JSON; Questionnaire/Example; /item/0/extension/0/valueExpression/expression',
      'note: FSH line not found, no FSH sources are available',
      'related: input/fsh/Example.fsh:42:18: first declared here',
      'related: /item/0/extension/0/valueExpression/expression',
      'related: sdc-questionnaire-lint.config.json /suppress/1',
      'note: a note',
      'help: a fix',
    ]);
  });
});

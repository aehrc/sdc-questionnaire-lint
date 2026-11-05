/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// What the lint cases cannot build: a group with an empty item array, which SUSHI does not write.
import { describe, expect, it } from 'vitest';
import { lintWithPlugin } from './support/lint.js';
import { expression, ext, questionnaire, sdc } from './support/sites.js';

describe('smart-forms/named-expression-not-referenceable', () => {
  it('reports an itemPopulationContext on a group with an empty item array', async () => {
    const report = await lintWithPlugin({
      'Questionnaire-Q.json': JSON.stringify(
        questionnaire({
          item: [
            {
              linkId: 'g',
              type: 'group',
              text: 'Group',
              extension: [
                ext(`${sdc}itemPopulationContext`, expression('text/fhirpath', '%resource', 'x')),
                ext(`${sdc}enableWhenExpression`, expression('text/fhirpath', '%x.exists()')),
              ],
              item: [],
            },
          ],
        }),
      ),
    });
    const findings = report.findings.filter(
      ({ ruleId }) => ruleId === 'smart-forms/named-expression-not-referenceable',
    );
    expect(findings.map(({ message, help }) => ({ message, help }))).toEqual([
      {
        message:
          '%x refers to the itemPopulationContext on item "Group" (g), which Smart Forms does not ' +
          'make available to other expressions, because the item has no child items, so the ' +
          'reference never gets its value.',
        help:
          'make it the only itemPopulationContext on a group with child items, with expression ' +
          'text, or declare the value as a variable',
      },
    ]);
  });
});

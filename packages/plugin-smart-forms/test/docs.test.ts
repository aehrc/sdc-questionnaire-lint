/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import smartForms from '../src/index.js';
import { runCliWithPlugin } from './support/lint.js';

const rules = Object.entries(smartForms.rules);
// A config must list files, though explain reads none.
const files = { 'Questionnaire-Q.json': '{"resourceType":"Questionnaire","status":"draft"}' };

describe('smart-forms rule docs', () => {
  it.each(rules.map(([key, rule]) => [key, rule.meta.docs]))(
    'smart-forms/%s has every docs field',
    (_, docs) => {
      for (const field of ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const) {
        expect(docs?.[field].trim()).toBeTruthy();
      }
    },
  );

  it.each(rules.map(([key]) => key))(
    'sdc-lint explain smart-forms/%s prints them with the plugin listed',
    async (key) => {
      const { code, stdout } = await runCliWithPlugin(files, ['explain', `smart-forms/${key}`]);
      expect(code).toBe(0);
      expect(stdout).toContain(`smart-forms/${key}`);
      expect(stdout).toContain(smartForms.rules[key]?.meta.docs?.exampleMessage ?? '');
    },
  );
});

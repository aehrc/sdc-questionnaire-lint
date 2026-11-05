/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { resolveRuleSet } from '../../src/plugins/rule-set.js';

describe('built-in rule docs', () => {
  it.each(resolveRuleSet(null).rules.map(({ id, rule }) => [id, rule.meta.docs]))(
    '%s has every docs field',
    (_, docs) => {
      for (const field of ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const) {
        expect(docs?.[field].trim()).toBeTruthy();
      }
    },
  );
});

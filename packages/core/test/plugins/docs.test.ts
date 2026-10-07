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

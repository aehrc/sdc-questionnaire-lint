import { describe, expect, it } from 'vitest';
import { buildRuleRegistry } from '../../src/plugins/rule-registry.js';

describe('built-in rule docs', () => {
  it.each(buildRuleRegistry(null).rules.map(({ id, rule }) => [id, rule.meta.docs]))(
    '%s has every docs field',
    (_, docs) => {
      for (const field of ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const) {
        expect(docs?.[field].trim()).toBeTruthy();
      }
    },
  );
});

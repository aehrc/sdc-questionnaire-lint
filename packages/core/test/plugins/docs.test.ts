import { describe, expect, it } from 'vitest';
import { registerRules } from '../../src/plugins/registry.js';

describe('built-in rule docs', () => {
  it.each(registerRules(null).map(({ id, rule }) => [id, rule.meta.docs]))(
    '%s has every docs field',
    (_, docs) => {
      for (const field of ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const) {
        expect(docs?.[field].trim()).toBeTruthy();
      }
    },
  );
});

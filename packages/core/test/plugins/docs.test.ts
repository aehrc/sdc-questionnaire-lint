import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../src/plugins/registry.js';

// Built-in rules must be documented for sdc-lint explain; a new rule fails here until it is.
const builtIn = buildRegistry(null).rules.filter(
  (rule) => rule.plugin === 'sdc' || rule.plugin === 'lint',
);

describe('built-in rule documentation', () => {
  it('covers at least lint/stale-suppression', () => {
    expect(builtIn.map((rule) => rule.id)).toContain('lint/stale-suppression');
  });

  it.each(builtIn.map((rule) => [rule.id, rule] as const))(
    '%s has all five sections',
    (_id, rule) => {
      expect(rule.docs).toEqual({
        checks: expect.stringMatching(/\S/) as unknown,
        why: expect.stringMatching(/\S/) as unknown,
        exampleMessage: expect.stringMatching(/\S/) as unknown,
        fix: expect.stringMatching(/\S/) as unknown,
        limitations: expect.stringMatching(/\S/) as unknown,
      });
    },
  );
});

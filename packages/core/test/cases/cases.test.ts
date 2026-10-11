import { beforeAll, describe, expect, it } from 'vitest';
import { sdcPlugin } from '../../src/plugins/builtin.js';
import { compileCases, lintCase, lintCases } from '../support/cases.js';

// Each case is a YAML config beside the findings the linter must report for it. Run
// `npx vitest run -u test/cases` to write the expected files, then review them.
const cases = lintCases();
const reported = new Set<string>();

// SUSHI compiles every case once; the first run also downloads the FHIR packages.
beforeAll(compileCases, 600_000);

describe('lint cases', () => {
  it.each(cases)('$name', async ({ configPath, expectedPath }) => {
    for (const { ruleId } of await lintCase(configPath, expectedPath)) reported.add(ruleId);
  });

  // Runs after the cases above, so a new rule cannot land without a case.
  it('cover every sdc rule', () => {
    expect(
      Object.keys(sdcPlugin.rules)
        .map((name) => `sdc/${name}`)
        .filter((ruleId) => !reported.has(ruleId)),
      'add a case under packages/core/test/cases/ whose expected findings include the rule',
    ).toEqual([]);
  });
});

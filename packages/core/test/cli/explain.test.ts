import { describe, expect, it } from 'vitest';
import { runBinary, runInProcess } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

const config = 'sdc-questionnaire-lint.config.json';

describe('sdc-lint explain', () => {
  // The directory is empty, so this also shows that explain reads no inputs.
  it('lists the registered rules without a config', async () => {
    const result = await runInProcess(['explain'], { cwd: await tempTree() });
    expect(result).toEqual({
      code: 0,
      stdout:
        'RULE                         DEFAULT  EFFECTIVE  DESCRIPTION\n' +
        'sdc/fragment-parse-error     error    error      Reports a FHIRPath expression embedded in an x-fhir-query that does not parse.\n' +
        'sdc/parse-error              error    error      Reports a FHIRPath expression that does not parse.\n' +
        'sdc/query-syntax             error    error      Reports an x-fhir-query that is not a FHIR search.\n' +
        'sdc/uncatalogued-expression  info     info       Reports an expression in a place the linter does not recognise.\n' +
        'sdc/unknown-function         error    error      Reports a call to a function that fhirpath.js does not implement.\n' +
        '\n' +
        'Config: none, built-in defaults.\n' +
        "Run sdc-lint explain <rule-id> for a rule's documentation.\n",
      stderr: '',
    });
  });

  it('lists a rule configured off, with its effective severity', async () => {
    const cwd = await tempTree({ [config]: '{ "rules": { "sdc/parse-error": "off" } }' });
    const { code, stdout } = await runInProcess(['explain'], { cwd });
    expect(code).toBe(0);
    expect(stdout).toMatch(/^sdc\/parse-error +error +off +Reports/m);
    expect(stdout).toContain(`Config: ${config}.\n`);
  });

  it('prints the documentation of a named rule, even when it is off', async () => {
    const cwd = await tempTree({ [config]: '{ "rules": { "sdc/parse-error": "off" } }' });
    const { code, stdout } = await runInProcess(['explain', 'sdc/parse-error'], { cwd });
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^sdc\/parse-error\nReports a FHIRPath expression that does not parse\.\n\nDefault severity: error\. Effective severity: off\.\n/,
    );
    const headings = stdout.split('\n').filter((line) => /^[A-Z]/.test(line));
    expect(headings).toEqual([
      'Reports a FHIRPath expression that does not parse.',
      'Default severity: error. Effective severity: off.',
      'What it checks',
      'Why it matters',
      'Example message',
      'How to fix it',
      'Known limitations',
      `Config: ${config}.`,
    ]);
  });

  it('prints the documentation of sdc/unknown-function', async () => {
    const { code, stdout } = await runInProcess(['explain', 'sdc/unknown-function'], {
      cwd: await tempTree(),
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^sdc\/unknown-function\nReports a call to a function that fhirpath\.js does not implement\.\n\nDefault severity: error\. Effective severity: error\.\n/,
    );
    expect(stdout).toContain(
      'fist() is not a FHIRPath function, so this expression fails when the form runs.',
    );
  });

  it('prints the documentation of sdc/fragment-parse-error', async () => {
    const { code, stdout } = await runInProcess(['explain', 'sdc/fragment-parse-error'], {
      cwd: await tempTree(),
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^sdc\/fragment-parse-error\nReports a FHIRPath expression embedded in an x-fhir-query that does not parse\.\n\nDefault severity: error\. Effective severity: error\.\n/,
    );
    expect(stdout).toContain('The expression ends before it is complete.');
  });

  it('prints the documentation of sdc/query-syntax', async () => {
    const { code, stdout } = await runInProcess(['explain', 'sdc/query-syntax'], {
      cwd: await tempTree(),
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^sdc\/query-syntax\nReports an x-fhir-query that is not a FHIR search\.\n\nDefault severity: error\. Effective severity: error\.\n/,
    );
    expect(stdout).toContain('This x-fhir-query is not a FHIR search');
  });

  it('exits 2 for an unknown rule, naming a similar one on stderr', async () => {
    const result = runBinary(['explain', 'sdc/parse-eror'], { cwd: await tempTree() });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: unknown rule sdc/parse-eror\n' +
        'help: a rule with a similar name exists: sdc/parse-error\n',
    });
  });

  it('exits 2 for an invalid config', async () => {
    const cwd = await tempTree({ [config]: '{ "rules": { "sdc/parse-eror": "off" } }' });
    const result = await runInProcess(['explain'], { cwd });
    expect(result).toMatchObject({ code: 2, stdout: '' });
    expect(result.stderr).toMatch(/^error: config \S+ is invalid at \/rules\/sdc~1parse-eror: /);
  });
});

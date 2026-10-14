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
        'RULE                           DEFAULT  EFFECTIVE  DESCRIPTION\n' +
        'lint/stale-suppression         warning  warning    Reports a suppression that is no longer needed.\n' +
        'sdc/dependency-cycle           warning  warning    Reports declarations whose expressions reference each other in a cycle.\n' +
        'sdc/duplicate-declaration      error    error      Reports a name declared more than once on one item or on the root.\n' +
        'sdc/external-expression        info     info       Reports an expression whose content is only behind a reference.\n' +
        'sdc/fragment-parse-error       error    error      Reports a FHIRPath expression embedded in an x-fhir-query that does not parse.\n' +
        'sdc/language-not-allowed       error    error      Reports an expression language that SDC does not allow at its location.\n' +
        'sdc/language-not-in-value-set  warning  warning    Reports an expression language that FHIR R4 and R5 do not define.\n' +
        'sdc/parse-error                error    error      Reports a FHIRPath expression that does not parse.\n' +
        'sdc/query-syntax               error    error      Reports an x-fhir-query that is not a FHIR search.\n' +
        'sdc/reserved-name              error    error      Reports a declaration of a name that FHIRPath, FHIR or SDC defines.\n' +
        'sdc/shadowed-declaration       info     info       Reports a name an item declares that an ancestor item or the root also declares.\n' +
        'sdc/uncatalogued-expression    info     info       Reports an expression in a place the linter does not recognise.\n' +
        'sdc/undefined-variable         error    error      Reports a %name that is not available where it is used.\n' +
        'sdc/unknown-function           error    error      Reports a call to a function that fhirpath.js does not implement.\n' +
        'sdc/unresolved-linkid          warning  warning    Reports a literal linkId that no item in the Questionnaire has.\n' +
        'sdc/unused-declaration         warning  warning    Reports a variable that no expression references.\n' +
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

  it('exits 2 for compat naming a plugin that is not listed, as lint does', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({ compat: { 'smart-forms': 'latest' } }),
    });
    const result = await runInProcess(['explain'], { cwd });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        `error: config ${config} is invalid at /compat/smart-forms: no listed plugin has the namespace smart-forms\n` +
        'help: list the plugin providing smart-forms/ rules in plugins in an .mjs config\n',
    });
  });

  // The directories are empty, so these also show that the suppressions are checked before any
  // input is read.
  it('exits 2 for a suppression of an unknown rule', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({
        suppress: [{ rule: 'sdc/parse-eror', file: 'Questionnaire-A.json', reason: 'demo' }],
      }),
    });
    const result = await runInProcess(['explain'], { cwd });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        `error: config ${config} is invalid at /suppress/0/rule: unknown rule sdc/parse-eror\n` +
        'help: a rule with a similar name exists: sdc/parse-error\n',
    });
  });

  it('exits 2 for a suppression of a lint/ rule', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({
        suppress: [
          { rule: 'lint/stale-suppression', file: 'Questionnaire-A.json', reason: 'demo' },
        ],
      }),
    });
    const result = await runInProcess(['explain', 'lint/stale-suppression'], { cwd });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        `error: config ${config} is invalid at /suppress/0/rule: lint/stale-suppression findings cannot be suppressed\n` +
        'help: set lint/stale-suppression to off in rules instead\n',
    });
  });

  it('prints the documentation of lint/stale-suppression', async () => {
    const { code, stdout } = await runInProcess(['explain', 'lint/stale-suppression'], {
      cwd: await tempTree(),
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(
      /^lint\/stale-suppression\nReports a suppression that is no longer needed\.\n\nDefault severity: warning\. Effective severity: warning\.\n/,
    );
    expect(stdout).toContain(
      'hides nothing: the rule checked this expression and found no problem',
    );
  });

  describe('with a plugin', () => {
    // compat is the plugin's; configCompat, the config's compat for it.
    function pluginConfig(
      meta: Record<string, unknown>,
      { compat, configCompat }: { compat?: unknown; configCompat?: unknown } = {},
    ) {
      return tempTree({
        'sdc-questionnaire-lint.config.mjs': `export default {
          ${configCompat === undefined ? '' : `compat: { demo: ${JSON.stringify(configCompat)} },`}
          plugins: [{
            meta: { name: 'demo', version: '0.0.0' },
            ${compat === undefined ? '' : `compat: ${JSON.stringify(compat)},`}
            rules: {
              'no-today': {
                meta: ${JSON.stringify({ description: 'Flags today().', defaultSeverity: 'warning', ...meta })},
                check() {},
              },
            },
          }],
        };`,
      });
    }

    it('lists plugin rules among the sdc rules', async () => {
      const { code, stdout } = await runInProcess(['explain'], { cwd: await pluginConfig({}) });
      expect(code).toBe(0);
      expect(stdout).toMatch(
        /^RULE +DEFAULT +EFFECTIVE +DESCRIPTION\ndemo\/no-today +warning +warning +Flags today\(\)\.\nlint\/stale-suppression /,
      );
    });

    it('says when a plugin rule ships no documentation', async () => {
      const cwd = await pluginConfig({});
      const { code, stdout } = await runInProcess(['explain', 'demo/no-today'], { cwd });
      expect(code).toBe(0);
      expect(stdout).toBe(
        'demo/no-today\n' +
          'Flags today().\n\n' +
          'Default severity: warning. Effective severity: warning.\n\n' +
          'The demo plugin ships no bundled documentation for this rule.\n\n' +
          'Config: sdc-questionnaire-lint.config.mjs.\n',
      );
    });

    it('shows the docsUrl', async () => {
      const cwd = await pluginConfig({ docsUrl: 'https://example.org/no-today' });
      const { stdout } = await runInProcess(['explain', 'demo/no-today'], { cwd });
      expect(stdout).toContain(
        'Default severity: warning. Effective severity: warning.\n' +
          'Documentation: https://example.org/no-today\n',
      );
    });

    describe('with compat', () => {
      const compat = { verified: { engine: ['1.0.0', '2.0.0'] }, required: ['engine'] };

      it('lists the resolved compat after the config line', async () => {
        const { code, stdout } = await runInProcess(['explain'], {
          cwd: await pluginConfig({}, { compat }),
        });
        expect(code).toBe(0);
        expect(stdout).toMatch(
          /\nConfig: sdc-questionnaire-lint\.config\.mjs\.\nCompat demo: engine 2\.0\.0\.\nRun sdc-lint explain <rule-id> for a rule's documentation\.\n$/,
        );
      });

      it("prints the rule's compat after the config line", async () => {
        const cwd = await pluginConfig({}, { compat });
        const { stdout } = await runInProcess(['explain', 'demo/no-today'], { cwd });
        expect(stdout).toMatch(
          /\n\nConfig: sdc-questionnaire-lint\.config\.mjs\.\nCompat demo: engine 2\.0\.0\.\n$/,
        );
      });

      it('prints the version the config selects', async () => {
        const cwd = await pluginConfig({}, { compat, configCompat: { engine: '1.0.0' } });
        const list = await runInProcess(['explain'], { cwd });
        expect(list.stdout).toContain('\nCompat demo: engine 1.0.0.\n');
        const page = await runInProcess(['explain', 'demo/no-today'], { cwd });
        expect(page.stdout).toContain('\nCompat demo: engine 1.0.0.\n');
      });

      it('prints no compat on the page of an sdc rule', async () => {
        const cwd = await pluginConfig({}, { compat, configCompat: { engine: '1.0.0' } });
        const { code, stdout } = await runInProcess(['explain', 'sdc/undefined-variable'], { cwd });
        expect(code).toBe(0);
        expect(stdout).not.toContain('Compat');
        expect(stdout).toMatch(/\n\nConfig: sdc-questionnaire-lint\.config\.mjs\.\n$/);
      });
    });

    it('exits 2 for a rule of a plugin that is not listed', async () => {
      const result = await runInProcess(['explain', 'smart-forms/x'], { cwd: await tempTree() });
      expect(result).toEqual({
        code: 2,
        stdout: '',
        stderr:
          'error: unknown rule smart-forms/x\n' +
          'help: the plugin providing smart-forms/ rules must be listed in plugins in an .mjs config\n',
      });
    });

    it('sends logging from the config to stderr', async () => {
      const cwd = await tempTree({
        'sdc-questionnaire-lint.config.mjs': "console.log('hello');\nexport default {};\n",
      });
      const { code, stdout, stderr } = await runInProcess(['explain'], { cwd });
      expect(code).toBe(0);
      expect(stdout).toMatch(/^RULE /);
      expect(stderr).toBe('hello\n');
    });
  });
});

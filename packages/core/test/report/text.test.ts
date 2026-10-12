import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatTextFindings, formatTextReport, formatTextSummary } from '../../src/report/text.js';
import type { CompletedReport, Finding, QuestionnaireFinding } from '../../src/report/types.js';
import {
  completedReport,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';
import { docsDir } from '../support/report.js';

const plain = { showInfo: false, colour: false };

// The example under "### `text`" in docs/cli.md: two findings and the summary.
const specExample = (() => {
  const cli = readFileSync(new URL('cli.md', docsDir), 'utf8');
  const section = cli.slice(cli.indexOf('### `text`'));
  const block = /```text\n([\s\S]*?)```/.exec(section)?.[1];
  if (block === undefined) throw new Error('docs/cli.md has no text output example');
  const [error, warning, summary] = block.split('\n\n');
  if (error === undefined || warning === undefined || summary === undefined) {
    throw new Error('the text output example no longer has two findings and a summary');
  }
  return { error, warning, summary };
})();

const specError = questionnaireFinding({
  ruleId: 'sdc/undefined-variable',
  severity: 'error',
  message:
    '"Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.',
  help: 'a variable with a similar name exists: %patientName',
  sourceLocation: {
    status: 'mapped',
    confidence: 'exact',
    location: { file: 'input/fsh/Example.fsh', line: 42, column: 18, endLine: 42, endColumn: 30 },
  },
  expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
});

const specWarning = questionnaireFinding({
  ruleId: 'sdc/unused-declaration',
  severity: 'warning',
  message: '"Patient summary" (patient-summary) declares %age, which nothing uses.',
  help: 'remove the variable, or reference it as %age',
  fingerprint: 'unused',
  jsonLocation: {
    file: 'fsh-generated/resources/Questionnaire-Example.json',
    pointer: '/item/1/extension/0/valueExpression/expression',
    resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
  },
  sourceLocation: { status: 'unmapped', reason: 'ambiguous' },
  expression: { text: '%patient.birthDate' },
});

function info(n: number): QuestionnaireFinding {
  return questionnaireFinding({
    ruleId: 'sdc/shadowed-declaration',
    severity: 'info',
    message: `Info finding ${String(n)}.`,
    fingerprint: `info-${String(n)}`,
  });
}

const infos = [1, 2, 3, 4].map(info);

function specReport(): CompletedReport {
  const report = completedReport([specError, specWarning, ...infos], {
    files: { read: 5, skipped: 2 },
    questionnaires: 3,
    expressions: { analysed: 8, unchecked: 1 },
    config: 'sdc-questionnaire-lint.config.mjs',
    fshSources: ['input/fsh'],
  });
  report.run.plugins.push({ name: 'smart-forms', version: '0.1.0' });
  report.run.compat['smart-forms'] = {
    renderer: '1.4.0',
    populate: '4.7.1',
    'template-extract': '1.0.15',
  };
  report.run.sushi = { version: '3.20.1' };
  return report;
}

describe('the docs/cli.md text example', () => {
  it('matches the mapped error', () => {
    expect(formatTextFindings([specError], plain)).toBe(`${specExample.error}\n`);
  });

  it('matches the unmapped warning', () => {
    expect(formatTextFindings([specWarning], plain)).toBe(`${specExample.warning}\n`);
  });

  it('matches the summary', () => {
    expect(formatTextSummary(specReport(), plain)).toBe(specExample.summary);
  });

  it('combines findings, a blank line and the summary, in sorted order', () => {
    // Sorted by displayed file, so fsh-generated/… comes before input/fsh/….
    expect(formatTextReport(specReport(), plain)).toBe(
      `${specExample.warning}\n\n${specExample.error}\n\n${specExample.summary}`,
    );
  });
});

describe('formatTextFindings', () => {
  it('locates an unmapped finding in a Bundle entry by its resource pointer', () => {
    const finding = questionnaireFinding({
      message: 'Questionnaire/Example uses %patientNmae, which is not defined.',
      jsonLocation: {
        file: 'fsh-generated/resources/Bundle-Example.json',
        pointer: '/entry/0/resource/extension/0/valueExpression/expression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '/entry/0/resource' },
      },
      expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
      note: 'FSH sources were not found; this is a compiled JSON location.',
    });
    expect(formatTextFindings([finding], plain)).toBe(
      'fsh-generated/resources/Bundle-Example.json: error sdc/undefined-variable Questionnaire/Example uses %patientNmae, which is not defined.\n' +
        '  %patientNmae.exists()\n' +
        `  ^${'~'.repeat(11)}\n` +
        '  location: compiled JSON; Questionnaire/Example at /entry/0/resource; /entry/0/resource/extension/0/valueExpression/expression\n' +
        '  note: FSH line not found, no FSH sources are available\n' +
        '  note: FSH sources were not found; this is a compiled JSON location.\n',
    );
  });

  it('identifies a resource without an ID by type and pointer', () => {
    const inBundle = questionnaireFinding({
      jsonLocation: {
        file: 'Bundle.json',
        pointer: '/entry/2/resource/item/0',
        resource: { resourceType: 'Questionnaire', pointer: '/entry/2/resource' },
      },
      sourceLocation: { status: 'unmapped', reason: 'not-found' },
    });
    const standalone = questionnaireFinding({
      jsonLocation: {
        file: 'Questionnaire.json',
        pointer: '/item/0',
        resource: { resourceType: 'Questionnaire', pointer: '' },
      },
      sourceLocation: { status: 'unmapped', reason: 'multiline' },
    });
    expect(formatTextFindings([inBundle], plain)).toContain(
      '  location: compiled JSON; Questionnaire without id at /entry/2/resource; /entry/2/resource/item/0\n' +
        '  note: FSH line not found, the expression was not found in the FSH sources\n',
    );
    expect(formatTextFindings([standalone], plain)).toContain(
      '  location: compiled JSON; Questionnaire without id; /item/0\n' +
        '  note: FSH line not found, the expression spans several lines\n',
    );
  });

  it('names the config file and entry pointer for a config finding', () => {
    expect(formatTextFindings([staleSuppressionFinding()], plain)).toBe(
      'sdc-questionnaire-lint.config.json: warning lint/stale-suppression A suppression targets B.json, which no longer exists.\n' +
        '  location: /suppress/0\n' +
        '  help: remove this suppression from the configuration\n',
    );
  });

  it('lists each related location, by FSH line when mapped and by JSON Pointer otherwise', () => {
    const finding = questionnaireFinding({
      ruleId: 'sdc/duplicate-declaration',
      message: 'The name %patient is declared more than once on the Questionnaire root.',
      jsonLocation: {
        file: 'Q.json',
        pointer: '/extension/1',
        resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
      },
      relatedLocations: [
        {
          kind: 'questionnaire',
          jsonLocation: {
            file: 'Q.json',
            pointer: '/extension/0',
            resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          },
          sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
          message: '%patient is also declared here',
        },
        {
          kind: 'questionnaire',
          jsonLocation: {
            file: 'Q.json',
            pointer: '/extension/2',
            resource: { resourceType: 'Questionnaire', id: 'Q', pointer: '' },
          },
          sourceLocation: {
            status: 'mapped',
            confidence: 'exact',
            location: { file: 'input/fsh/Q.fsh', line: 3, column: 1, endLine: 3, endColumn: 9 },
          },
        },
      ],
    });
    expect(formatTextFindings([finding], plain)).toBe(
      'Q.json: error sdc/duplicate-declaration The name %patient is declared more than once on the Questionnaire root.\n' +
        '  location: compiled JSON; Questionnaire/Q; /extension/1\n' +
        '  note: FSH line not found, no FSH sources are available\n' +
        '  related: /extension/0: %patient is also declared here\n' +
        '  related: input/fsh/Q.fsh:3:1\n',
    );
  });

  it('prints no excerpt without an expression, and no location for a mapped finding', () => {
    const withoutExpression = { ...specError };
    delete withoutExpression.expression;
    expect(formatTextFindings([withoutExpression], plain)).toBe(
      'input/fsh/Example.fsh:42:18: error sdc/undefined-variable "Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.\n' +
        '  help: a variable with a similar name exists: %patientName\n',
    );
  });

  it('prints the expression line containing the range, with the caret under it', () => {
    // Offset 16 is the w of where on the second line, after a tab and a dot.
    const finding = questionnaireFinding({
      expression: {
        text: "Patient.name\r\n\t.where(use = 'official').given\n.first()",
        range: { startOffset: 16, endOffset: 40 },
      },
    });
    expect(formatTextFindings([finding], plain)).toContain(
      "  \t.where(use = 'official').given\n" + `  \t ^${'~'.repeat(23)}\n`,
    );
  });

  it('stops the caret at the end of the line and shows an empty range as one caret', () => {
    const spanning = questionnaireFinding({
      expression: { text: 'a.b\n.c', range: { startOffset: 2, endOffset: 6 } },
    });
    const empty = questionnaireFinding({
      expression: { text: 'a.b', range: { startOffset: 3, endOffset: 3 } },
    });
    expect(formatTextFindings([spanning], plain)).toContain('  a.b\n    ^\n');
    expect(formatTextFindings([empty], plain)).toContain('  a.b\n     ^\n');
  });

  it('hides info findings unless asked to show them', () => {
    const findings: Finding[] = [specWarning, info(1)];
    expect(formatTextFindings(findings, plain)).not.toContain('info sdc/shadowed-declaration');
    expect(formatTextFindings(findings, { ...plain, showInfo: true })).toContain(
      'fsh-generated/resources/Questionnaire-Example.json: info sdc/shadowed-declaration Info finding 1.\n',
    );
  });

  it('separates findings with one blank line', () => {
    const output = formatTextFindings([staleSuppressionFinding(), specError], plain);
    expect(output.split('\n\n')).toHaveLength(2);
    expect(output.endsWith('\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });

  it('returns nothing when every finding is hidden', () => {
    expect(formatTextFindings([info(1)], plain)).toBe('');
  });

  it('colours only the severity word when asked', () => {
    const output = formatTextFindings([specError, specWarning, info(1)], {
      showInfo: true,
      colour: true,
    });
    expect(output).toContain(': \u001b[31merror\u001b[39m sdc/undefined-variable ');
    expect(output).toContain(': \u001b[33mwarning\u001b[39m sdc/unused-declaration ');
    expect(output).toContain(': \u001b[34minfo\u001b[39m sdc/shadowed-declaration ');
    expect(output.split('\u001b[')).toHaveLength(7);
  });
});

describe('formatTextSummary', () => {
  it('reports an info-only run with the hidden count', () => {
    const report = completedReport(infos, { questionnaires: 3 });
    expect(formatTextSummary(report, plain).split('\n')[0]).toBe(
      '4 findings (0 errors, 0 warnings, 4 info) in 3 questionnaires. 4 info findings hidden; use --show-info.',
    );
    expect(formatTextSummary(report, { showInfo: true }).split('\n')[0]).toBe(
      '4 findings (0 errors, 0 warnings, 4 info) in 3 questionnaires.',
    );
  });

  it('reports a clean run', () => {
    const report = completedReport([], { questionnaires: 3, suppressedFindings: 2 });
    expect(formatTextSummary(report, plain)).toBe(
      '0 findings in 3 questionnaires.\n' +
        'Inputs: full run; 1 file read, 0 skipped. Expressions: 1 analysed, 0 unchecked. Suppressed findings: 2.\n' +
        'Suppressions: 0 applied, 0 stale, 0 not assessed.\n' +
        'Config: none, built-in defaults. FSH sources: input/fsh.\n' +
        'Linter: 0.1.0. Plugins: sdc@0.1.0.\n',
    );
  });

  it('names the SUSHI version after the plugins when the report has it', () => {
    const report = completedReport();
    report.run.sushi = { version: '3.20.1' };
    expect(formatTextSummary(report, plain)).toContain(
      '\nLinter: 0.1.0. Plugins: sdc@0.1.0. SUSHI: 3.20.1.\n',
    );
  });

  it('uses singular forms for counts of one', () => {
    const report = completedReport([specError, specWarning, info(1)]);
    expect(formatTextSummary(report, plain).split('\n')[0]).toBe(
      '3 findings (1 error, 1 warning, 1 info) in 1 questionnaire. 1 info finding hidden; use --show-info.',
    );
    expect(formatTextSummary(completedReport([specError]), plain).split('\n')[0]).toBe(
      '1 finding (1 error, 0 warnings, 0 info) in 1 questionnaire.',
    );
  });

  it('reports a targeted run, several FSH sources, and none found', () => {
    const report = completedReport([], { fshSources: ['input/fsh', 'shared/fsh'] });
    report.run.selection = 'targeted';
    const lines = formatTextSummary(report, plain).split('\n');
    expect(lines[1]).toMatch(/^Inputs: targeted run; /);
    expect(lines[3]).toBe('Config: none, built-in defaults. FSH sources: input/fsh, shared/fsh.');
    expect(formatTextSummary(completedReport([], { fshSources: [] }), plain)).toContain(
      'FSH sources: none found.\n',
    );
  });

  it('reports omitted FSH lookup', () => {
    const report = completedReport([], {
      config: 'sdc-questionnaire-lint.config.json',
      fshSources: [],
      fshSourceLookup: 'omitted',
    });
    expect(formatTextSummary(report, plain)).toContain(
      'Config: sdc-questionnaire-lint.config.json. FSH sources: lookup omitted.\n',
    );
  });

  it('adds the Smart Forms line only when its versions were resolved', () => {
    expect(formatTextSummary(completedReport(), plain)).not.toContain('Smart Forms:');
    expect(formatTextSummary(specReport(), plain).trimEnd().split('\n').at(-1)).toBe(
      'Smart Forms: renderer 1.4.0, populate 4.7.1, template-extract 1.0.15.',
    );
  });

  it('leaves template-extract out of the Smart Forms line when it was not selected', () => {
    const report = specReport();
    report.run.compat['smart-forms'] = { renderer: '1.4.0', populate: '4.7.1' };
    expect(formatTextSummary(report, plain).trimEnd().split('\n').at(-1)).toBe(
      'Smart Forms: renderer 1.4.0, populate 4.7.1.',
    );
  });
});

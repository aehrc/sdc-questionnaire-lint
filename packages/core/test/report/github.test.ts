import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  escapeData,
  escapeProperty,
  formatGithubReport,
  formatGithubSummary,
  markdownCell,
} from '../../src/report/github.js';
import { formatTextFindings, formatTextSummary } from '../../src/report/text.js';
import type { QuestionnaireFinding, SourceLocation } from '../../src/report/types.js';
import {
  completedReport,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';

const fshRange: SourceLocation = {
  file: 'input/fsh/Example.fsh',
  line: 42,
  column: 18,
  endLine: 42,
  endColumn: 30,
};

function mappedAt(
  location: SourceLocation,
  overrides: Partial<QuestionnaireFinding> = {},
): QuestionnaireFinding {
  return questionnaireFinding({
    sourceLocation: { status: 'mapped', confidence: 'exact', location },
    ...overrides,
  });
}

const mappedError = mappedAt(fshRange, {
  ruleId: 'sdc/undefined-variable',
  message:
    '"Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.',
  help: 'a variable with a similar name exists: %patientName',
  expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
});

const unmappedWarning = questionnaireFinding({
  ruleId: 'sdc/unused-declaration',
  severity: 'warning',
  message: '"Patient summary" (patient-summary) declares %age, which nothing uses.',
  help: 'remove the variable, or reference it as %age',
  jsonLocation: {
    file: 'fsh-generated/resources/Questionnaire-Example.json',
    pointer: '/item/1/extension/0/valueExpression/expression',
    resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
  },
  sourceLocation: { status: 'unmapped', reason: 'ambiguous' },
  expression: { text: '%patient.birthDate' },
});

const info = mappedAt(
  { ...fshRange, line: 60, endLine: 60 },
  {
    ruleId: 'sdc/shadowed-declaration',
    severity: 'info',
    message: '"Address" (address) declares %name, which hides %name declared above.',
  },
);

// The output's first line for a report with this one finding.
function annotationOf(finding: QuestionnaireFinding | ReturnType<typeof staleSuppressionFinding>) {
  return formatGithubReport(completedReport([finding])).split('\n')[0];
}

function token(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('escaping', () => {
  it('escapes %, CR and LF in a message', () => {
    expect(escapeData('100% done\r\nnext')).toBe('100%25 done%0D%0Anext');
  });

  it('also escapes : and , in a property value', () => {
    expect(escapeProperty('a,b:c%\n')).toBe('a%2Cb%3Ac%25%0A');
  });
});

describe('annotations', () => {
  it('annotates a mapped finding at its FSH range, with an inclusive end column', () => {
    expect(annotationOf(mappedError)).toBe(
      '::error file=input/fsh/Example.fsh,line=42,endLine=42,col=18,endColumn=29,' +
        'title=sdc/undefined-variable::"Patient name" (patient-name) uses %25patientNmae, ' +
        'which is not defined. This field will not calculate.' +
        '%0Ahelp: a variable with a similar name exists: %25patientName',
    );
  });

  it('gives columns only to a range on one line', () => {
    const finding = mappedAt({ ...fshRange, endLine: 44, endColumn: 3 });
    expect(annotationOf(finding)).toMatch(
      /^::error file=input\/fsh\/Example\.fsh,line=42,endLine=44,title=sdc\/undefined-variable::/,
    );
  });

  it('never ends the columns before they start, for an empty range', () => {
    const finding = mappedAt({ ...fshRange, endColumn: 18 });
    expect(annotationOf(finding)).toContain(',col=18,endColumn=18,');
  });

  it('keeps an unmapped finding’s severity, with no position, naming the compiled site', () => {
    expect(annotationOf(unmappedWarning)).toBe(
      '::warning title=sdc/unused-declaration::' +
        'fsh-generated/resources/Questionnaire-Example.json: "Patient summary" (patient-summary) ' +
        'declares %25age, which nothing uses.' +
        '%0Alocation: compiled JSON; Questionnaire/Example; /item/1/extension/0/valueExpression/expression' +
        '%0Anote: FSH line not found, the expression appears more than once' +
        '%0Ahelp: remove the variable, or reference it as %25age',
    );
  });

  it('keeps an unmapped error an error', () => {
    const finding = questionnaireFinding({ severity: 'error' });
    expect(annotationOf(finding)).toMatch(/^::error title=sdc\/undefined-variable::/);
  });

  it('names the config file and entry of a config finding', () => {
    expect(annotationOf(staleSuppressionFinding())).toBe(
      '::warning title=lint/stale-suppression::sdc-questionnaire-lint.config.json: ' +
        'A suppression targets B.json, which no longer exists.' +
        '%0Alocation: /suppress/0%0Ahelp: remove this suppression from the configuration',
    );
  });

  it('annotates an info finding as a notice', () => {
    expect(annotationOf(info)).toMatch(/^::notice file=/);
  });

  it('escapes a file name and rule ID as properties', () => {
    const finding = mappedAt({ ...fshRange, file: 'input/fsh/a,b:c.fsh' }, { ruleId: 'x:y/z' });
    expect(annotationOf(finding)).toMatch(
      /^::error file=input\/fsh\/a%2Cb%3Ac\.fsh,.*,title=x%3Ay\/z::/,
    );
  });
});

describe('formatGithubReport', () => {
  const report = completedReport([info, unmappedWarning, mappedError]);
  const output = formatGithubReport(report);
  const all = { showInfo: true, colour: false };

  it('writes the annotations, then every finding in a group, then the summary', () => {
    const findings = formatTextFindings(report.findings, all);
    const summary = formatTextSummary(report, all);
    const annotations = output.split('\n').slice(0, 3);
    expect(annotations.map((line) => line.slice(0, line.indexOf(' ')))).toEqual([
      '::warning',
      '::error',
      '::notice',
    ]);
    expect(output).toBe(
      `${annotations.join('\n')}\n` +
        '::group::sdc-lint findings\n' +
        `::stop-commands::${token(findings)}\n${findings}::${token(findings)}::\n` +
        '::endgroup::\n' +
        `::stop-commands::${token(summary)}\n${summary}::${token(summary)}::\n`,
    );
  });

  it('shows info findings in the log and counts them without a hint to show them', () => {
    expect(output).toContain('info sdc/shadowed-declaration');
    expect(output).toContain('3 findings (1 error, 1 warning, 1 info) in 1 questionnaire.\n');
    expect(output).not.toContain('--show-info');
  });

  it('is the same on every run', () => {
    expect(formatGithubReport(report)).toBe(output);
  });

  it('writes only the summary for a run with no findings', () => {
    const summary = formatTextSummary(completedReport(), all);
    expect(formatGithubReport(completedReport())).toBe(
      `::stop-commands::${token(summary)}\n${summary}::${token(summary)}::\n`,
    );
  });

  it('runs no workflow command written in a form', () => {
    // Item text reaches the message and help, which the log prints whole, line breaks included.
    const injected = mappedAt(fshRange, {
      message: '"Name\n::error::injected" (name) uses %x, which is not defined.',
      help: 'define %x\n::add-mask::secret',
    });
    const output = formatGithubReport(completedReport([injected]));
    expect(output).toContain('\n::error::injected');
    const lines = output.split('\n');
    let stoppedBy: string | undefined;
    const active: string[] = [];
    for (const line of lines) {
      if (stoppedBy !== undefined) {
        if (line === `::${stoppedBy}::`) stoppedBy = undefined;
      } else if (line.startsWith('::stop-commands::')) {
        stoppedBy = line.slice('::stop-commands::'.length);
      } else if (line.startsWith('::')) {
        active.push(line.slice(0, line.indexOf('::', 2) + 2).split(' ')[0] ?? '');
      }
    }
    expect(stoppedBy).toBeUndefined();
    expect(active).toEqual(['::error', '::group::', '::endgroup::']);
  });
});

describe('markdownCell', () => {
  it('keeps Markdown and HTML from rendering, and a pipe from ending the cell', () => {
    expect(markdownCell('a|b <script>&x</script> *em* _u_ `c` [l](u) ~s~ #h \\')).toBe(
      'a\\|b &lt;script&gt;&amp;x&lt;/script&gt; \\*em\\* \\_u\\_ \\`c\\` \\[l\\](u) \\~s\\~ \\#h \\\\',
    );
  });

  it('keeps line breaks inside the cell', () => {
    expect(markdownCell('one\ntwo\r\nthree\rfour')).toBe('one<br>two<br>three<br>four');
  });
});

describe('formatGithubSummary', () => {
  const stale = staleSuppressionFinding();
  const report = completedReport([info, unmappedWarning, mappedError, stale], {
    config: 'sdc-questionnaire-lint.config.json',
  });

  it('writes the counts, a row per finding in report order, then the run', () => {
    expect(formatGithubSummary(report)).toBe(
      [
        '### sdc-lint',
        '',
        '4 findings (1 error, 2 warnings, 1 info) in 1 questionnaire.',
        '',
        '| Severity | Rule | Location | Message |',
        '| :- | :- | :- | :- |',
        '| warning | sdc/unused-declaration | fsh-generated/resources/Questionnaire-Example.json<br>Questionnaire/Example; /item/1/extension/0/valueExpression/expression | "Patient summary" (patient-summary) declares %age, which nothing uses.<br>help: remove the variable, or reference it as %age |',
        '| error | sdc/undefined-variable | input/fsh/Example.fsh:42:18 | "Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.<br>help: a variable with a similar name exists: %patientName |',
        '| info | sdc/shadowed-declaration | input/fsh/Example.fsh:60:18 | "Address" (address) declares %name, which hides %name declared above. |',
        '| warning | lint/stale-suppression | sdc-questionnaire-lint.config.json<br>/suppress/0 | A suppression targets B.json, which no longer exists.<br>help: remove this suppression from the configuration |',
        '',
        '- Inputs: full run; 1 file read, 0 skipped. Expressions: 1 analysed, 0 unchecked. Suppressed findings: 0.',
        '- Suppressions: 0 applied, 0 stale, 0 not assessed.',
        '- Config: sdc-questionnaire-lint.config.json. FSH sources: input/fsh.',
        '- Linter: 0.1.0. Plugins: sdc@0.1.0.',
        '',
      ].join('\n'),
    );
  });

  it('has no table for a run with no findings', () => {
    expect(formatGithubSummary(completedReport())).toBe(
      [
        '### sdc-lint',
        '',
        '0 findings in 1 questionnaire.',
        '',
        '- Inputs: full run; 1 file read, 0 skipped. Expressions: 1 analysed, 0 unchecked. Suppressed findings: 0.',
        '- Suppressions: 0 applied, 0 stale, 0 not assessed.',
        '- Config: none, built-in defaults. FSH sources: input/fsh.',
        '- Linter: 0.1.0. Plugins: sdc@0.1.0.',
        '',
      ].join('\n'),
    );
  });

  it('includes the Smart Forms versions when the plugin ran', () => {
    const withPlugin = completedReport([], {});
    withPlugin.run.compat = { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } };
    expect(formatGithubSummary(withPlugin)).toContain(
      '- Smart Forms: renderer 1.4.0, populate 4.7.1.\n',
    );
  });

  it('escapes text from the forms in its cell', () => {
    const finding = mappedAt(fshRange, { message: '"A | B" (a) uses <b>%x</b>.\nSecond line.' });
    expect(formatGithubSummary(completedReport([finding]))).toContain(
      '| "A \\| B" (a) uses &lt;b&gt;%x&lt;/b&gt;.<br>Second line. |',
    );
  });

  it('stops adding rows at the size limit, and says how many are in the log', () => {
    const many = Array.from({ length: 30 }, (_, n) =>
      mappedAt({ ...fshRange, line: n + 1, endLine: n + 1 }, { message: 'x'.repeat(200) }),
    );
    const summary = formatGithubSummary(completedReport(many), 4000);
    expect(Buffer.byteLength(summary)).toBeLessThanOrEqual(4000);
    const rows = summary.split('\n').filter((line) => line.startsWith('| error '));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(30);
    expect(summary).toContain(`\n${String(30 - rows.length)} more findings are in the job log.\n`);
    expect(summary.endsWith('- Linter: 0.1.0. Plugins: sdc@0.1.0.\n')).toBe(true);
  });

  it('says one more finding in the singular', () => {
    const two = [1, 2].map((line) =>
      mappedAt({ ...fshRange, line, endLine: line }, { message: 'x'.repeat(200) }),
    );
    const full = formatGithubSummary(completedReport(two));
    const limit = Buffer.byteLength(full) + 100 - 150;
    expect(formatGithubSummary(completedReport(two), limit)).toContain(
      '\n1 more finding is in the job log.\n',
    );
  });
});

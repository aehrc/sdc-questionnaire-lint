import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding, Report } from '../src/index.js';
import { docsDir, expectValidReport, readJson, semanticProblems } from './support/report.js';

const examplesDir = new URL('examples/reports/', docsDir);

const examples = readdirSync(examplesDir).filter((file) => file.endsWith('.json'));

function example(file: string): CompletedReport {
  return readJson(new URL(file, examplesDir)) as CompletedReport;
}

describe('docs/examples/reports', () => {
  it('has examples to validate', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)('%s is a valid report', (file) => {
    expectValidReport(readJson(new URL(file, examplesDir)));
  });
});

// Each case breaks one semantic rule in an otherwise valid example.
function mapped(): { report: CompletedReport; finding: QuestionnaireFinding } {
  const report = example('mapped.json');
  return { report, finding: report.findings[0] as QuestionnaireFinding };
}

const broken: [string, () => CompletedReport, string][] = [
  [
    'a severity count that does not match the findings',
    () => {
      const { report } = mapped();
      report.summary.errors = 0;
      report.summary.warnings = 1;
      return report;
    },
    'summary.errors is 0 but there are 1 error findings',
  ],
  [
    'more skipped files than read files',
    () => {
      const report = example('completed.json');
      report.summary.files.skipped = 4;
      return report;
    },
    'summary.files.skipped exceeds summary.files.read',
  ],
  [
    'no Questionnaires',
    () => {
      const report = example('completed.json');
      report.summary.questionnaires = 0;
      return report;
    },
    'summary.questionnaires is not positive',
  ],
  [
    'a negative suppression count',
    () => {
      const report = example('completed.json');
      report.summary.suppressions.notAssessed = -1;
      return report;
    },
    'summary.suppressions.notAssessed is negative',
  ],
  [
    'a stale-suppression finding that is not a warning',
    () => {
      const report = example('stale-suppression.json');
      const [finding] = report.findings;
      if (finding) finding.severity = 'error';
      report.summary.warnings = 0;
      report.summary.errors = 1;
      return report;
    },
    'findings/0: lint/stale-suppression must be a config warning',
  ],
  [
    'more stale-suppression findings than stale suppressions',
    () => {
      const report = example('stale-suppression.json');
      report.summary.suppressions.stale = 0;
      return report;
    },
    'more lint/stale-suppression findings than stale suppressions',
  ],
  [
    'a mapped range that ends before it starts',
    () => {
      const { report, finding } = mapped();
      if (finding.sourceLocation.status === 'mapped')
        finding.sourceLocation.location.endColumn = 10;
      return report;
    },
    'findings/0/sourceLocation: source range ends before it starts',
  ],
  [
    'a mapped range that ends on an earlier line',
    () => {
      const { report, finding } = mapped();
      if (finding.sourceLocation.status === 'mapped') finding.sourceLocation.location.endLine = 41;
      return report;
    },
    'findings/0/sourceLocation: source range ends before it starts',
  ],
  [
    'an expression range that ends before it starts',
    () => {
      const { report, finding } = mapped();
      finding.expression = {
        text: '%patientNmae.exists()',
        range: { startOffset: 5, endOffset: 2 },
      };
      return report;
    },
    'findings/0/expression: offset range ends before it starts',
  ],
  [
    'an expression range past the end of the text',
    () => {
      const { report, finding } = mapped();
      finding.expression = { text: '%a', range: { startOffset: 0, endOffset: 12 } };
      return report;
    },
    'findings/0/expression: offset range ends past the end of the expression text',
  ],
  [
    'a site pointer outside its resource',
    () => {
      const report = example('unmapped.json');
      const finding = report.findings[0] as QuestionnaireFinding;
      finding.jsonLocation.pointer = '/entry/1/resource/extension/0';
      return report;
    },
    'findings/0/jsonLocation: pointer /entry/1/resource/extension/0 is outside its resource at /entry/0/resource',
  ],
  [
    'a source edit that ends before it starts',
    () => {
      const { report, finding } = mapped();
      const target = finding.suggestions?.[0]?.edits[0].target;
      if (target?.kind === 'source') target.endColumn = 1;
      return report;
    },
    'findings/0/suggestions/0/edits/0: source range ends before it starts',
  ],
  [
    'a JSON-string edit that ends before it starts',
    () => {
      const report = example('unmapped.json');
      const target = report.findings[0]?.suggestions?.[0]?.edits[0].target;
      if (target?.kind === 'json-string') target.startOffset = 20;
      return report;
    },
    'findings/0/suggestions/0/edits/0: offset range ends before it starts',
  ],
  [
    'unsorted FSH sources',
    () => {
      const report = example('completed.json');
      report.summary.fshSources.reverse();
      return report;
    },
    'summary.fshSources is not sorted',
  ],
  [
    'FSH sources although lookup was omitted',
    () => {
      const report = example('completed.json');
      report.summary.fshSourceLookup = 'omitted';
      return report;
    },
    'summary.fshSources is not empty although lookup was omitted',
  ],
];

describe('semanticProblems', () => {
  it.each(broken)('rejects %s', (_name, build, problem) => {
    expect(semanticProblems(build())).toContain(problem);
  });

  it('accepts a failed report', () => {
    expect(semanticProblems(readJson(new URL('failed.json', examplesDir)) as Report)).toEqual([]);
  });
});

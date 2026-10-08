import { readFileSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding, SourceLocation } from '../../src/index.js';
import { runBinary } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

// The SUSHI-compiled project in fixtures/source-map (see its README).
const fixture = fileURLToPath(new URL('../fixtures/source-map/', import.meta.url));

function report(cwd: string, ...argv: string[]): { code: number; report: CompletedReport } {
  const result = runBinary(['lint', '--format', 'json', ...argv], { cwd });
  return { code: result.code, report: JSON.parse(result.stdout) as CompletedReport };
}

function questionnaireFindings(completed: CompletedReport): QuestionnaireFinding[] {
  return completed.findings.filter(
    (finding): finding is QuestionnaireFinding => finding.kind === 'questionnaire',
  );
}

function located(finding: QuestionnaireFinding | undefined): SourceLocation {
  if (finding?.sourceLocation.status !== 'mapped') throw new Error('the finding is not mapped');
  return finding.sourceLocation.location;
}

// The FSH text a location covers, on one line.
function sourceAt(cwd: string, { file, line, column, endColumn }: SourceLocation): string {
  const text = readFileSync(path.join(cwd, file), 'utf8').split(/\r?\n/)[line - 1] ?? '';
  return text.slice(column - 1, endColumn - 1);
}

// A copy of the fixture, changed by change, to run the CLI in.
async function copyOf(change: (dir: string) => void): Promise<string> {
  const dir = await tempTree();
  await cp(fixture, dir, { recursive: true });
  change(dir);
  return dir;
}

// Changes to a copied project: a file written, or a config naming the FSH directories.
function writing(file: string, content: string): (dir: string) => void {
  return (dir) => {
    writeFileSync(path.join(dir, file), content);
  };
}

function withFshDirectories(fsh: string[]): (dir: string) => void {
  return writing('sdc-questionnaire-lint.config.json', JSON.stringify({ source: { fsh } }));
}

describe('lint with FSH sources', () => {
  it('names the FSH file, line and column of a mapped finding, with no location line', () => {
    const { stdout, code } = runBinary(['lint'], { cwd: fixture });
    expect(code).toBe(1);
    const blocks = stdout.split('\n\n');
    const mapped = blocks.find((block) => block.startsWith('input/fsh/Mapped.fsh:31:48: '));
    expect(mapped).toBe(
      [
        'input/fsh/Mapped.fsh:31:48: error sdc/unknown-function fist() is not a FHIRPath function, so this expression fails when the form runs.',
        '  %observations.last().value.fist()',
        '                             ^~~~',
        '  help: a function with a similar name exists: first()',
      ].join('\n'),
    );
    // An unmapped finding still names the compiled JSON and the reason.
    const unmapped = blocks.find((block) => block.includes('Questionnaire/Twins; /item/1/'));
    expect(unmapped).toContain('  note: FSH line not found, the expression spans several lines');
  });

  it('sorts findings by FSH file and position', () => {
    const positions = questionnaireFindings(report(fixture).report)
      .filter(({ sourceLocation }) => sourceLocation.status === 'mapped')
      .map((finding) => located(finding))
      .map(({ file, line, column }) => [file, line, column] as const);
    const sorted = [...positions].sort(
      (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || a[1] - b[1] || a[2] - b[2],
    );
    expect(positions).toEqual(sorted);
    expect(positions.length).toBeGreaterThan(10);
  });

  it("puts a fragment's location inside its {{…}}", () => {
    const finding = questionnaireFindings(report(fixture).report).find(
      ({ ruleId }) => ruleId === 'sdc/fragment-parse-error',
    );
    const location = located(finding);
    const line =
      readFileSync(path.join(fixture, location.file), 'utf8').split('\n')[location.line - 1] ?? '';
    const before = line.slice(0, location.column - 1);
    expect(before.lastIndexOf('{{')).toBeGreaterThan(before.lastIndexOf('}}'));
    expect(line.indexOf('}}', location.column - 1)).toBeGreaterThanOrEqual(location.endColumn - 1);
  });

  it('maps a range across an escape to the escape in the FSH', () => {
    const finding = questionnaireFindings(report(fixture).report).find(
      ({ ruleId, jsonLocation }) =>
        ruleId === 'sdc/parse-error' && jsonLocation.linkId === 'smoking',
    );
    expect(sourceAt(fixture, located(finding))).toBe('\\"');
  });

  it('changes neither fingerprints nor counts', async () => {
    const omitted = await copyOf(withFshDirectories([]));
    const withSources = report(fixture).report;
    const without = report(omitted).report;
    const fingerprints = (completed: CompletedReport) =>
      completed.findings.map(({ fingerprint }) => fingerprint).sort();
    expect(fingerprints(withSources)).toEqual(fingerprints(without));
    const counts = ({ summary }: CompletedReport) => ({
      ...summary,
      config: null,
      fshSources: [],
      fshSourceLookup: null,
    });
    expect(counts(withSources)).toEqual(counts(without));
  });
});

describe('lint with missing or unusable FSH sources', () => {
  // The results for HealthCheck, which only the SUSHI index can identify.
  const healthCheck = (completed: CompletedReport) =>
    new Set(
      questionnaireFindings(completed)
        .filter(({ jsonLocation }) => jsonLocation.resource.id === 'health-check')
        .map(({ sourceLocation }) =>
          sourceLocation.status === 'mapped' ? 'mapped' : sourceLocation.reason,
        ),
    );

  it.each([
    ['a current index', () => undefined, 'mapped'],
    ['a malformed index', writing('fsh-generated/data/fsh-index.json', '{ not json'), 'not-found'],
    ['no FSH directory', withFshDirectories(['nowhere']), 'source-unavailable'],
    ['source lookup omitted', withFshDirectories([]), 'source-unavailable'],
  ])('exits 1 with %s', async (_, change, reason) => {
    const { code, report: completed } = report(await copyOf(change));
    expect(code).toBe(1);
    expect(healthCheck(completed)).toEqual(new Set([reason]));
  });
});

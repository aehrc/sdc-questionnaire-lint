import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding } from '../../src/index.js';
import { coreCases } from '../support/cases.js';
import { runBinary } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

// How the CLI maps findings to FSH when the project around them changes, on a copy of the
// compiled demo/invalid-demo case. What the case reports is checked by cases.test.ts.
const demo = 'demo/invalid-demo';

// SUSHI compiles every case once; the first run also downloads the FHIR packages.
beforeAll(coreCases.compile, 600_000);

function lintJson(cwd: string): CompletedReport {
  return JSON.parse(runBinary(['lint', '--format', 'json'], { cwd }).stdout) as CompletedReport;
}

// Each finding's FSH file and line, or the reason it has none.
function sources(report: CompletedReport): string[] {
  return (report.findings as QuestionnaireFinding[]).map(({ sourceLocation }) =>
    sourceLocation.status === 'mapped'
      ? `${sourceLocation.location.file}:${String(sourceLocation.location.line)}`
      : sourceLocation.reason,
  );
}

// A copy of the case with one file written, to run the CLI in.
async function copyWith(file: string, content: string): Promise<string> {
  const dir = await tempTree();
  coreCases.copyCase(demo, dir);
  writeFileSync(path.join(dir, file), content);
  return dir;
}

const withFshDirectories = (fsh: string[]) =>
  copyWith('sdc-questionnaire-lint.config.json', JSON.stringify({ source: { fsh } }));

// The report of the unchanged copy.
const original = async (): Promise<CompletedReport> => {
  const dir = await tempTree();
  coreCases.copyCase(demo, dir);
  return lintJson(dir);
};

describe('FSH source mapping through the CLI', () => {
  it('maps every finding with expression text to its FSH line', async () => {
    const lines = sources(await original());
    expect(lines.filter((line) => line.startsWith('input/fsh/'))).toHaveLength(14);
    expect(lines.filter((line) => !line.startsWith('input/fsh/'))).toEqual(['not-found']);
  });

  it('maps through search when the SUSHI index is malformed', async () => {
    const dir = await copyWith('fsh-generated/data/fsh-index.json', '{ not json');
    expect(sources(lintJson(dir))).toEqual(sources(await original()));
  });

  it('changes neither fingerprints nor counts when FSH source lookup is omitted', async () => {
    const withSources = await original();
    const without = lintJson(await withFshDirectories([]));
    expect(new Set(sources(without))).toEqual(new Set(['source-unavailable']));
    const fingerprints = ({ findings }: CompletedReport) =>
      findings.map(({ fingerprint }) => fingerprint).sort();
    expect(fingerprints(without)).toEqual(fingerprints(withSources));
    const counts = ({ summary }: CompletedReport) => ({
      ...summary,
      config: null,
      fshSources: [],
      fshSourceLookup: null,
    });
    expect(counts(without)).toEqual(counts(withSources));
  });

  it('leaves findings source-unavailable when no FSH directory exists, and exits 1', async () => {
    const result = runBinary(['lint', '--format', 'json'], {
      cwd: await withFshDirectories(['nowhere']),
    });
    expect(result.code).toBe(1);
    expect(new Set(sources(JSON.parse(result.stdout) as CompletedReport))).toEqual(
      new Set(['source-unavailable']),
    );
  });
});

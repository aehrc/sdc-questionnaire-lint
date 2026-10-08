import { readFileSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding } from '../src/index.js';
import { runBinary } from './support/cli.js';
import { tempTree } from './support/tmp.js';

// The examples/ folders document what the linter reports; keep them true. health-check is also
// the end-to-end test of FSH source mapping through the CLI; every mapping case is a row of the
// SUSHI-compiled fixture instead (source/fixtures.test.ts).
const healthCheck = fileURLToPath(new URL('../../../examples/health-check/', import.meta.url));

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

// A copy of the example with one file written, to run the CLI in.
async function copyWith(file: string, content: string): Promise<string> {
  const dir = await tempTree();
  await cp(healthCheck, dir, { recursive: true });
  writeFileSync(path.join(dir, file), content);
  return dir;
}

const withFshDirectories = (fsh: string[]) =>
  copyWith('sdc-questionnaire-lint.config.json', JSON.stringify({ source: { fsh } }));

describe('examples/health-check', () => {
  it('prints the text output shown in its README, and exits 1', () => {
    const readme = readFileSync(`${healthCheck}README.md`, 'utf8');
    const shown = /`npx sdc-lint lint`:\n\n```text\n([\s\S]*?)```/.exec(readme)?.[1];
    // Versions change with every release; the README shows them only as an illustration.
    const withoutVersions = (text: string | undefined) => text?.replace(/\d+\.\d+\.\d+/g, 'x.y.z');
    const result = runBinary(['lint'], { cwd: healthCheck });
    expect(withoutVersions(result.stdout)).toBe(withoutVersions(shown));
    expect(result.code).toBe(1);
  });

  it('reports the info finding the text output hides at its FSH line', () => {
    const report = lintJson(healthCheck);
    const info = report.findings.filter(({ severity }) => severity === 'info');
    expect(info.map(({ ruleId }) => ruleId)).toEqual(['sdc/uncatalogued-expression']);
    expect(sources({ ...report, findings: info })).toEqual(['input/fsh/HealthCheck.fsh:75']);
  });

  it('maps through search when the SUSHI index is malformed', async () => {
    const dir = await copyWith('fsh-generated/data/fsh-index.json', '{ not json');
    expect(sources(lintJson(dir))).toEqual(sources(lintJson(healthCheck)));
  });

  it('changes neither fingerprints nor counts when FSH source lookup is omitted', async () => {
    const withSources = lintJson(healthCheck);
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

  it('leaves findings source-unavailable when no FSH directory exists', async () => {
    const report = lintJson(await withFshDirectories(['nowhere']));
    expect(new Set(sources(report))).toEqual(new Set(['source-unavailable']));
  });
});

import { writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding } from '../../src/index.js';
import { runBinary } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

// Two SUSHI projects, compiled by SUSHI 3.20.1 with hl7.fhir.uv.sdc#4.0.0: fsh-valid has no
// mistakes, and fsh-invalid has the same expressions with one mistake each, one per error rule.
// To regenerate, run `sushi .` in the project and delete fsh-generated/fsh-index.txt. Every
// mapping case is a row of the in-process fixture instead (source/fixtures.test.ts).
const valid = fileURLToPath(new URL('../fixtures/cli/fsh-valid/', import.meta.url));
const invalid = fileURLToPath(new URL('../fixtures/cli/fsh-invalid/', import.meta.url));

// The FSH line of each finding in fsh-invalid, in report order.
const invalidLines = [12, 17, 22, 34, 51].map((line) => `input/fsh/Invalid.fsh:${String(line)}`);

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

// A copy of fsh-invalid with one file written, to run the CLI in.
async function copyWith(file: string, content: string): Promise<string> {
  const dir = await tempTree();
  await cp(invalid, dir, { recursive: true });
  writeFileSync(path.join(dir, file), content);
  return dir;
}

const withFshDirectories = (fsh: string[]) =>
  copyWith('sdc-questionnaire-lint.config.json', JSON.stringify({ source: { fsh } }));

describe('lint a valid FSH project', () => {
  it('exits 0 with no findings', () => {
    const result = runBinary(['lint', '--format', 'json'], { cwd: valid });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as CompletedReport;
    expect(report.findings).toEqual([]);
    expect(report.summary.fshSources).toEqual(['input/fsh']);
  });
});

describe('lint an invalid FSH project', () => {
  it('reports each error rule at its FSH line and column, with no location line, and exits 1', () => {
    const result = runBinary(['lint'], { cwd: invalid });
    expect(result.code).toBe(1);
    // The finding blocks, without the summary.
    expect(result.stdout.split('\n\n').slice(0, -1)).toEqual([
      [
        "input/fsh/Invalid.fsh:12:19: error sdc/query-syntax This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills stay empty.",
        '  %patient.id',
        '  help: set the language to text/fhirpath; this expression is FHIRPath',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:17:81: error sdc/fragment-parse-error A closing ) is missing.',
        '  Observation?patient={{%patient.id}}&date=ge{{(today() - 1 year}}',
        '                                                                ^',
        "  note: the FHIRPath parser reported: missing ')' at '<EOF>'",
        '  help: add ) at the end of the expression',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:22:66: error sdc/unknown-function fist() is not a FHIRPath function, so this expression fails when the form runs.',
        "  %resource.item.where(linkId = 'smoker').answer.fist().value",
        '                                                 ^~~~',
        '  help: a function with a similar name exists: first()',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:34:39: error sdc/parse-error The expression ends before it is complete.',
        '  %smoker = true and',
        '                    ^',
        "  note: the FHIRPath parser reported: mismatched input '<EOF>'",
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:51:21: error sdc/undefined-variable %recnet is not available on item "Observations in the last year" (recent-records).',
        '  %recnet.total',
        '  ^~~~~~~',
        '  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it',
      ].join('\n'),
    ]);
  });

  it('reports the FSH lines in JSON', () => {
    expect(sources(lintJson(invalid))).toEqual(invalidLines);
  });

  it('maps through search when the SUSHI index is malformed', async () => {
    const dir = await copyWith('fsh-generated/data/fsh-index.json', '{ not json');
    expect(sources(lintJson(dir))).toEqual(invalidLines);
  });

  it('changes neither fingerprints nor counts when FSH source lookup is omitted', async () => {
    const withSources = lintJson(invalid);
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

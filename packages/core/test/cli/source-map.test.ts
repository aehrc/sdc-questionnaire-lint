import { writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding } from '../../src/index.js';
import { runBinary } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

// Two SUSHI projects, compiled by SUSHI 3.20.1 with hl7.fhir.uv.sdc#4.0.0: fsh-valid has no
// mistakes, and fsh-invalid has one mistake for each sdc rule, which fsh-valid corrects.
// To regenerate, run `sushi .` in the project and delete fsh-generated/fsh-index.txt. Every
// mapping case is a row of the in-process fixture instead (source/fixtures.test.ts).
const valid = fileURLToPath(new URL('../fixtures/cli/fsh-valid/', import.meta.url));
const invalid = fileURLToPath(new URL('../fixtures/cli/fsh-invalid/', import.meta.url));

// The FSH line of each finding in fsh-invalid, in report order. The sdc/external-expression finding
// comes first and has no FSH line, because its expression has no text.
const invalidLines = [
  'not-found',
  ...[12, 17, 22, 27, 36, 45, 50, 62, 70, 103, 112, 117, 137, 147].map(
    (line) => `input/fsh/Invalid.fsh:${String(line)}`,
  ),
];

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
  it('reports each rule at its FSH line and column, or its compiled JSON location, and exits 1', () => {
    const result = runBinary(['lint', '--show-info'], { cwd: invalid });
    expect(result.code).toBe(1);
    // The finding blocks, without the summary.
    expect(result.stdout.split('\n\n').slice(0, -1)).toEqual([
      [
        'fsh-generated/resources/Questionnaire-Invalid.json: info sdc/external-expression This expression has no text, only the reference http://example.org/Library/cessation-advice, so it was not checked.',
        '  location: compiled JSON; Questionnaire/Invalid; /item/8/extension/0/valueExpression',
        '  note: FSH line not found, the expression was not found in the FSH sources',
      ].join('\n'),
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
        "input/fsh/Invalid.fsh:27:49: warning sdc/unresolved-linkid No item in this Questionnaire has linkId 'pack'.",
        "  %resource.item.where(linkId = 'pack').answer.value",
        '                                ^~~~~~',
        "  help: an item with a similar linkId exists: 'packs'",
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:36:19: warning sdc/dependency-cycle Declarations %packYears and %smokingYears reference each other; updates may not reach a stable value.',
        '  %packs * %smokingYears',
        '  related: /extension/7/valueExpression/expression: %smokingYears is declared here',
        '  help: Break the dependency cycle or verify that these expressions reach stable values in the form filler.',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:45:19: error sdc/duplicate-declaration The name %yearsSmoked is declared more than once on the Questionnaire root, so it is unclear which value expressions that use it get.',
        "  %resource.item.where(linkId = 'years').answer.value.first()",
        '  related: /extension/5/valueExpression/expression: %yearsSmoked is also declared here',
        '  help: rename or remove one of the declarations of %yearsSmoked',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:50:19: error sdc/reserved-name The name %context is defined by FHIRPath, so a form cannot declare it; it is unclear which value expressions that use it get.',
        "  %resource.item.where(linkId = 'smoker')",
        '  help: rename the declaration, and the expressions that should use it',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:62:39: error sdc/parse-error The expression ends before it is complete.',
        '  %smoker = true and',
        '                    ^',
        "  note: the FHIRPath parser reported: mismatched input '<EOF>'",
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:70:21: error sdc/language-not-allowed This enableWhenExpression is written in text/x-fhir-query, but SDC allows only FHIRPath or CQL here, so the form may ignore it.',
        '  Observation?patient={{%patient.id}}&code=72166-2',
        '  help: rewrite the expression in FHIRPath, with the language text/fhirpath, or in CQL, with text/cql',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:103:21: error sdc/undefined-variable %recnet is not available on item "Observations in the last year" (recent-records).',
        '  %recnet.total',
        '  ^~~~~~~',
        '  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:112:21: warning sdc/unused-declaration %quitDate is declared on item "Date you stopped smoking" (cessation), but no expression references it, so its value is never used.',
        "  %resource.item.where(linkId = 'cessation').answer.value",
        '  help: remove the variable, or reference %quitDate where its value is needed',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:117:21: info sdc/shadowed-declaration The name %smoker on item "Date you stopped smoking" (cessation) is also declared on the Questionnaire root, so other expressions on item "Date you stopped smoking" (cessation) and its descendant items get this declaration\'s value.',
        "  %resource.item.where(linkId = 'smoker').answer.value.first()",
        '  related: /extension/3/valueExpression/expression: %smoker is also declared here',
        '  help: rename one of the declarations of %smoker, unless this item should override it',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:137:21: warning sdc/language-not-in-value-set The language text/fhir-path is not one FHIR defines, so the form may ignore this expression.',
        "  'No notes'",
        '  help: set the language to text/fhirpath',
      ].join('\n'),
      [
        'input/fsh/Invalid.fsh:147:21: info sdc/uncatalogued-expression This expression is in a place the linter does not recognise, so only its FHIRPath syntax and function names can be checked.',
        "  iif(%smoker, 'Smoker', 'Non-smoker')",
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

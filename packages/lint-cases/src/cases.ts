import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import type {
  CompletedReport,
  ExpressionExcerpt,
  Finding,
  LintOptions,
  LintPlugin,
  QuestionnaireLocation,
  Severity,
  Suggestion,
} from 'sdc-questionnaire-lint';
import { lintConfigFile } from './generate-fsh.js';
import { compileLintCases, readLintCases, type LintCase } from './project.js';

export type { LintCase } from './project.js';

// A lint case is a YAML config, test/cases/<group>/<case>.yaml, beside the findings the linter
// must report for it, <case>.expected.yaml. Every case of a package is compiled into one SUSHI
// project (project.ts), so SUSHI runs once per change to the cases, not once per case.

export interface LintCasesOptions {
  // The package's test/cases/ directory: new URL('../cases/', import.meta.url).
  casesDirectory: URL;
  // The linter under test: core's lint from its source, a plugin's from the built core.
  lint: (options: LintOptions) => Promise<CompletedReport>;
  // Files whose default export is a plugin; every case's linter config lists them.
  plugins?: URL[];
}

export interface LintCases {
  // Every case, in name order.
  cases: LintCase[];
  // The compiled project of every case.
  compile: () => string;
  // Lints the compiled Questionnaire of the case and compares the findings with its expected file;
  // npx vitest run -u writes that file. Returns the findings.
  lintCase: (lintCase: LintCase) => Promise<CaseFinding[]>;
  // Copies a case's compiled files (its FSH, its Questionnaire and the SUSHI index) into to, for
  // tests that change the project around it. name is <group>/<case>.
  copyCase: (name: string, to: string) => void;
}

// A finding as a case expects it: no fingerprint or docs URL, and each location as one string, the
// FSH file, line and column, or the JSON pointer and why it has no FSH line.
export interface CaseFinding {
  ruleId: string;
  severity: Severity;
  at: string;
  message: string;
  help?: string;
  note?: string;
  expression?: ExpressionExcerpt;
  related?: { at: string; message?: string }[];
  suggestions?: Suggestion[];
}

function place({ jsonLocation, sourceLocation }: QuestionnaireLocation): string {
  if (sourceLocation.status === 'unmapped') {
    return `${jsonLocation.pointer} (${sourceLocation.reason})`;
  }
  const { file, line, column } = sourceLocation.location;
  return `${file}:${String(line)}:${String(column)}`;
}

export function caseFinding(finding: Finding): CaseFinding {
  if (finding.kind !== 'questionnaire') throw new Error(`unexpected ${finding.ruleId} finding`);
  const { ruleId, severity, message, help, note, expression, relatedLocations, suggestions } =
    finding;
  return {
    ruleId,
    severity,
    at: place(finding),
    message,
    ...(help === undefined ? {} : { help }),
    ...(note === undefined ? {} : { note }),
    ...(expression === undefined ? {} : { expression }),
    ...(relatedLocations === undefined
      ? {}
      : {
          related: relatedLocations.map((related) => {
            if (related.kind !== 'questionnaire') throw new Error('unexpected config location');
            return {
              at: place(related),
              ...(related.message === undefined ? {} : { message: related.message }),
            };
          }),
        }),
    ...(suggestions === undefined ? {} : { suggestions }),
  };
}

// The findings as an expected file holds them: lines are never folded, so each message stays on one
// line, and quotes are single, as Prettier writes them.
export function formatFindings(findings: CaseFinding[]): string {
  return stringify(findings, { lineWidth: 0, singleQuote: true });
}

export function lintCases(options: LintCasesOptions): LintCases {
  const casesDirectory = fileURLToPath(options.casesDirectory);
  const plugins = (options.plugins ?? []).map((plugin) => fileURLToPath(plugin));
  const cases = readLintCases(casesDirectory);

  let compiled: string | undefined;

  function compile(): string {
    compiled ??= compileLintCases(casesDirectory, cases, plugins);
    return compiled;
  }

  async function lintCase({ config, expectedPath }: LintCase): Promise<CaseFinding[]> {
    const lintConfig = lintConfigFile(config, plugins);
    const report = await options.lint({
      cwd: compile(),
      paths: [`fsh-generated/resources/Questionnaire-${config.instance}.json`],
      ...(lintConfig === undefined ? {} : { configPath: lintConfig }),
    });
    const findings = report.findings.map(caseFinding);
    await expect(formatFindings(findings)).toMatchFileSnapshot(expectedPath);
    return findings;
  }

  function copyCase(name: string, to: string): void {
    const project = compile();
    const instance = name.split('/').join('-');
    for (const file of [
      'sushi-config.yaml',
      `input/fsh/${instance}.fsh`,
      `fsh-generated/resources/Questionnaire-${instance}.json`,
      'fsh-generated/data/fsh-index.json',
    ]) {
      mkdirSync(path.dirname(path.join(to, file)), { recursive: true });
      copyFileSync(path.join(project, file), path.join(to, file));
    }
  }

  return { cases, compile, lintCase, copyCase };
}

// Registers a test per case, then one that fails when a rule of plugin has no case whose expected
// findings include it, so a new rule cannot land without a case. Run
// `npx vitest run -u <cases directory>` to write the expected files, then review them.
export function testLintCases({ cases, compile, lintCase }: LintCases, plugin: LintPlugin): void {
  const reported = new Set<string>();

  // SUSHI compiles every case once; the first run also downloads the FHIR packages.
  beforeAll(compile, 600_000);

  describe('lint cases', () => {
    it.each(cases)('$name', async (testCase) => {
      for (const { ruleId } of await lintCase(testCase)) reported.add(ruleId);
    });

    // Runs after the cases above.
    it(`cover every ${plugin.meta.name} rule`, () => {
      expect(
        Object.keys(plugin.rules)
          .map((name) => `${plugin.meta.name}/${name}`)
          .filter((ruleId) => !reported.has(ruleId)),
        'add a case whose expected findings include the rule',
      ).toEqual([]);
    });
  });
}

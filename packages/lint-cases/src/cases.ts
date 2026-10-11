import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
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
import { generateProject, lintConfigFile, readFshConfig, type FshConfig } from './generate-fsh.js';

// A lint case is a YAML config, test/cases/<group>/<case>.yaml, beside the findings the linter
// must report for it, <case>.expected.yaml. Every case of a package is compiled into one SUSHI
// project, so SUSHI runs once per change to the cases, not once per case.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const generator = fileURLToPath(new URL('generate-fsh.ts', import.meta.url));
// Outside node_modules, so Vitest transforms the .mjs linter configs and the plugin sources they
// import; Node would import them as they are, and cannot load TypeScript that imports ./x.js.
const cacheRoot = path.join(repoRoot, '.cache', 'lint-cases');

export interface LintCasesOptions {
  // The package's test/cases/ directory: new URL('../cases/', import.meta.url).
  casesDirectory: URL;
  // The linter under test: core's lint from its source, a plugin's from the built core.
  lint: (options: LintOptions) => Promise<CompletedReport>;
  // Files whose default export is a plugin; every case's linter config lists them.
  plugins?: URL[];
}

export interface LintCase {
  // <group>/<case>, the test name.
  name: string;
  configPath: string;
  expectedPath: string;
  config: FshConfig;
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

function sushiEntry(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('fsh-sushi/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: { sushi: string } };
  return path.join(path.dirname(manifest), bin.sushi);
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
  // Each package's projects in their own folder, so removing old ones leaves the others.
  const cacheDirectory = path.join(
    cacheRoot,
    path.relative(repoRoot, casesDirectory).split(path.sep).join('-'),
  );

  // The case of a config file; its instance is <group>-<case>.
  function lintCaseOf(configPath: string): LintCase {
    const name = path.relative(casesDirectory, configPath).replace(/\.yaml$/, '');
    const segments = name.split(path.sep);
    return {
      name: segments.join('/'),
      configPath,
      expectedPath: configPath.replace(/\.yaml$/, '.expected.yaml'),
      config: readFshConfig(configPath, segments.join('-')),
    };
  }

  const cases = readdirSync(casesDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.yaml') && !file.endsWith('.expected.yaml'))
    .sort()
    .map((file) => lintCaseOf(path.join(casesDirectory, file)));

  let compiled: string | undefined;

  // Built in a folder named after a hash of the cases, the plugins and the generator, and renamed
  // into place only once SUSHI succeeds, so test files compiling at the same time cannot see a
  // half-built project, and an unchanged run reuses it.
  function compile(): string {
    if (compiled !== undefined) return compiled;
    const hash = createHash('sha256').update(readFileSync(generator));
    for (const plugin of plugins) hash.update(plugin);
    for (const { name, configPath } of cases) hash.update(name).update(readFileSync(configPath));
    const key = hash.digest('hex').slice(0, 16);
    const project = path.join(cacheDirectory, key);
    if (!existsSync(project)) {
      const building = `${project}.${String(process.pid)}.tmp`;
      generateProject(
        cases.map(({ config }) => config),
        building,
        plugins,
      );
      const sushi = spawnSync(process.execPath, [sushiEntry(), '.'], {
        cwd: building,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
      if (sushi.status !== 0) {
        rmSync(building, { recursive: true, force: true });
        // SUSHI's output is long; its errors, with their file and line, are what matter.
        const errors = sushi.stdout
          .split('\n')
          .filter((line) => /^(error|\s+(File|Line):)/.test(line));
        throw new Error(`SUSHI could not compile the lint cases:\n${errors.join('\n')}`);
      }
      // Projects of older cases are no longer needed.
      for (const entry of readdirSync(cacheDirectory)) {
        if (!entry.startsWith(key)) rmSync(path.join(cacheDirectory, entry), { recursive: true });
      }
      try {
        renameSync(building, project);
      } catch {
        // Another test file finished the same project first.
        rmSync(building, { recursive: true, force: true });
      }
    }
    compiled = project;
    return project;
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

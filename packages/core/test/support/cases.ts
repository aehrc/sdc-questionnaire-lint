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
import { expect } from 'vitest';
import { stringify } from 'yaml';
import {
  generateProject,
  lintConfigFile,
  readFshConfig,
  type FshConfig,
} from '../../scripts/generate-fsh.js';
import {
  lint,
  type ExpressionExcerpt,
  type Finding,
  type QuestionnaireLocation,
  type Severity,
  type Suggestion,
} from '../../src/index.js';

// A lint case is a YAML config, test/cases/<group>/<case>.yaml, beside the findings the linter
// must report for it, <case>.expected.yaml. Every case is compiled into one SUSHI project, so
// SUSHI runs once per change to the cases, not once per case.
export const casesDirectory = fileURLToPath(new URL('../cases/', import.meta.url));
const generator = fileURLToPath(new URL('../../scripts/generate-fsh.ts', import.meta.url));
const cacheDirectory = fileURLToPath(
  new URL('../../../../node_modules/.cache/sdc-cases/', import.meta.url),
);

export interface LintCase {
  // <group>/<case>, the test name.
  name: string;
  configPath: string;
  expectedPath: string;
  config: FshConfig;
}

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

export function lintCases(): LintCase[] {
  return readdirSync(casesDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.yaml') && !file.endsWith('.expected.yaml'))
    .sort()
    .map((file) => lintCaseOf(path.join(casesDirectory, file)));
}

function sushiEntry(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('fsh-sushi/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: { sushi: string } };
  return path.join(path.dirname(manifest), bin.sushi);
}

let compiled: string | undefined;

// The compiled project of every case. It is built in a folder named after a hash of the cases and
// the generator, and renamed into place only once SUSHI succeeds, so test files compiling at the
// same time cannot see a half-built project, and an unchanged run reuses it.
export function compileCases(): string {
  if (compiled !== undefined) return compiled;
  const cases = lintCases();
  const hash = createHash('sha256').update(readFileSync(generator));
  for (const { name, configPath } of cases) hash.update(name).update(readFileSync(configPath));
  const key = hash.digest('hex').slice(0, 16);
  const project = path.join(cacheDirectory, key);
  if (!existsSync(project)) {
    const building = `${project}.${String(process.pid)}.tmp`;
    generateProject(
      cases.map(({ config }) => config),
      building,
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

// Lints the compiled Questionnaire of the case at configPath and compares the findings with the
// YAML at expectedPath; npx vitest run -u writes that file. Returns the findings.
export async function lintCase(configPath: string, expectedPath: string): Promise<CaseFinding[]> {
  const { config } = lintCaseOf(configPath);
  const lintConfig = lintConfigFile(config);
  const report = await lint({
    cwd: compileCases(),
    paths: [`fsh-generated/resources/Questionnaire-${config.instance}.json`],
    ...(lintConfig === undefined ? {} : { configPath: lintConfig }),
  });
  const findings = report.findings.map(caseFinding);
  await expect(formatFindings(findings)).toMatchFileSnapshot(expectedPath);
  return findings;
}

// Copies a case's compiled files (its FSH, its Questionnaire and the SUSHI index) into to, for
// tests that change the project around it. name is <group>/<case>.
export function copyCase(name: string, to: string): void {
  const project = compileCases();
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

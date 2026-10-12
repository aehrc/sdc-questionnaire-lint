// Generates a SUSHI project from one lint case config, then compiles and lints it with example.ts,
// to try a form by hand. Run from the repository root:
//   npm run demo                                    test/cases/demo/invalid-demo.yaml into demo/invalid-demo
//   npm run demo -- path/to/config.yaml             another config, into demo/<instance>
//   npm run demo -- path/to/config.yaml --out dir   another output folder
//   npm run demo -- path/to/config.yaml --smart-forms
//                                                   also lint with the Smart Forms plugin
//   npm run demo -- --format github                 GitHub annotations on the terminal, and the job
//                                                   summary in demo/<instance>/github-step-summary.md
//                                                   (npm run demo:github)
//   npm run demo -- --format sarif                  the report in demo/<instance>/lint.sarif, to open
//                                                   in a SARIF viewer (npm run demo:sarif)
//   npm run demo -- --format json                   the report in demo/<instance>/lint-report.json
// The config format is described in packages/lint-cases/src/generate-fsh.ts.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  generateProject,
  lintConfigFile,
  readFshConfig,
  type FshConfig,
} from '@sdc-questionnaire-lint/lint-cases/generate-fsh';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const example = fileURLToPath(new URL('example.ts', import.meta.url));
const smartFormsPlugin = fileURLToPath(
  new URL('../../plugin-smart-forms/dist/index.js', import.meta.url),
);

let config: FshConfig;
let project: string;
let plugins: string[];
let format: string | undefined;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      'smart-forms': { type: 'boolean' },
      format: { type: 'string' },
    },
  });
  plugins = values['smart-forms'] === true ? [smartFormsPlugin] : [];
  format = values.format;
  config = readFshConfig(
    positionals[0] ??
      fileURLToPath(new URL('../test/cases/demo/invalid-demo.yaml', import.meta.url)),
  );
  project = path.resolve(values.out ?? path.join(repoRoot, 'demo', config.instance));
  generateProject([config], project, plugins);
} catch (error) {
  console.error(`error: ${(error as Error).message}`);
  process.exit(2);
}
if (plugins.length > 0) {
  // npm run demo builds core only; the generated config imports the plugin's build. Through a
  // shell, because npm is npm.cmd on Windows.
  execSync('npm run build --workspace @sdc-questionnaire-lint/plugin-smart-forms', {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
const shown = (file: string): string => path.relative(process.cwd(), file) || '.';
console.log(`Generated ${shown(project)}`);

// Outside GitHub Actions, the github format's job summary goes to a file in the project, written
// afresh on each run; inside Actions it goes to the job's own summary.
const env = { ...process.env };
let summary: string | undefined;
if (format === 'github' && !env.GITHUB_STEP_SUMMARY) {
  summary = path.join(project, 'github-step-summary.md');
  rmSync(summary, { force: true });
  env.GITHUB_STEP_SUMMARY = summary;
}
// A machine-readable report is saved in the project rather than printed.
const reportFiles: Partial<Record<string, string>> = {
  json: 'lint-report.json',
  sarif: 'lint.sarif',
};
const reportFile = format === undefined ? undefined : reportFiles[format];
const report = reportFile === undefined ? undefined : path.join(project, reportFile);
// A report left from an earlier run would look current when SUSHI fails and nothing is linted.
if (report !== undefined) rmSync(report, { force: true });

// example.ts compiles the project with SUSHI and prints the report.
const lintConfig = lintConfigFile(config, plugins);
const run = spawnSync(
  process.execPath,
  [
    example,
    project,
    '--show-info',
    ...(format === undefined ? [] : ['--format', format]),
    ...(lintConfig === undefined ? [] : ['--config', lintConfig]),
  ],
  {
    stdio: ['inherit', report === undefined ? 'inherit' : 'pipe', 'inherit'],
    env,
    encoding: 'utf8',
  },
);
// A failed run's SARIF or JSON describes the failure, so it is saved too.
if (report !== undefined && run.stdout) {
  writeFileSync(report, run.stdout);
  console.log(`Report: ${shown(report)}`);
}
if (summary !== undefined && existsSync(summary)) console.log(`Job summary: ${shown(summary)}`);
process.exitCode = run.status ?? 2;

// Generates a SUSHI project from one lint case config, then compiles and lints it with example.ts,
// to try a form by hand. Run from the repository root:
//   npm run demo                                    test/cases/demo/invalid-demo.yaml into demo/invalid-demo
//   npm run demo -- path/to/config.yaml             another config, into demo/<instance>
//   npm run demo -- path/to/config.yaml --out dir   another output folder
//   npm run demo -- path/to/config.yaml --smart-forms
//                                                   also lint with the Smart Forms plugin
// The config format is described in packages/lint-cases/src/generate-fsh.ts.
import { execSync, spawnSync } from 'node:child_process';
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
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, 'smart-forms': { type: 'boolean' } },
  });
  plugins = values['smart-forms'] === true ? [smartFormsPlugin] : [];
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
console.log(`Generated ${path.relative(process.cwd(), project) || '.'}`);

// example.ts compiles the project with SUSHI and prints the text report.
const lintConfig = lintConfigFile(config, plugins);
const run = spawnSync(
  process.execPath,
  [example, project, '--show-info', ...(lintConfig === undefined ? [] : ['--config', lintConfig])],
  { stdio: 'inherit' },
);
process.exitCode = run.status ?? 2;

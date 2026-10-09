// Compiles an FSH example with SUSHI, then lints it with the built CLI, so findings always come from
// the current FSH. Run from the repository root:
//   npm run example -- invalid                   test/fixtures/cli/fsh-invalid
//   npm run example -- valid --format json       fsh-valid, with lint flags after the name
//   npm run example -- path/to/sushi-project     any directory with a sushi-config.yaml
// SUSHI must be on the PATH (npm install -g fsh-sushi@3.20.1).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const fixtures = fileURLToPath(new URL('../test/fixtures/cli/', import.meta.url));
// The version the committed fixtures were compiled with (test/cli/source-map.test.ts).
const sushiVersion = '3.20.1';

// A fixture name such as invalid, or a directory.
function projectDirectory(name: string): string {
  const fixture = path.join(fixtures, `fsh-${name}`);
  return existsSync(fixture) ? fixture : path.resolve(name);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

const [name, ...lintArgs] = process.argv.slice(2);
if (name === undefined) fail('name an example: valid, invalid, or a SUSHI project directory');
const project = projectDirectory(name);
if (!existsSync(path.join(project, 'sushi-config.yaml'))) {
  fail(`${project} has no sushi-config.yaml`);
}

const version = spawnSync('sushi', ['--version'], { encoding: 'utf8' });
if (version.error !== undefined) {
  fail(
    `cannot run sushi (${version.error.message}); install it with npm install -g fsh-sushi@${sushiVersion}`,
  );
}
if (!version.stdout.includes(`v${sushiVersion} `)) {
  console.error(
    `warning: the fixtures are compiled with SUSHI ${sushiVersion}; this is ${version.stdout.trim()}`,
  );
}

// SUSHI's output is long; it is shown only when the build fails.
const build = spawnSync('sushi', ['.'], { cwd: project, encoding: 'utf8' });
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  fail(`SUSHI could not compile ${project}`);
}
// Not committed with the fixtures; fsh-index.json carries the same entries.
rmSync(path.join(project, 'fsh-generated', 'fsh-index.txt'), { force: true });

const lint = spawnSync(process.execPath, [cli, 'lint', ...lintArgs], {
  cwd: project,
  stdio: 'inherit',
});
process.exitCode = lint.status ?? 2;

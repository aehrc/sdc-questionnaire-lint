// Compiles a SUSHI project, then lints it with the built CLI, so findings always come from the
// current FSH. Run from the repository root:
//   npm run example -- path/to/sushi-project                 any directory with a sushi-config.yaml
//   npm run example -- path/to/sushi-project --format json   with lint flags after the directory
// npm run puts the fsh-sushi dev dependency on the PATH; npm run demo generates a project to try.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
// The fsh-sushi dev dependency's version, which compiles the lint cases (test/support/cases.ts).
const sushiVersion = '3.20.1';

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

const [name, ...lintArgs] = process.argv.slice(2);
if (name === undefined) fail('name a SUSHI project directory');
const project = path.resolve(name);
if (!existsSync(path.join(project, 'sushi-config.yaml'))) {
  fail(`${project} has no sushi-config.yaml`);
}

const version = spawnSync('sushi', ['--version'], { encoding: 'utf8' });
if (version.error !== undefined) {
  fail(
    `cannot run sushi (${version.error.message}); run it through npm run, or npm ci to install fsh-sushi@${sushiVersion}`,
  );
}
if (!version.stdout.includes(`v${sushiVersion} `)) {
  console.error(
    `warning: the lint cases are compiled with SUSHI ${sushiVersion}; this is ${version.stdout.trim()}`,
  );
}

// SUSHI's output is long; it is shown only when the build fails.
const build = spawnSync('sushi', ['.'], { cwd: project, encoding: 'utf8' });
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  fail(`SUSHI could not compile ${project}`);
}
// fsh-index.json carries the same entries.
rmSync(path.join(project, 'fsh-generated', 'fsh-index.txt'), { force: true });

const lint = spawnSync(process.execPath, [cli, 'lint', ...lintArgs], {
  cwd: project,
  stdio: 'inherit',
});
process.exitCode = lint.status ?? 2;

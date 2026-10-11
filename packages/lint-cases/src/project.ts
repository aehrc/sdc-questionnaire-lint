import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProject, readFshConfig, type FshConfig } from './generate-fsh.js';

// Reads a package's lint cases and compiles them into one SUSHI project. The case tests (cases.ts)
// and the documentation site's rules library (docs/.vitepress/rules.ts) share it, and so share the
// compiled project. It does not import Vitest, so the site can load it.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const generator = fileURLToPath(new URL('generate-fsh.ts', import.meta.url));
// Outside node_modules, so Vitest transforms the .mjs linter configs and the plugin sources they
// import; Node would import them as they are, and cannot load TypeScript that imports ./x.js.
const cacheRoot = path.join(repoRoot, '.cache', 'lint-cases');

export interface LintCase {
  // <group>/<case>, the test name.
  name: string;
  configPath: string;
  expectedPath: string;
  config: FshConfig;
}

// Every case in casesDirectory, test/cases/<group>/<case>.yaml, in name order; a case's instance is
// <group>-<case>.
export function readLintCases(casesDirectory: string): LintCase[] {
  return readdirSync(casesDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.yaml') && !file.endsWith('.expected.yaml'))
    .sort()
    .map((file) => {
      const configPath = path.join(casesDirectory, file);
      const segments = file.replace(/\.yaml$/, '').split(path.sep);
      return {
        name: segments.join('/'),
        configPath,
        expectedPath: configPath.replace(/\.yaml$/, '.expected.yaml'),
        config: readFshConfig(configPath, segments.join('-')),
      };
    });
}

function sushiEntry(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('fsh-sushi/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: { sushi: string } };
  return path.join(path.dirname(manifest), bin.sushi);
}

// Compiles the cases of casesDirectory into one SUSHI project, whose linter configs list plugins,
// the files whose default exports are plugins, and returns the project's directory. The project
// is built in a folder named after a hash of the cases, the plugins and the generator, and renamed
// into place only once SUSHI succeeds, so test files compiling at the same time cannot see a
// half-built project, and an unchanged run reuses it.
export function compileLintCases(
  casesDirectory: string,
  cases: readonly LintCase[],
  plugins: readonly string[] = [],
): string {
  // Each package's projects in their own folder, so removing old ones leaves the others.
  const cacheDirectory = path.join(
    cacheRoot,
    path.relative(repoRoot, casesDirectory).split(path.sep).join('-'),
  );
  const hash = createHash('sha256').update(readFileSync(generator));
  for (const plugin of plugins) hash.update(plugin);
  for (const { name, configPath } of cases) hash.update(name).update(readFileSync(configPath));
  const key = hash.digest('hex').slice(0, 16);
  const project = path.join(cacheDirectory, key);
  if (existsSync(project)) return project;
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
    const errors = sushi.stdout.split('\n').filter((line) => /^(error|\s+(File|Line):)/.test(line));
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
  return project;
}

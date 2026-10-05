import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Deprecated smoke test: checks that the test setup builds and runs the CLI. Remove once real CLI tests exist.
it('prints the package version', () => {
  expect(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' })).toBe(
    `${pkg.version}\n`,
  );
});

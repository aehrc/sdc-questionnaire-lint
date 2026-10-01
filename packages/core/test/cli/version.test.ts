import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { runBinary, runInProcess } from '../support/cli.js';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

it('prints the package version', () => {
  expect(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' })).toBe(
    `${pkg.version}\n`,
  );
});

it('prints the same version in process as the binary', async () => {
  const inProcess = await runInProcess(['--version']);
  expect(inProcess).toEqual({ code: 0, stdout: `${pkg.version}\n`, stderr: '' });
  expect(runBinary(['--version'])).toEqual(inProcess);
});

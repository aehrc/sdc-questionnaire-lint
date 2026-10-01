/* eslint-disable @typescript-eslint/unbound-method -- tests compare function identity and never call them detached. */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { guardStdout } from '../../src/cli/output-guard.js';
import { selectConfig } from '../../src/config/discover.js';
import { loadConfig } from '../../src/config/load.js';
import { runInProcess } from '../support/cli.js';

function recorder() {
  const chunks: string[] = [];
  return { chunks, stderr: { write: (chunk: string) => void chunks.push(chunk) } };
}

describe('guardStdout', () => {
  it('sends console.log, info, debug and process.stdout.write to stderr', () => {
    const { chunks, stderr } = recorder();
    const restore = guardStdout(stderr);
    try {
      console.log('log %d', 1);
      console.info('info');
      console.debug('debug');
      process.stdout.write('direct\n');
      process.stdout.write(Buffer.from('bytes\n'));
    } finally {
      restore();
    }
    expect(chunks.join('')).toBe('log 1\ninfo\ndebug\ndirect\nbytes\n');
  });

  it('calls a write callback so callers waiting on it continue', () => {
    const restore = guardStdout(recorder().stderr);
    let called = false;
    try {
      process.stdout.write('x', () => {
        called = true;
      });
    } finally {
      restore();
    }
    expect(called).toBe(true);
  });

  it('restores the original functions', () => {
    const original = { log: console.log, write: process.stdout.write };
    guardStdout(recorder().stderr)();
    expect(console.log).toBe(original.log);
    expect(process.stdout.write).toBe(original.write);
  });

  it('redirects logging from a config module while it is imported', async () => {
    const { chunks, stderr } = recorder();
    const cwd = fileURLToPath(new URL('../fixtures/config/', import.meta.url));
    const restore = guardStdout(stderr);
    try {
      const selected = await selectConfig({ cwd, explicitPath: 'logs.mjs' });
      if (selected) await loadConfig(selected);
    } finally {
      restore();
    }
    expect(chunks.join('')).toBe('config says hello\nconfig info\nconfig writes\n');
  });
});

describe('runCli', () => {
  it('writes its own output through the captured stdout and restores the guard', async () => {
    const original = process.stdout.write;
    const result = await runInProcess(['--help']);
    expect(result.stdout).toContain('usage: sdc-lint');
    expect(result.stderr).toBe('');
    expect(process.stdout.write).toBe(original);
  });
});

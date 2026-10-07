/* eslint-disable @typescript-eslint/unbound-method -- tests compare function identity and never call them detached. */
import { describe, expect, it } from 'vitest';
import { guardStdout } from '../../src/cli/output-guard.js';
import { loadConfig } from '../../src/config/load.js';
import { runInProcess } from '../support/cli.js';
import { tempTree } from '../support/tmp.js';

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
    const original = {
      log: console.log,
      info: console.info,
      debug: console.debug,
      write: process.stdout.write,
    };
    guardStdout(recorder().stderr)();
    expect(console.log).toBe(original.log);
    expect(console.info).toBe(original.info);
    expect(console.debug).toBe(original.debug);
    expect(process.stdout.write).toBe(original.write);
  });

  it('redirects logging from a config module while it is imported', async () => {
    const { chunks, stderr } = recorder();
    const cwd = await tempTree({
      'sdc-questionnaire-lint.config.mjs':
        "console.log('config says hello');\n" +
        "console.info('config info');\n" +
        "process.stdout.write('config writes\\n');\n" +
        'export default {};\n',
    });
    const restore = guardStdout(stderr);
    try {
      await loadConfig({ cwd });
    } finally {
      restore();
    }
    expect(chunks.join('')).toBe('config says hello\nconfig info\nconfig writes\n');
  });
});

describe('runCli', () => {
  it('restores the guard after a run', async () => {
    const original = process.stdout.write;
    const result = await runInProcess(['explain'], { cwd: await tempTree() });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('sdc/parse-error');
    expect(process.stdout.write).toBe(original);
  });
});

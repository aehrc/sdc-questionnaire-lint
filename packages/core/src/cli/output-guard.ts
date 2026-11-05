/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

/* eslint-disable no-console -- this module redirects console output; it never logs. */
import { format } from 'node:util';
import type { CliIo } from './run.js';

// Config and plugin code must not contaminate report stdout (cli.md § Streams and exit codes).
// Until the returned restore function runs, console.log/info/debug and process.stdout.write go to
// stderr. Capture the real stdout writer before calling this; only the final report uses it.
export function guardStdout(stderr: CliIo['stderr']): () => void {
  const saved = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    // Saved to be put back unchanged, never called detached.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    write: process.stdout.write,
  };
  const log = (...args: unknown[]): void => {
    stderr.write(`${format(...args)}\n`);
  };
  console.log = log;
  console.info = log;
  console.debug = log;
  process.stdout.write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    stderr.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    const callback = rest.find((argument) => typeof argument === 'function') as
      (() => void) | undefined;
    callback?.();
    return true;
  };

  return () => {
    console.log = saved.log;
    console.info = saved.info;
    console.debug = saved.debug;
    process.stdout.write = saved.write;
  };
}

#!/usr/bin/env node
import { guardStdout } from './output-guard.js';
import { runCli } from './run.js';

// Captured before the guard, so only the report reaches stdout.
const stdout = process.stdout.write.bind(process.stdout);
// Never restored: plugin work still running after the run, such as an async rule's timer, logs to
// stderr until the process exits.
guardStdout(process.stderr);

// Set exitCode instead of calling process.exit(), so piped stdout is flushed before Node exits.
process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: { write: (chunk) => void stdout(chunk), isTTY: process.stdout.isTTY },
  stderr: process.stderr,
});

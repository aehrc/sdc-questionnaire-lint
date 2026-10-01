#!/usr/bin/env node
import { runCli } from './run.js';

// Set exitCode instead of calling process.exit(), so piped stdout is flushed before Node exits.
process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});

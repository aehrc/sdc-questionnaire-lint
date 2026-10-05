#!/usr/bin/env node
import pkg from '../../package.json' with { type: 'json' };

// Placeholder until the CLI contract in docs/cli.md is implemented.
if (process.argv.slice(2).includes('--version')) {
  process.stdout.write(`${pkg.version}\n`);
} else {
  process.stderr.write('usage: sdc-lint <lint|explain> [options]\n');
  process.exitCode = 2;
}

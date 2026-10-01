import pkg from '../../package.json' with { type: 'json' };

export interface CliIo {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  stdout: { write(chunk: string): void; isTTY?: boolean };
  stderr: { write(chunk: string): void };
}

// Placeholder until the CLI contract in docs/cli.md is implemented.
export function runCli(argv: readonly string[], io: CliIo): Promise<0 | 1 | 2> {
  if (argv.includes('--version')) {
    io.stdout.write(`${pkg.version}\n`);
    return Promise.resolve(0);
  }
  io.stderr.write('usage: sdc-lint <lint|explain> [options]\n');
  return Promise.resolve(2);
}

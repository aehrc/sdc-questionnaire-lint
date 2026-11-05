/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runBinary } from '../support/cli.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Both config files exist and neither loads, so any config access would fail the run.
const cwd = fileURLToPath(new URL('../fixtures/cli/unloadable-config/', import.meta.url));

describe('--help', () => {
  it('lists both commands at top level', () => {
    const { code, stdout, stderr } = runBinary(['--help'], { cwd });
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toMatch(/^ {2}lint \[paths\.\.\.\]/m);
    expect(stdout).toMatch(/^ {2}explain \[rule-id\]/m);
  });

  it('prints lint help with the default invocation, examples and exit codes', () => {
    const { code, stdout, stderr } = runBinary(['lint', '--help'], { cwd });
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toMatch(/^ {2}sdc-lint lint$/m);
    expect(stdout).toContain('sdc-lint lint "fsh-generated/resources/Questionnaire-*.json"');
    expect(stdout).toContain('--config ig/sdc-questionnaire-lint.config.json');
    expect(stdout).toContain('--format <format>');
    expect(stdout).toMatch(/text \(default\), json, github .*\n.* or sarif$/m);
    expect(stdout).toContain('sdc-lint lint --format sarif > lint.sarif');
    expect(stdout).toContain('--show-info');
    expect(stdout).toMatch(/^exit codes:\n {2}0 .*\n {2}1 .*\n {2}2 /m);
  });

  it('prints explain help with listing, single-rule and config examples', () => {
    const { code, stdout, stderr } = runBinary(['--help', 'explain'], { cwd });
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toMatch(/^ {2}sdc-lint explain$/m);
    expect(stdout).toContain(
      'sdc-lint explain smart-forms/repeating-group-variable --config ig/sdc-questionnaire-lint.config.mjs',
    );
  });

  it('uses sdc-lint in every example', () => {
    for (const argv of [['--help'], ['lint', '--help'], ['explain', '--help']]) {
      const { stdout } = runBinary(argv, { cwd });
      expect(stdout).not.toContain('sdc-questionnaire-lint lint');
      expect(stdout).not.toContain('sdc-questionnaire-lint explain');
    }
  });
});

describe('--version', () => {
  it.each([[['--version']], [['lint', '--version']], [['explain', '--version']]])(
    '%j prints the core version',
    (argv) => {
      expect(runBinary(argv, { cwd })).toEqual({ code: 0, stdout: `${pkg.version}\n`, stderr: '' });
    },
  );
});

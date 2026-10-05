import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../src/report/sort.js';
import type { ConfigFinding, Finding, QuestionnaireFinding } from '../../src/report/types.js';

interface Options {
  file?: string;
  fsh?: { file: string; line: number; column: number };
  ruleId?: string;
  resourcePointer?: string;
  pointer?: string;
  fingerprint?: string;
}

function questionnaire(options: Options = {}): QuestionnaireFinding {
  const resourcePointer = options.resourcePointer ?? '';
  return {
    kind: 'questionnaire',
    ruleId: options.ruleId ?? 'sdc/rule',
    severity: 'error',
    message: 'Something is wrong.',
    fingerprint: options.fingerprint ?? 'f',
    jsonLocation: {
      file: options.file ?? 'fsh-generated/resources/Questionnaire-A.json',
      pointer: options.pointer ?? `${resourcePointer}/item/0`,
      resource: { resourceType: 'Questionnaire', pointer: resourcePointer },
    },
    sourceLocation: options.fsh
      ? {
          status: 'mapped',
          confidence: 'exact',
          location: {
            ...options.fsh,
            endLine: options.fsh.line,
            endColumn: options.fsh.column + 1,
          },
        }
      : { status: 'unmapped', reason: 'not-found' },
  };
}

function config(file: string, pointer: string, fingerprint = 'f'): ConfigFinding {
  return {
    kind: 'config',
    ruleId: 'lint/stale-suppression',
    severity: 'warning',
    message: 'A suppression targets a deleted file.',
    fingerprint,
    configLocation: { file, pointer },
  };
}

// Sorting a reversed list must give back the expected order.
function expectOrder(...expected: Finding[]): void {
  expect([...expected].reverse().sort(compareFindings)).toEqual(expected);
}

const fsh = (file: string, line: number, column: number) => ({ file, line, column });

describe('compareFindings', () => {
  it('orders by displayed file: mapped FSH, otherwise compiled JSON, otherwise config', () => {
    expectOrder(
      questionnaire({ file: 'z/Questionnaire-Z.json', fsh: fsh('a/Example.fsh', 9, 1) }),
      questionnaire({ file: 'm/Questionnaire-M.json' }),
      config('sdc-questionnaire-lint.config.json', '/suppress/0'),
    );
  });

  it('orders by line within a file', () => {
    expectOrder(
      questionnaire({ fsh: fsh('input/fsh/A.fsh', 2, 40), ruleId: 'sdc/z' }),
      questionnaire({ fsh: fsh('input/fsh/A.fsh', 10, 1), ruleId: 'sdc/a' }),
    );
  });

  it('orders by column within a line', () => {
    expectOrder(
      questionnaire({ fsh: fsh('input/fsh/A.fsh', 4, 3), ruleId: 'sdc/z' }),
      questionnaire({ fsh: fsh('input/fsh/A.fsh', 4, 12), ruleId: 'sdc/a' }),
    );
  });

  it('puts unknown positions after known ones in the same file', () => {
    const file = 'fsh-generated/resources/Questionnaire-A.json';
    expectOrder(
      questionnaire({ fsh: fsh(file, 50, 1), ruleId: 'sdc/z' }),
      questionnaire({ file, ruleId: 'sdc/a' }),
    );
  });

  it('orders by rule ID', () => {
    expectOrder(questionnaire({ ruleId: 'sdc/a-rule' }), questionnaire({ ruleId: 'sdc/b-rule' }));
  });

  it('orders by resource pointer', () => {
    expectOrder(
      questionnaire({ resourcePointer: '/entry/0/resource', pointer: '/entry/0/resource/item/9' }),
      questionnaire({ resourcePointer: '/entry/1/resource', pointer: '/entry/1/resource/item/0' }),
    );
  });

  it('orders by site pointer', () => {
    expectOrder(questionnaire({ pointer: '/item/0' }), questionnaire({ pointer: '/item/1' }));
  });

  it('orders config findings by config pointer', () => {
    expectOrder(
      config('sdc-questionnaire-lint.config.json', '/suppress/0', 'z'),
      config('sdc-questionnaire-lint.config.json', '/suppress/1', 'a'),
    );
  });

  it('breaks remaining ties by fingerprint', () => {
    expectOrder(questionnaire({ fingerprint: 'a' }), questionnaire({ fingerprint: 'b' }));
  });

  it('compares pointer indexes as text, not numbers', () => {
    expectOrder(questionnaire({ pointer: '/item/10' }), questionnaire({ pointer: '/item/2' }));
  });

  it('compares file names by code unit, not locale', () => {
    const names = ['Zeta.json', 'alpha.json', 'éclair.json', 'fig.json'];
    // localeCompare would put alpha before Zeta and éclair before fig.
    expect([...names].sort((a, b) => a.localeCompare(b))).not.toEqual(names.slice().sort());
    expectOrder(
      questionnaire({ file: 'Zeta.json' }),
      questionnaire({ file: 'alpha.json' }),
      questionnaire({ file: 'fig.json' }),
      questionnaire({ file: 'éclair.json' }),
    );
  });

  it('returns 0 only for findings equal on every key', () => {
    expect(compareFindings(questionnaire(), questionnaire())).toBe(0);
  });
});

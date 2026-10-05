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

function questionnaireFinding(options: Options = {}): QuestionnaireFinding {
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

function configFinding(file: string, pointer: string, fingerprint = 'f'): ConfigFinding {
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
      questionnaireFinding({ file: 'z/Questionnaire-Z.json', fsh: fsh('a/Example.fsh', 9, 1) }),
      questionnaireFinding({ file: 'm/Questionnaire-M.json' }),
      configFinding('sdc-questionnaire-lint.config.json', '/suppress/0'),
    );
  });

  it('orders by line within a file', () => {
    expectOrder(
      questionnaireFinding({ fsh: fsh('input/fsh/A.fsh', 2, 40), ruleId: 'sdc/z' }),
      questionnaireFinding({ fsh: fsh('input/fsh/A.fsh', 10, 1), ruleId: 'sdc/a' }),
    );
  });

  it('orders by column within a line', () => {
    expectOrder(
      questionnaireFinding({ fsh: fsh('input/fsh/A.fsh', 4, 3), ruleId: 'sdc/z' }),
      questionnaireFinding({ fsh: fsh('input/fsh/A.fsh', 4, 12), ruleId: 'sdc/a' }),
    );
  });

  it('puts unknown positions after known ones in the same file', () => {
    const file = 'fsh-generated/resources/Questionnaire-A.json';
    expectOrder(
      questionnaireFinding({ fsh: fsh(file, 50, 1), ruleId: 'sdc/z' }),
      questionnaireFinding({ file, ruleId: 'sdc/a' }),
    );
  });

  it('orders by rule ID', () => {
    expectOrder(
      questionnaireFinding({ ruleId: 'sdc/a-rule' }),
      questionnaireFinding({ ruleId: 'sdc/b-rule' }),
    );
  });

  it('orders by resource pointer', () => {
    expectOrder(
      questionnaireFinding({
        resourcePointer: '/entry/0/resource',
        pointer: '/entry/0/resource/item/9',
      }),
      questionnaireFinding({
        resourcePointer: '/entry/1/resource',
        pointer: '/entry/1/resource/item/0',
      }),
    );
  });

  it('orders by site pointer', () => {
    expectOrder(
      questionnaireFinding({ pointer: '/item/0' }),
      questionnaireFinding({ pointer: '/item/1' }),
    );
  });

  it('orders config findings by config pointer', () => {
    expectOrder(
      configFinding('sdc-questionnaire-lint.config.json', '/suppress/0', 'z'),
      configFinding('sdc-questionnaire-lint.config.json', '/suppress/1', 'a'),
    );
  });

  it('breaks remaining ties by fingerprint', () => {
    expectOrder(
      questionnaireFinding({ fingerprint: 'a' }),
      questionnaireFinding({ fingerprint: 'b' }),
    );
  });

  it('compares pointer indexes as text, not numbers', () => {
    expectOrder(
      questionnaireFinding({ pointer: '/item/10' }),
      questionnaireFinding({ pointer: '/item/2' }),
    );
  });

  it('compares file names by code unit, not locale', () => {
    const names = ['Zeta.json', 'alpha.json', 'éclair.json', 'fig.json'];
    // localeCompare would put alpha before Zeta and éclair before fig.
    expect([...names].sort((a, b) => a.localeCompare(b))).not.toEqual(names.slice().sort());
    expectOrder(
      questionnaireFinding({ file: 'Zeta.json' }),
      questionnaireFinding({ file: 'alpha.json' }),
      questionnaireFinding({ file: 'fig.json' }),
      questionnaireFinding({ file: 'éclair.json' }),
    );
  });

  it('returns 0 only for findings equal on every key', () => {
    expect(compareFindings(questionnaireFinding(), questionnaireFinding())).toBe(0);
  });
});

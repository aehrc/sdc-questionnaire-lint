import { compareFindings } from './sort.js';
import type { Finding, Report } from './types.js';

const reportKeys = ['schemaVersion', 'status', 'run', 'findings', 'summary', 'failure'];
const failureKeys = ['code', 'path', 'ruleId', 'message', 'help'];
const findingKeys = [
  'kind',
  'ruleId',
  'severity',
  'message',
  'help',
  'note',
  'docsUrl',
  'jsonLocation',
  'sourceLocation',
  'configLocation',
  'expression',
  'relatedLocations',
  'suggestions',
  'fingerprint',
];

// Fixes key order so output does not depend on how an object was assembled. Unknown keys keep
// their relative order after the known ones.
function orderKeys<T extends object>(value: T, order: readonly string[]): T {
  const rank = (key: string): number => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  const entries = Object.entries(value).sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(entries) as T;
}

function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(compareFindings).map((finding) => orderKeys(finding, findingKeys));
}

// One JSON document with a trailing newline. Never coloured, never with progress text.
export function formatJsonReport(report: Report): string {
  const ordered =
    report.status === 'completed'
      ? { ...report, findings: sortFindings(report.findings) }
      : { ...report, failure: orderKeys(report.failure, failureKeys) };
  return `${JSON.stringify(orderKeys(ordered, reportKeys), null, 2)}\n`;
}

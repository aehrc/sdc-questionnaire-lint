// Lints the local corpus with the built-in rules and prints the findings added or removed since
// the snapshot kept beside it (docs/core-rules.md, slice 0). The corpus is gitignored and never
// committed (D14). Run from the repository root:
//   npm run corpus                 compare with corpus/findings.json
//   npm run corpus -- --update     also save the current findings as the snapshot
//   npm run corpus -- --smart-forms
//                                  also list the Smart Forms plugin, and compare with
//                                  corpus/findings.smart-forms.json (docs/smart-forms-rules.md, P0)
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Report, Severity } from '../src/index.js';

// A finding as the snapshot records it: no message, because messages can quote expressions from
// forms whose terms restrict redistribution, and the output is meant to be pasted into a PR.
export interface CorpusFinding {
  ruleId: string;
  severity: Severity;
  file: string;
  pointer: string;
}

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const corpusDirectory = fileURLToPath(new URL('../../../corpus/', import.meta.url));
const smartFormsConfig = fileURLToPath(
  new URL('../../plugin-smart-forms/scripts/corpus.config.mjs', import.meta.url),
);

// How a run lints the corpus: with a config, such as one that lists a plugin, and against the
// snapshot of that mode. Without a config, the built-in rules run at their defaults.
export interface CorpusMode {
  config?: string;
  snapshot: string;
}

const coreMode: CorpusMode = { snapshot: 'findings.json' };

const key = (finding: CorpusFinding): string =>
  [finding.ruleId, finding.severity, finding.file, finding.pointer].join('\u0000');

// Findings in one list and not the other, counting repeated findings at one site.
export function compareFindings(
  snapshot: readonly CorpusFinding[],
  current: readonly CorpusFinding[],
): { added: CorpusFinding[]; removed: CorpusFinding[] } {
  const unmatched = (from: readonly CorpusFinding[], against: readonly CorpusFinding[]) => {
    const counts = new Map<string, number>();
    for (const finding of against) counts.set(key(finding), (counts.get(key(finding)) ?? 0) + 1);
    // A finding is matched while the other list has an unused copy of it.
    return from.filter((finding) => {
      const count = counts.get(key(finding)) ?? 0;
      if (count === 0) return true;
      counts.set(key(finding), count - 1);
      return false;
    });
  };
  return { added: unmatched(current, snapshot), removed: unmatched(snapshot, current) };
}

// Groups findings by rule ID, with a count, then lists each one by file and JSON Pointer.
function listChanges(findings: readonly CorpusFinding[], change: string): string[] {
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))].sort();
  return ruleIds.flatMap((ruleId) => {
    const group = findings.filter((finding) => finding.ruleId === ruleId);
    return [
      `${ruleId}: ${String(group.length)} ${change}`,
      ...group.map((finding) => `  ${finding.severity} ${finding.file} ${finding.pointer}`),
    ];
  });
}

export function runCorpus(
  corpus: string,
  update: boolean,
  mode: CorpusMode = coreMode,
): { code: number; stdout: string; stderr: string } {
  const forms = path.join(corpus, 'forms');
  if (!existsSync(forms)) {
    return {
      code: 2,
      stdout: '',
      stderr:
        `error: no corpus at ${forms}\n` +
        'help: copy the forms listed in docs/core-rules.md (slice 0) into corpus/forms/\n',
    };
  }

  const config = mode.config === undefined ? [] : ['--config', mode.config];
  const run = spawnSync(process.execPath, [cli, 'lint', 'forms', '--format', 'json', ...config], {
    cwd: corpus,
    encoding: 'utf8',
    // The report must arrive complete; spawnSync's default 1 MB buffer would cut it off.
    maxBuffer: 256 * 1024 * 1024,
  });
  // A crash before the CLI can write a report leaves stdout empty.
  if (!run.stdout.startsWith('{')) {
    return { code: 2, stdout: '', stderr: `error: the corpus run wrote no report\n${run.stderr}` };
  }
  const report = JSON.parse(run.stdout) as Report;
  if (report.status === 'failed') {
    const { code, message } = report.failure;
    return { code: 2, stdout: '', stderr: `error: the corpus run failed: ${code}: ${message}\n` };
  }

  const current = report.findings
    .filter((finding) => finding.kind === 'questionnaire')
    .map(({ ruleId, severity, jsonLocation: { file, pointer } }) => ({
      ruleId,
      severity,
      file,
      pointer,
    }));
  const snapshotFile = path.join(corpus, mode.snapshot);
  const hasSnapshot = existsSync(snapshotFile);
  const snapshot = hasSnapshot
    ? (JSON.parse(readFileSync(snapshotFile, 'utf8')) as CorpusFinding[])
    : [];
  const { added, removed } = compareFindings(snapshot, current);

  const { questionnaires, expressions } = report.summary;
  const lines = [
    `${String(current.length)} findings in ${String(questionnaires)} questionnaires. ` +
      `Expressions: ${String(expressions.analysed)} analysed, ${String(expressions.unchecked)} unchecked.`,
  ];
  const smartForms = report.run.compat['smart-forms'];
  if (smartForms !== undefined) {
    const versions = Object.entries(smartForms).map(
      ([component, version]) => `${component} ${version}`,
    );
    lines.push(`Smart Forms: ${versions.join(', ')}.`);
  }
  if (!hasSnapshot) lines.push('No snapshot yet, so every finding is listed as added.');
  if (added.length === 0 && removed.length === 0) lines.push('No findings were added or removed.');
  lines.push(...listChanges(added, 'added'), ...listChanges(removed, 'removed'));
  if (update) {
    writeFileSync(snapshotFile, `${JSON.stringify(current, null, 2)}\n`);
    lines.push(`Saved ${String(current.length)} findings to ${snapshotFile}.`);
  } else if (!hasSnapshot || added.length > 0 || removed.length > 0) {
    lines.push('Run with --update to save these findings as the snapshot.');
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const smartFormsMode = process.argv.includes('--smart-forms');
  if (smartFormsMode) {
    // npm run corpus builds core only; the config imports the plugin's build. Through a shell,
    // because npm is npm.cmd on Windows.
    execSync('npm run build --workspace @sdc-questionnaire-lint/plugin-smart-forms', {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  const result = runCorpus(
    corpusDirectory,
    process.argv.includes('--update'),
    smartFormsMode ? { config: smartFormsConfig, snapshot: 'findings.smart-forms.json' } : coreMode,
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

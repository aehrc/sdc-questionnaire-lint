import { realpath } from 'node:fs/promises';
import type { LoadedConfig } from '../config/load.js';
import type { SuppressionEntry } from '../config/types.js';
import { configInvalid } from '../config/validate.js';
import { describeError, LintFailure } from '../failure.js';
import { isWithin } from '../json-pointer.js';
import { displayPath, type InputFile } from '../inputs/paths.js';
import { type Registry, unknownRuleHelp } from '../plugins/registry.js';
import type { ConfigFinding, Finding, QuestionnaireFinding } from '../report/types.js';
import { configFingerprint } from './fingerprint.js';
import type { RuleResult } from './rules.js';

export interface SuppressionOutcome {
  // Unsuppressed Questionnaire findings, then a lint/stale-suppression finding per stale entry.
  findings: Finding[];
  // Distinct findings removed; a finding covered by several entries counts once.
  suppressedFindings: number;
  // Every entry ends in exactly one state.
  suppressions: { applied: number; stale: number; notAssessed: number };
}

const staleRuleId = 'lint/stale-suppression';

// Each suppression must name a registered rule that reports on Questionnaires.
export function checkSuppressionRules(loaded: LoadedConfig | null, registry: Registry): void {
  const ruleIds = registry.rules.map((rule) => rule.id);
  (loaded?.config.suppress ?? []).forEach((entry, index) => {
    if (entry.rule.startsWith('lint/') && ruleIds.includes(entry.rule)) {
      throw configInvalid(
        loaded?.display ?? '',
        ['suppress', index, 'rule'],
        `${entry.rule} findings cannot be suppressed`,
        `set "${entry.rule}": "off" in rules instead`,
      );
    }
    if (!ruleIds.includes(entry.rule)) {
      throw configInvalid(
        loaded?.display ?? '',
        ['suppress', index, 'rule'],
        `unknown rule ${entry.rule}`,
        unknownRuleHelp(entry.rule, ruleIds, registry.namespaces),
      );
    }
  });
}

// The canonical path of a suppression's file, or undefined when it does not exist.
async function canonicalTarget(file: string, cwd: string): Promise<string | undefined> {
  try {
    return await realpath(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    // Not knowing whether the file exists is an input failure, not proof of staleness.
    const display = displayPath(file, cwd);
    throw new LintFailure({
      code: 'INPUT_UNREADABLE',
      path: display,
      message: `cannot check suppressed file ${display}: ${describeError(error)}`,
      help: 'check the permissions of the file and the directories above it',
    });
  }
}

function resourceName(finding: QuestionnaireFinding): string | undefined {
  const { resourceType, id } = finding.jsonLocation.resource;
  return id === undefined ? undefined : `${resourceType}/${id}`;
}

// Whether entry covers a result in its file: same rule, and every selector given matches.
function covers(entry: SuppressionEntry, result: RuleResult): boolean {
  const { finding, site } = result;
  return (
    finding.ruleId === entry.rule &&
    (entry.linkId === undefined || finding.jsonLocation.linkId === entry.linkId) &&
    (entry.extensionUrl === undefined || site.extensionUrls.includes(entry.extensionUrl)) &&
    (entry.declaration === undefined || site.declarationName === entry.declaration) &&
    (entry.resource === undefined || resourceName(finding) === entry.resource) &&
    (entry.pointer === undefined || isWithin(finding.jsonLocation.pointer, entry.pointer))
  );
}

function staleFinding(
  entry: SuppressionEntry,
  index: number,
  target: string,
  configDisplay: string,
): ConfigFinding {
  return {
    kind: 'config',
    ruleId: staleRuleId,
    severity: 'warning',
    message: `A suppression targets ${target}, which no longer exists.`,
    help: 'remove this suppression from the configuration',
    configLocation: { file: configDisplay, pointer: `/suppress/${String(index)}` },
    fingerprint: configFingerprint(staleRuleId, entry),
  };
}

// Applies the config's suppressions to the rule results and assesses each entry (cli.md § Stale
// suppressions). An entry matching a finding is applied. Otherwise it is stale only when the run
// establishes that: in a full run, its file no longer exists. Everything else is not assessed,
// including targets outside a targeted run. Staleness of sites in selected files needs the
// expression walker and a way for rules to signal a completed check.
export async function applySuppressions({
  cwd,
  loaded,
  registry,
  suppressionFiles,
  selection,
  inputFiles,
  results,
}: {
  cwd: string;
  loaded: LoadedConfig | null;
  registry: Registry;
  suppressionFiles: readonly string[];
  selection: 'targeted' | 'full';
  inputFiles: readonly InputFile[];
  results: readonly RuleResult[];
}): Promise<SuppressionOutcome> {
  const entries = loaded?.config.suppress ?? [];
  const canonicalByDisplay = new Map(inputFiles.map((file) => [file.display, file.path]));
  const staleEnabled = registry.rules.find((rule) => rule.id === staleRuleId)?.enabled ?? false;

  const suppressed = new Set<RuleResult>();
  const stale: ConfigFinding[] = [];
  const counts = { applied: 0, stale: 0, notAssessed: 0 };

  for (const [index, entry] of entries.entries()) {
    const file = suppressionFiles[index] ?? entry.file;
    const target = await canonicalTarget(file, cwd);
    const matched = results.filter(
      (result) =>
        target !== undefined &&
        canonicalByDisplay.get(result.finding.jsonLocation.file) === target &&
        covers(entry, result),
    );
    if (matched.length > 0) {
      counts.applied++;
      for (const result of matched) suppressed.add(result);
    } else if (selection === 'full' && target === undefined) {
      counts.stale++;
      if (staleEnabled && loaded !== null) {
        stale.push(staleFinding(entry, index, displayPath(file, cwd), loaded.display));
      }
    } else {
      // A target outside a targeted run, an existing file outside a full run's inputs, or a
      // selected file where the rule found nothing: none of these establishes staleness yet.
      counts.notAssessed++;
    }
  }

  return {
    findings: [
      ...results.filter((result) => !suppressed.has(result)).map((result) => result.finding),
      ...stale,
    ],
    suppressedFindings: suppressed.size,
    suppressions: counts,
  };
}

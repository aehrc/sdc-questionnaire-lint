import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedConfig } from '../config/load.js';
import type { SuppressionEntry } from '../config/types.js';
import { configInvalid } from '../config/validate.js';
import { describeError, LintFailure } from '../failure.js';
import { isWithin } from '../json-pointer.js';
import { displayPath } from '../inputs/paths.js';
import { type Registry, unknownRuleHelp } from '../plugins/registry.js';
import type { ConfigFinding, Finding, QuestionnaireFinding } from '../report/types.js';
import { describeDeletedTarget } from '../rules/stale-suppression.js';
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

// The config's suppress entries, ready to apply to one run.
export interface Suppressions {
  // Applies the entries to the run's rule results and assesses each one (cli.md § Stale
  // suppressions). An entry matching a finding is applied. Otherwise it is stale only when the run
  // establishes that: in a full run, its file no longer exists. Everything else is not assessed,
  // including targets outside a targeted run. Staleness of sites in selected files needs a way for
  // rules to signal a completed check.
  assess(run: {
    selection: 'targeted' | 'full';
    results: readonly RuleResult[];
  }): Promise<SuppressionOutcome>;
}

interface Resolved {
  entry: SuppressionEntry;
  index: number;
  // Absolute, resolved against the config directory.
  file: string;
}

const staleRuleId = 'lint/stale-suppression';

// Each suppression must name a registered rule that reports on Questionnaires.
function checkRule(entry: SuppressionEntry, index: number, display: string, registry: Registry) {
  const ruleIds = registry.rules.map((rule) => rule.id);
  if (entry.rule.startsWith('lint/') && ruleIds.includes(entry.rule)) {
    throw configInvalid(
      display,
      ['suppress', index, 'rule'],
      `${entry.rule} findings cannot be suppressed`,
      `set "${entry.rule}": "off" in rules instead`,
    );
  }
  if (!ruleIds.includes(entry.rule)) {
    throw configInvalid(
      display,
      ['suppress', index, 'rule'],
      `unknown rule ${entry.rule}`,
      unknownRuleHelp(entry.rule, ruleIds, registry.namespaces),
    );
  }
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

function staleFinding({ entry, index }: Resolved, target: string, config: string): ConfigFinding {
  return {
    kind: 'config',
    ruleId: staleRuleId,
    severity: 'warning',
    ...describeDeletedTarget(target),
    configLocation: { file: config, pointer: `/suppress/${String(index)}` },
    fingerprint: configFingerprint(staleRuleId, entry),
  };
}

// Checks every entry against the registry, so a config failure comes before any input is read.
export function createSuppressions({
  cwd,
  loaded,
  registry,
}: {
  cwd: string;
  loaded: LoadedConfig | null;
  registry: Registry;
}): Suppressions {
  const config = loaded?.display ?? '';
  const entries: Resolved[] = (loaded?.config.suppress ?? []).map((entry, index) => {
    checkRule(entry, index, config, registry);
    return { entry, index, file: path.resolve(loaded?.dir ?? cwd, entry.file) };
  });
  const staleEnabled = registry.rules.find((rule) => rule.id === staleRuleId)?.enabled ?? false;

  return {
    async assess({ selection, results }) {
      const suppressed = new Set<RuleResult>();
      const stale: ConfigFinding[] = [];
      const counts = { applied: 0, stale: 0, notAssessed: 0 };

      for (const resolved of entries) {
        const target = await canonicalTarget(resolved.file, cwd);
        const matched = results.filter(
          (result) =>
            target !== undefined && result.input.path === target && covers(resolved.entry, result),
        );
        if (matched.length > 0) {
          counts.applied++;
          for (const result of matched) suppressed.add(result);
        } else if (selection === 'full' && target === undefined) {
          counts.stale++;
          if (staleEnabled)
            stale.push(staleFinding(resolved, displayPath(resolved.file, cwd), config));
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
    },
  };
}

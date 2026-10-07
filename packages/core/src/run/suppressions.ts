import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { checkFhirPathSyntax, hasFhirPathText } from '../analysis/fhirpath.js';
import { hasQueryText } from '../analysis/query.js';
import type { LoadedConfig } from '../config/load.js';
import type { SuppressionEntry } from '../config/types.js';
import { configInvalid } from '../config/validate.js';
import { describeError, LintFailure } from '../failure.js';
import { displayPath, type InputFile } from '../inputs/paths.js';
import { type RegisteredRule, staleSuppressionId } from '../plugins/rule-registry.js';
import type { ExpressionSite, QuestionnaireDocument } from '../plugins/types.js';
import type { ConfigFinding, Finding } from '../report/types.js';
import { fileGone, nothingToHide, siteGone } from '../rules/stale-suppression.js';
import { configFingerprint } from './fingerprint.js';

export interface SuppressionOutcome {
  // Unsuppressed findings, then one stale finding per stale entry.
  findings: Finding[];
  // Distinct findings hidden; overlapping entries count a finding once.
  suppressedFindings: number;
  suppressions: { applied: number; stale: number; notAssessed: number };
}

interface RunDocument {
  input: InputFile;
  document: QuestionnaireDocument;
  sites: readonly ExpressionSite[];
}

interface SuppressionRun {
  loaded: LoadedConfig | null;
  rules: readonly RegisteredRule[];
  selection: 'full' | 'targeted';
  // Every file the run read: the selected files.
  inputs: readonly InputFile[];
  documents: readonly RunDocument[];
  findings: readonly Finding[];
  cwd: string;
}

// Where each built-in rule completes its check at an Expression site. Only there does the absence
// of its findings make a suppression stale (cli.md § Stale suppressions); a rule missing here, such
// as a plugin rule, leaves its suppressions not assessed.
export const completesCheck: Readonly<Record<string, (site: ExpressionSite) => boolean>> = {
  'sdc/fragment-parse-error': hasQueryText,
  'sdc/parse-error': hasFhirPathText,
  'sdc/query-syntax': hasQueryText,
  'sdc/uncatalogued-expression': () => true,
  'sdc/unknown-function': (site) =>
    hasFhirPathText(site) && checkFhirPathSyntax(site.text) === undefined,
};

type Assessment =
  | { state: 'applied'; hidden: readonly Finding[] }
  | { state: 'stale'; message: string; help: string }
  | { state: 'notAssessed' };

const notAssessed: Assessment = { state: 'notAssessed' };

function isEnabled(rules: readonly RegisteredRule[], ruleId: string): boolean {
  return rules.some(({ id, severity }) => id === ruleId && severity !== 'off');
}
const listedPointers = 3;

// The selected input the entry names, 'gone' when a full run confirms the file does not exist, or
// undefined when the entry cannot be assessed: the file is outside the selection, or a targeted
// run cannot resolve it.
async function targetFile(
  entry: SuppressionEntry,
  run: SuppressionRun,
  dir: string,
): Promise<InputFile | 'gone' | undefined> {
  const target = path.resolve(dir, entry.file);
  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch (error) {
    if (run.selection === 'targeted') return undefined;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'gone';
    const display = displayPath(target, run.cwd);
    throw new LintFailure({
      code: 'INPUT_UNREADABLE',
      path: display,
      message: `cannot check whether suppression target ${display} exists: ${describeError(error)}`,
      help: 'check the permissions of the directories above it',
    });
  }
  return run.inputs.find((input) => input.path === canonical);
}

function questionnaireName(document: QuestionnaireDocument): string | undefined {
  const { id } = document.resource;
  return typeof id === 'string' ? `Questionnaire/${id}` : undefined;
}

// Only Expression sites are candidates: a fragment shares its query's pointer, so suppressing the
// query also covers findings in its fragments.
function selects(entry: SuppressionEntry, document: QuestionnaireDocument, site: ExpressionSite) {
  return (
    site.carrier === 'expression' &&
    (entry.linkId === undefined || site.item?.linkId === entry.linkId) &&
    (entry.extensionUrl === undefined || site.location?.url === entry.extensionUrl) &&
    (entry.name === undefined || site.name === entry.name) &&
    (entry.resource === undefined || questionnaireName(document) === entry.resource) &&
    (entry.pointer === undefined || site.pointer === entry.pointer)
  );
}

function listPointers(pointers: readonly string[]): string {
  const shown = pointers.slice(0, listedPointers);
  const more = pointers.length - shown.length;
  return more > 0
    ? `${shown.join(', ')} and ${String(more)} more`
    : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1) ?? ''}`;
}

async function assess(
  entry: SuppressionEntry,
  index: number,
  run: SuppressionRun,
  loaded: LoadedConfig,
): Promise<Assessment> {
  const file = await targetFile(entry, run, loaded.dir);
  if (file === undefined) return notAssessed;
  if (file === 'gone') {
    return {
      state: 'stale',
      ...fileGone(entry.rule, displayPath(path.resolve(loaded.dir, entry.file), run.cwd)),
    };
  }

  const matched = run.documents
    .filter(({ input }) => input.path === file.path)
    .flatMap(({ document, sites }) =>
      sites.filter((site) => selects(entry, document, site)).map((site) => ({ document, site })),
    );
  const [only] = matched;
  if (only === undefined) return { state: 'stale', ...siteGone(entry.rule, file.display) };
  if (matched.length > 1) {
    const documents = new Set(matched.map(({ document }) => document));
    throw configInvalid(
      loaded.display,
      ['suppress', index],
      `it matches ${String(matched.length)} expressions, at ${listPointers(matched.map(({ site }) => site.pointer))}`,
      `add ${documents.size > 1 ? 'resource, ' : ''}extensionUrl, name or pointer to select one expression`,
    );
  }

  const { document, site } = only;
  const hidden = run.findings.filter(
    (finding) =>
      finding.kind === 'questionnaire' &&
      finding.ruleId === entry.rule &&
      finding.jsonLocation.file === document.file &&
      finding.jsonLocation.pointer === site.pointer,
  );
  if (hidden.length > 0) return { state: 'applied', hidden };
  return isEnabled(run.rules, entry.rule) && completesCheck[entry.rule]?.(site) === true
    ? { state: 'stale', ...nothingToHide(entry.rule) }
    : notAssessed;
}

// Assesses each suppress entry in order (cli.md § Stale suppressions), hides the findings of the
// applied ones and reports the stale ones. With lint/stale-suppression off, staleness is not
// assessed: a would-be stale entry counts as not assessed.
export async function applySuppressions(run: SuppressionRun): Promise<SuppressionOutcome> {
  const { loaded, findings } = run;
  const suppressions = { applied: 0, stale: 0, notAssessed: 0 };
  if (loaded === null) return { findings: [...findings], suppressedFindings: 0, suppressions };

  const assessStaleness = isEnabled(run.rules, staleSuppressionId);
  const hidden = new Set<Finding>();
  const stale: ConfigFinding[] = [];
  for (const [index, entry] of (loaded.config.suppress ?? []).entries()) {
    const assessment = await assess(entry, index, run, loaded);
    if (assessment.state === 'applied') {
      suppressions.applied++;
      for (const finding of assessment.hidden) hidden.add(finding);
    } else if (assessment.state === 'stale' && assessStaleness) {
      suppressions.stale++;
      stale.push({
        kind: 'config',
        ruleId: staleSuppressionId,
        // Fixed until --strict-suppressions; the rule registry allows only warning or off.
        severity: 'warning',
        message: assessment.message,
        help: assessment.help,
        configLocation: { file: loaded.display, pointer: `/suppress/${String(index)}` },
        fingerprint: configFingerprint(staleSuppressionId, entry),
      });
    } else {
      suppressions.notAssessed++;
    }
  }
  return {
    findings: [...findings.filter((finding) => !hidden.has(finding)), ...stale],
    suppressedFindings: hidden.size,
    suppressions,
  };
}

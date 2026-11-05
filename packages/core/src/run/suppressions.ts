/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  type Declaration,
  type DeclarationKind,
  EXTRACT_ALLOCATE_ID,
  LAUNCH_CONTEXT,
} from '../analysis/declarations.js';
import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import type { LoadedConfig } from '../config/load.js';
import type { SuppressionEntry } from '../config/types.js';
import { invalidConfigFailure } from '../config/validate.js';
import { describeError, LintFailure } from '../failure.js';
import { displayPath, type InputFile } from '../inputs/paths.js';
import type { AnalysedDocument } from '../inputs/read.js';
import {
  completesCheck,
  completesDeclarationCheck,
  staleSuppressionId,
} from '../plugins/builtin.js';
import type { ResolvedRule } from '../plugins/rule-set.js';
import type { ConfigFinding, Finding, RunKind } from '../report/types.js';
import {
  declarationGone,
  declarationHidesNothing,
  fileGone,
  nothingToHide,
  siteGone,
} from '../rules/stale-suppression.js';
import { configFingerprint, distinctFingerprints } from './fingerprint.js';

export interface SuppressionOutcome {
  // Unsuppressed findings, then one stale finding per stale entry.
  findings: Finding[];
  // Distinct findings hidden; overlapping entries count a finding once.
  suppressedFindings: number;
  suppressions: { applied: number; stale: number; notAssessed: number };
}

interface SuppressionRun {
  loaded: LoadedConfig | null;
  rules: readonly ResolvedRule[];
  runKind: RunKind;
  // Every file the run read: the selected files.
  inputFiles: readonly InputFile[];
  documents: readonly AnalysedDocument[];
  findings: readonly Finding[];
  cwd: string;
}

type Assessment =
  | { state: 'applied'; hidden: readonly Finding[] }
  | { state: 'stale'; message: string; help: string }
  | { state: 'notAssessed' };

const notAssessed: Assessment = { state: 'notAssessed' };

function isEnabled(rules: readonly ResolvedRule[], ruleId: string): boolean {
  return rules.some(({ id, setting }) => id === ruleId && setting !== 'off');
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
    if (run.runKind === 'targeted') return undefined;
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
  return run.inputFiles.find((input) => input.path === canonical);
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

// The extensions whose entries select declarations rather than Expression sites (core-rules.md
// D22): launchContext and extractAllocateId are not Expressions.
const declarationKinds: Readonly<Record<string, DeclarationKind>> = {
  [LAUNCH_CONTEXT]: 'launchContext',
  [EXTRACT_ALLOCATE_ID]: 'allocateId',
};

// linkId or pointer selects the item the name is declared on; without either, the entry selects the
// root. pointer is the item's, not the declaration's, so the entry survives reordering (D22).
function selectsDeclaration(
  entry: SuppressionEntry,
  kind: DeclarationKind,
  document: QuestionnaireDocument,
  declaration: Declaration,
) {
  const { item } = declaration;
  return (
    declaration.kind === kind &&
    (entry.linkId !== undefined || entry.pointer !== undefined || item === undefined) &&
    (entry.linkId === undefined || item?.linkId === entry.linkId) &&
    (entry.pointer === undefined || item?.pointer === entry.pointer) &&
    (entry.name === undefined || declaration.name === entry.name) &&
    (entry.resource === undefined || questionnaireName(document) === entry.resource)
  );
}

// Whether two declarations are of one name on one element.
function sameTarget(a: Declaration, b: Declaration): boolean {
  return a.item?.pointer === b.item?.pointer && a.name === b.name;
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

  const kind = entry.extensionUrl === undefined ? undefined : declarationKinds[entry.extensionUrl];
  if (kind !== undefined) return assessDeclaration(entry, kind, index, run, loaded, file);

  const matched = run.documents
    .filter(({ input }) => input.path === file.path)
    .flatMap(({ document, sites, analysis }) =>
      sites
        .filter((site) => selects(entry, document, site))
        .map((site) => ({ document, site, analysis })),
    );
  const [only] = matched;
  if (only === undefined) return { state: 'stale', ...siteGone(entry.rule, file.display) };
  if (matched.length > 1) {
    const documents = new Set(matched.map(({ document }) => document));
    throw invalidConfigFailure(
      loaded.display,
      ['suppress', index],
      `it matches ${String(matched.length)} expressions, at ${listPointers(matched.map(({ site }) => site.pointer))}`,
      `add ${documents.size > 1 ? 'resource, ' : ''}extensionUrl, name or pointer to select one expression`,
    );
  }

  const { document, site, analysis } = only;
  const hidden = run.findings.filter(
    (finding) =>
      finding.kind === 'questionnaire' &&
      finding.ruleId === entry.rule &&
      finding.jsonLocation.file === document.file &&
      finding.jsonLocation.pointer === site.pointer,
  );
  if (hidden.length > 0) return { state: 'applied', hidden };
  return isEnabled(run.rules, entry.rule) && completesCheck[entry.rule]?.(site, analysis) === true
    ? { state: 'stale', ...nothingToHide(entry.rule) }
    : notAssessed;
}

// An entry that targets a name on an element, which any declarations of the name there share: it
// hides the rule's findings at each of them (core-rules.md D22).
function assessDeclaration(
  entry: SuppressionEntry,
  kind: DeclarationKind,
  index: number,
  run: SuppressionRun,
  loaded: LoadedConfig,
  file: InputFile,
): Assessment {
  const matched = run.documents
    .filter(({ input }) => input.path === file.path)
    .flatMap(({ document, analysis }) =>
      analysis.declarations
        .filter((declaration) => selectsDeclaration(entry, kind, document, declaration))
        .map((declaration) => ({ document, analysis, declaration })),
    );
  const [only] = matched;
  if (only === undefined) return { state: 'stale', ...declarationGone(entry.rule, file.display) };
  if (
    !matched.every(
      ({ document, declaration }) =>
        document === only.document && sameTarget(declaration, only.declaration),
    )
  ) {
    const documents = new Set(matched.map(({ document }) => document));
    throw invalidConfigFailure(
      loaded.display,
      ['suppress', index],
      `it matches ${String(matched.length)} declarations, at ${listPointers(matched.map(({ declaration }) => declaration.pointer))}`,
      `add ${documents.size > 1 ? 'resource, ' : ''}name, linkId or pointer to select one declaration`,
    );
  }

  const { document, analysis, declaration } = only;
  const pointers = new Set(
    analysis.declarations
      .filter((each) => sameTarget(each, declaration))
      .map(({ pointer }) => pointer),
  );
  const hidden = run.findings.filter(
    (finding) =>
      finding.kind === 'questionnaire' &&
      finding.ruleId === entry.rule &&
      finding.jsonLocation.file === document.file &&
      pointers.has(finding.jsonLocation.pointer),
  );
  if (hidden.length > 0) return { state: 'applied', hidden };
  return isEnabled(run.rules, entry.rule) && completesDeclarationCheck.has(entry.rule)
    ? { state: 'stale', ...declarationHidesNothing(entry.rule) }
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
  // Two entries with the same rule and selectors would otherwise share a fingerprint.
  const distinct = distinctFingerprints();
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
        // Fixed until --strict-suppressions; the rule set allows only warning or off.
        severity: 'warning',
        message: assessment.message,
        help: assessment.help,
        configLocation: { file: loaded.display, pointer: `/suppress/${String(index)}` },
        fingerprint: distinct(configFingerprint(staleSuppressionId, entry)),
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

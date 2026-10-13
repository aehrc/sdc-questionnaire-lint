import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import { describeError, LintFailure } from '../failure.js';
import type { AnalysedDocument } from '../inputs/read.js';
import { jsonPointerPattern } from '../json-pointer.js';
import { isObject } from '../object.js';
import { sdcPlugin } from '../plugins/builtin.js';
import type { ResolvedRule } from '../plugins/rule-set.js';
import type {
  RuleContext,
  RuleFinding,
  RuleRelatedLocation,
  Severity,
} from '../plugins/contract.js';
import type {
  ExpressionExcerpt,
  JsonLocation,
  OffsetRange,
  QuestionnaireFinding,
  ResourceIdentity,
} from '../report/types.js';
import {
  declarationKeys,
  distinctFingerprints,
  questionnaireFingerprint,
  siteKeys,
} from './fingerprint.js';

// Until the source mapper locates a finding's expression in FSH (source/map-findings.ts).
const unmapped = { status: 'unmapped', reason: 'source-unavailable' } as const;

function identity(resourceType: string, id: unknown, pointer: string): ResourceIdentity {
  return { resourceType, ...(typeof id === 'string' && id !== '' ? { id } : {}), pointer };
}

// The resource a pointer lies in: a contained resource of the Questionnaire, or the Questionnaire.
export function resourceAt(document: QuestionnaireDocument, pointer: string): ResourceIdentity {
  const { resource, resourcePointer } = document;
  const index = /^\/contained\/(\d+)(?:\/|$)/.exec(pointer.slice(resourcePointer.length))?.[1];
  if (index !== undefined && Array.isArray(resource.contained)) {
    const contained: unknown = resource.contained[Number(index)];
    const type = isObject(contained) ? contained.resourceType : undefined;
    if (isObject(contained) && typeof type === 'string' && type !== '') {
      return identity(type, contained.id, `${resourcePointer}/contained/${index}`);
    }
  }
  return identity('Questionnaire', resource.id, resourcePointer);
}

// The linkId of the innermost item a pointer lies in, below the Questionnaire's resource pointer:
// a pointer into a contained resource, or at the root, has none.
function linkIdAt(document: QuestionnaireDocument, pointer: string): string | undefined {
  const path = /^(?:\/item\/\d+(?=\/|$))+/.exec(
    pointer.slice(document.resourcePointer.length),
  )?.[0];
  let node: unknown = document.resource;
  let linkId: unknown;
  for (const index of path?.split('/item/').slice(1) ?? []) {
    node = isObject(node) && Array.isArray(node.item) ? node.item[Number(index)] : undefined;
    linkId = isObject(node) ? node.linkId : undefined;
  }
  return typeof linkId === 'string' ? linkId : undefined;
}

// The excerpt a finding at a site shows. A fragment's finding is shown in its query, with the
// rule's range rebased onto it, or over the whole fragment when the rule gave none
// (report-format.md § Findings and locations).
export function excerpt(
  site: ExpressionSite | undefined,
  range: OffsetRange | undefined,
): ExpressionExcerpt | undefined {
  if (site?.fragment !== undefined) {
    const { query, startOffset, endOffset } = site.fragment;
    return {
      text: query,
      range:
        range === undefined
          ? { startOffset, endOffset }
          : {
              startOffset: range.startOffset + startOffset,
              endOffset: range.endOffset + startOffset,
            },
    };
  }
  if (site?.text === undefined) return undefined;
  return { text: site.text, ...(range === undefined ? {} : { range }) };
}

// A rule's check as the runner calls it: an sdc rule (a CoreRule) also takes the analysis.
interface Checks<Args extends unknown[]> {
  check(...args: Args): unknown;
}

const severities: readonly unknown[] = ['error', 'warning', 'info'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isSeverity(value: unknown): value is Severity {
  return severities.includes(value);
}

function isOffset(value: unknown): value is number {
  return Number.isInteger(value);
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

// The message of a value a rule or a plugin threw, which may itself throw when read.
export function describeThrown(error: unknown): string {
  try {
    return describeError(error);
  } catch {
    return 'a value that cannot be described';
  }
}

// The site and pointer of a reported location, or what is wrong with them. A pointer is kept only
// when there is no site.
function parseLocation(
  site: unknown,
  pointer: unknown,
  sites: readonly ExpressionSite[],
  resourcePointer: string,
): Pick<RuleFinding, 'site' | 'pointer'> | string {
  // By identity: a copy of a site is not an expression site the linter found.
  const found = sites.find((each) => each === site);
  if (site !== undefined && found === undefined) return 'site is not one of ctx.sites';
  if (found !== undefined) return { site: found };
  if (pointer === undefined) return {};
  if (typeof pointer !== 'string') return 'pointer is not a string';
  if (!jsonPointerPattern.test(pointer)) {
    return `pointer ${JSON.stringify(pointer)} is not a JSON Pointer`;
  }
  if (pointer !== resourcePointer && !pointer.startsWith(`${resourcePointer}/`)) {
    return `pointer ${pointer} is outside the resource at ${resourcePointer}`;
  }
  return { pointer };
}

function parseRelatedLocations(
  related: unknown,
  sites: readonly ExpressionSite[],
  resourcePointer: string,
): RuleRelatedLocation[] | string {
  if (!Array.isArray(related)) return 'relatedLocations is not an array';
  const parsed: RuleRelatedLocation[] = [];
  for (const [index, each] of [...(related as unknown[])].entries()) {
    const at = `relatedLocations[${String(index)}]`;
    if (!isObject(each)) return `${at} is not an object`;
    const { site, pointer, message } = each;
    if (message !== undefined && !isNonEmptyString(message)) {
      return `${at}.message is not a non-empty string`;
    }
    if (site === undefined && pointer === undefined) return `${at} has no site or pointer`;
    const location = parseLocation(site, pointer, sites, resourcePointer);
    if (typeof location === 'string') return `${at}.${location}`;
    parsed.push({ ...location, ...(message === undefined ? {} : { message }) });
  }
  return parsed;
}

// A copy of a reported finding, judged by what the report schema and reporters rely on, or what
// is wrong with it. Each field is read once, so a rule cannot change it after the check.
function parseReportedFinding(
  reported: unknown,
  sites: readonly ExpressionSite[],
  { resourcePointer }: QuestionnaireDocument,
): RuleFinding | string {
  if (!isObject(reported)) return 'the finding is not an object';
  const { message, help, note, severity, site, pointer, range, relatedLocations } = reported;
  if (!isNonEmptyString(message)) return 'message is not a non-empty string';
  if (help !== undefined && !isNonEmptyString(help)) return 'help is not a non-empty string';
  if (note !== undefined && !isNonEmptyString(note)) return 'note is not a non-empty string';
  if (severity !== undefined && !isSeverity(severity)) {
    return 'severity is not error, warning or info';
  }
  const location = parseLocation(site, pointer, sites, resourcePointer);
  if (typeof location === 'string') return location;
  const found = location.site;
  let offsets: OffsetRange | undefined;
  if (range !== undefined) {
    // A fragment site's text is the fragment's; the runner rebases the range onto its query.
    const text = found?.text;
    if (text === undefined) return 'range needs a site with text';
    const { startOffset: start, endOffset: end } = isObject(range) ? range : {};
    if (!isOffset(start) || !isOffset(end) || start < 0 || start > end || end > text.length) {
      return (
        "range is not within the site's text: expected integer offsets with " +
        `0 <= startOffset <= endOffset <= ${String(text.length)}`
      );
    }
    offsets = { startOffset: start, endOffset: end };
  }
  const related =
    relatedLocations === undefined
      ? undefined
      : parseRelatedLocations(relatedLocations, sites, resourcePointer);
  if (typeof related === 'string') return related;
  return {
    message,
    ...(help === undefined ? {} : { help }),
    ...(note === undefined ? {} : { note }),
    ...(severity === undefined ? {} : { severity }),
    ...location,
    ...(offsets === undefined ? {} : { range: offsets }),
    ...(related === undefined ? {} : { relatedLocations: related }),
  };
}

// The Questionnaire a crash happened on, in a message: its file, and for a Bundle entry the
// resource's pointer, which text output does not otherwise show.
export function describeDocument({ file, resourcePointer }: QuestionnaireDocument): string {
  return resourcePointer === '' ? file : `${file} at ${resourcePointer}`;
}

// path is the file of the Questionnaire the rule crashed on.
function ruleCrashFailure(
  { id, namespace }: ResolvedRule,
  path: string,
  what: string,
): LintFailure {
  return new LintFailure({
    code: 'RULE_CRASH',
    ruleId: id,
    path,
    message: `rule ${id} ${what}`,
    help: `this is a bug in the ${namespace} plugin; report it to its maintainers`,
  });
}

// Where a finding came from: the document, and the site its rule reported it at, if any. The
// source mapper needs both, and the report keeps neither.
export interface FindingOrigin {
  readonly document: AnalysedDocument;
  readonly site?: ExpressionSite;
}

// Each finding's origin, by the finding object itself, from the rules to the source mapper
// (source/map-findings.ts). Stages in between pass findings on as they are, never as copies.
export type FindingOrigins = WeakMap<QuestionnaireFinding, FindingOrigin>;

// Calls each rule that is not off once on the document, at its effective severity. Built-in and
// plugin rules are treated alike: a throw, a promise or an invalid finding is a RULE_CRASH. Each
// finding's origin is recorded in origins, when given.
export function runRules(
  doc: AnalysedDocument,
  rules: readonly ResolvedRule[],
  origins?: FindingOrigins,
): QuestionnaireFinding[] {
  const { input, document, sites, analysis } = doc;
  const keys = siteKeys(document, sites);
  const declarations = declarationKeys(analysis.declarations);
  // Fingerprints name the file and resource, so they cannot repeat across documents.
  const distinct = distinctFingerprints();
  const findings: QuestionnaireFinding[] = [];
  // By identity, as parseLocation checks a reported site: a copy of a site gets no analysis.
  const known: ReadonlySet<ExpressionSite> = new Set(sites);
  // The document in a crash message.
  const on = describeDocument(document);

  // A site's location, or else the pointer's, or else the resource's. The linkId is the site's
  // item's, or that of the innermost item the pointer lies in.
  function jsonLocation({ site, pointer }: Pick<RuleFinding, 'site' | 'pointer'>): JsonLocation {
    const at = site?.pointer ?? pointer ?? document.resourcePointer;
    const linkId = site === undefined ? linkIdAt(document, at) : site.item?.linkId;
    return {
      file: document.file,
      pointer: at,
      resource: resourceAt(document, at),
      ...(linkId === undefined ? {} : { linkId }),
    };
  }

  function toFinding(id: string, severity: Severity, reported: RuleFinding): QuestionnaireFinding {
    const { site } = reported;
    const location = jsonLocation(reported);
    const { pointer, resource } = location;
    const expression = excerpt(site, reported.range);
    // A finding with no site is identified by the declaration at its pointer, or else by its
    // pointer below the resource.
    const key =
      (site === undefined ? declarations.get(pointer) : keys.get(site)) ??
      pointer.slice(document.resourcePointer.length);
    // A range is validated against the site's text, a fragment's own, before it is rebased.
    const { range } = reported;
    const span =
      range === undefined ? undefined : site?.text?.slice(range.startOffset, range.endOffset);
    return {
      kind: 'questionnaire',
      ruleId: id,
      severity: reported.severity ?? severity,
      message: reported.message,
      ...(reported.help === undefined ? {} : { help: reported.help }),
      ...(reported.note === undefined ? {} : { note: reported.note }),
      jsonLocation: location,
      sourceLocation: unmapped,
      ...(expression === undefined ? {} : { expression }),
      ...(reported.relatedLocations === undefined
        ? {}
        : {
            relatedLocations: reported.relatedLocations.map((related) => ({
              kind: 'questionnaire' as const,
              jsonLocation: jsonLocation(related),
              sourceLocation: unmapped,
              ...(related.message === undefined ? {} : { message: related.message }),
            })),
          }),
      fingerprint: distinct(
        questionnaireFingerprint({ ruleId: id, file: input.baseRelative, resource, key, span }),
      ),
    };
  }

  for (const resolved of rules) {
    const { id, namespace, rule, setting, compat } = resolved;
    if (setting === 'off') continue;
    // report() never throws, so a rule cannot swallow its own invalid finding: the first problem
    // is kept here, later reports are ignored, and the run fails once check returns.
    let problem: string | undefined;
    let promised = false;
    try {
      const ctx: RuleContext = {
        document,
        sites,
        // The same frozen array core uses after the rules run, never a copy.
        declarations: analysis.declarations,
        referencesAt: (site) => (known.has(site) ? analysis.references.get(site) : undefined),
        variablesAt: (site) => (known.has(site) ? analysis.variablesAt(site) : undefined),
        readsInput: (site) => (known.has(site) ? analysis.readsInput(site) : undefined),
        // The maps are keyed by the declarations themselves, so a copy gets nothing.
        dependenciesOf: (declaration) => analysis.dependencies.get(declaration),
        useOf: (declaration) => analysis.uses.get(declaration),
        compat,
        options: undefined,
        report: (reported) => {
          if (problem !== undefined) return;
          let checked: RuleFinding | string;
          try {
            checked = parseReportedFinding(reported, sites, document);
          } catch {
            // A getter on the finding threw.
            checked = 'reading the finding threw an exception';
          }
          if (typeof checked === 'string') problem = checked;
          else {
            const finding = toFinding(id, setting, checked);
            findings.push(finding);
            origins?.set(finding, {
              document: doc,
              ...(checked.site === undefined ? {} : { site: checked.site }),
            });
          }
        },
      };
      // Typed void, but a plugin's check may still return a promise. Only sdc rules, which a
      // plugin cannot register, receive the analysis.
      const returned =
        namespace === sdcPlugin.meta.name
          ? (rule as unknown as Checks<[RuleContext, DocumentAnalysis]>).check(ctx, analysis)
          : (rule as Checks<[RuleContext]>).check(ctx);
      // Inside the try: reading then, or calling it, runs plugin code too.
      if (isThenable(returned)) {
        promised = true;
        // Handled, so a rejection is never unhandled; whatever the rule does later is discarded.
        returned.then(undefined, () => undefined);
      }
    } catch (error) {
      throw ruleCrashFailure(resolved, document.file, `crashed on ${on}: ${describeThrown(error)}`);
    }
    if (promised) {
      throw ruleCrashFailure(
        resolved,
        document.file,
        `returned a promise on ${on}; check must be synchronous`,
      );
    }
    if (problem !== undefined) {
      throw ruleCrashFailure(
        resolved,
        document.file,
        `reported an invalid finding on ${on}: ${problem}`,
      );
    }
  }
  return findings;
}

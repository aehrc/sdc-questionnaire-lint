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
import { declarationKeys, questionnaireFingerprint, siteKeys } from './fingerprint.js';

// No source mapper yet.
const unmapped = { status: 'unmapped', reason: 'source-unavailable' } as const;

function identity(resourceType: string, id: unknown, pointer: string): ResourceIdentity {
  return { resourceType, ...(typeof id === 'string' && id !== '' ? { id } : {}), pointer };
}

// The resource a pointer lies in: a contained resource of the Questionnaire, or the Questionnaire.
function resourceAt(document: QuestionnaireDocument, pointer: string): ResourceIdentity {
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

// The excerpt a finding at a site shows. A fragment's finding is shown in its query, with the
// rule's range rebased onto it, or over the whole fragment when the rule gave none
// (report-format.md § Findings and locations).
function excerpt(
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

// The message of a value a rule threw, which may itself throw when read.
function describeThrown(error: unknown): string {
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

function ruleCrashFailure({ id, namespace }: ResolvedRule, what: string): LintFailure {
  return new LintFailure({
    code: 'RULE_CRASH',
    ruleId: id,
    message: `rule ${id} ${what}`,
    help: `this is a bug in the ${namespace} plugin; report it to its maintainers`,
  });
}

// Calls each rule that is not off once on the document, at its effective severity. Built-in and
// plugin rules are treated alike: a throw, a promise or an invalid finding is a RULE_CRASH.
export function runRules(
  doc: AnalysedDocument,
  rules: readonly ResolvedRule[],
): QuestionnaireFinding[] {
  const { input, document, sites, analysis } = doc;
  const keys = siteKeys(document, sites);
  const declarations = declarationKeys(analysis.declarations);
  const findings: QuestionnaireFinding[] = [];

  // A site's location, or else the pointer's, or else the resource's. The linkId is the site's
  // item's, or the item of a declaration at the pointer.
  function jsonLocation({ site, pointer }: Pick<RuleFinding, 'site' | 'pointer'>): JsonLocation {
    const at = site?.pointer ?? pointer ?? document.resourcePointer;
    const item =
      site === undefined
        ? analysis.declarations.find((declaration) => declaration.pointer === at)?.item
        : site.item;
    return {
      file: document.file,
      pointer: at,
      resource: resourceAt(document, at),
      ...(item?.linkId === undefined ? {} : { linkId: item.linkId }),
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
      fingerprint: questionnaireFingerprint({
        ruleId: id,
        file: input.baseRelative,
        resource,
        key,
      }),
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
        // A stub until the scope model exists (core-plan §3.1).
        scopeAt: () => ({ available: false, names: [] }),
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
          else findings.push(toFinding(id, setting, checked));
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
      throw ruleCrashFailure(resolved, `crashed: ${describeThrown(error)}`);
    }
    if (promised) {
      throw ruleCrashFailure(resolved, 'returned a promise; check must be synchronous');
    }
    if (problem !== undefined) {
      throw ruleCrashFailure(resolved, `reported an invalid finding: ${problem}`);
    }
  }
  return findings;
}

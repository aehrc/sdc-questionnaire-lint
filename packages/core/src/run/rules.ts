import { describeError, LintFailure } from '../failure.js';
import type { InputFile } from '../inputs/paths.js';
import { jsonPointerPattern } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { RegisteredRule } from '../plugins/registry.js';
import type {
  ExpressionSite,
  QuestionnaireDocument,
  RuleContext,
  RuleFinding,
  Severity,
} from '../plugins/types.js';
import type {
  ExpressionExcerpt,
  OffsetRange,
  QuestionnaireFinding,
  ResourceIdentity,
} from '../report/types.js';
import { questionnaireFingerprint, siteKeys } from './fingerprint.js';

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

const severities: readonly unknown[] = ['error', 'warning', 'info'];

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
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

// What is wrong with a reported finding, judged by what the report schema and reporters rely on;
// undefined when it is valid.
function invalidFinding(
  reported: unknown,
  sites: readonly ExpressionSite[],
  { resourcePointer }: QuestionnaireDocument,
): string | undefined {
  if (!isObject(reported)) return 'the finding is not an object';
  const { message, help, note, severity, site, pointer, range } = reported;
  if (!isNonEmptyString(message)) return 'message is not a non-empty string';
  if (help !== undefined && !isNonEmptyString(help)) return 'help is not a non-empty string';
  if (note !== undefined && !isNonEmptyString(note)) return 'note is not a non-empty string';
  if (severity !== undefined && !severities.includes(severity)) {
    return 'severity is not error, warning or info';
  }
  // By identity: a copy of a site is not a site the walker found.
  if (site !== undefined && !sites.includes(site as ExpressionSite)) {
    return 'site is not one of ctx.sites';
  }
  if (site === undefined && pointer !== undefined) {
    if (typeof pointer !== 'string' || !jsonPointerPattern.test(pointer)) {
      return `pointer ${JSON.stringify(pointer)} is not a JSON Pointer`;
    }
    if (pointer !== resourcePointer && !pointer.startsWith(`${resourcePointer}/`)) {
      return `pointer ${pointer} is outside the resource at ${resourcePointer}`;
    }
  }
  if (range !== undefined) {
    // A fragment site's text is the fragment's; the runner rebases the range onto its query.
    const text = (site as ExpressionSite | undefined)?.text;
    if (text === undefined) return 'range needs a site with text';
    const { startOffset: start, endOffset: end } = isObject(range) ? range : {};
    if (!isOffset(start) || !isOffset(end) || start < 0 || start > end || end > text.length) {
      return (
        "range is not within the site's text: expected integer offsets with " +
        `0 <= startOffset <= endOffset <= ${String(text.length)}`
      );
    }
  }
  return undefined;
}

function ruleCrash({ id, plugin }: RegisteredRule, what: string): LintFailure {
  return new LintFailure({
    code: 'RULE_CRASH',
    ruleId: id,
    message: `rule ${id} ${what}`,
    help: `this is a bug in the ${plugin} plugin; report it to its maintainers`,
  });
}

// Calls each rule that is not off once on the document, at its effective severity. Built-in and
// plugin rules are treated alike: a throw, a promise or an invalid finding is a RULE_CRASH.
export function runRules(
  doc: { input: InputFile; document: QuestionnaireDocument; sites: readonly ExpressionSite[] },
  rules: readonly RegisteredRule[],
): QuestionnaireFinding[] {
  const { input, document, sites } = doc;
  const keys = siteKeys(document, sites);
  const findings: QuestionnaireFinding[] = [];

  function toFinding(id: string, severity: Severity, reported: RuleFinding): QuestionnaireFinding {
    const { site } = reported;
    const pointer = site?.pointer ?? reported.pointer ?? document.resourcePointer;
    const resource = resourceAt(document, pointer);
    const expression = excerpt(site, reported.range);
    // A finding with no site is identified by its pointer below the resource.
    const key =
      (site === undefined ? undefined : keys.get(site)) ??
      pointer.slice(document.resourcePointer.length);
    return {
      kind: 'questionnaire',
      ruleId: id,
      severity: reported.severity ?? severity,
      message: reported.message,
      ...(reported.help === undefined ? {} : { help: reported.help }),
      ...(reported.note === undefined ? {} : { note: reported.note }),
      jsonLocation: {
        file: document.file,
        pointer,
        resource,
        ...(site?.item?.linkId === undefined ? {} : { linkId: site.item.linkId }),
      },
      // No source mapper yet.
      sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
      ...(expression === undefined ? {} : { expression }),
      fingerprint: questionnaireFingerprint({
        ruleId: id,
        file: input.baseRelative,
        resource,
        key,
      }),
    };
  }

  for (const registered of rules) {
    const { id, rule, severity } = registered;
    if (severity === 'off') continue;
    // report() never throws, so a rule cannot swallow its own invalid finding: the first problem
    // is kept here, later reports are ignored, and the run fails once check returns.
    let problem: string | undefined;
    let returned: unknown;
    try {
      // Typed void, but a plugin's check may still return a promise.
      returned = (rule as { check(ctx: RuleContext): unknown }).check({
        document,
        sites,
        // A stub until the scope model exists (core-plan §3.1).
        scopeAt: () => ({ available: false, names: [] }),
        options: undefined,
        report: (reported) => {
          if (problem !== undefined) return;
          problem = invalidFinding(reported, sites, document);
          if (problem === undefined) findings.push(toFinding(id, severity, reported));
        },
      });
    } catch (error) {
      throw ruleCrash(registered, `crashed: ${describeError(error)}`);
    }
    if (isThenable(returned)) {
      // Handled, so a rejection is never unhandled; whatever the rule does later is discarded.
      returned.then(undefined, () => undefined);
      throw ruleCrash(registered, 'returned a promise; check must be synchronous');
    }
    if (problem !== undefined) {
      throw ruleCrash(registered, `reported an invalid finding: ${problem}`);
    }
  }
  return findings;
}

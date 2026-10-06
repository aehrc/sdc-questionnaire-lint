import type { InputFile } from '../inputs/paths.js';
import { isObject } from '../object.js';
import type { RegisteredRule } from '../plugins/registry.js';
import type {
  ExpressionSite,
  QuestionnaireDocument,
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

// Calls each rule that is not off once on the document, at its effective severity. Built-in rules
// are trusted: what they report is not checked, and a crash propagates as a linter bug.
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

  for (const { id, rule, severity } of rules) {
    if (severity === 'off') continue;
    rule.check({
      document,
      sites,
      // A stub until the scope model exists (core-plan §3.1).
      scopeAt: () => ({ available: false, names: [] }),
      options: undefined,
      report: (reported) => {
        findings.push(toFinding(id, severity, reported));
      },
    });
  }
  return findings;
}

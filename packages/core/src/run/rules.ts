import type { InputFile } from '../inputs/paths.js';
import { isObject } from '../object.js';
import { sdcPlugin } from '../plugins/builtin.js';
import type {
  ExpressionSite,
  LintRule,
  QuestionnaireDocument,
  RuleFinding,
} from '../plugins/types.js';
import type { QuestionnaireFinding, ResourceIdentity } from '../report/types.js';
import { questionnaireFingerprint, siteKeys } from './fingerprint.js';

export interface Rule {
  id: string;
  rule: LintRule;
}

export const builtinRules: readonly Rule[] = Object.entries(sdcPlugin.rules).map(
  ([name, rule]) => ({ id: `${sdcPlugin.meta.name}/${name}`, rule }),
);

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

// Calls each rule once on the document, at its default severity. Built-in rules are trusted: what
// they report is not checked, and a crash propagates as a linter bug.
export function runRules(
  doc: { input: InputFile; document: QuestionnaireDocument; sites: readonly ExpressionSite[] },
  rules: readonly Rule[],
): QuestionnaireFinding[] {
  const { input, document, sites } = doc;
  const keys = siteKeys(document, sites);
  const findings: QuestionnaireFinding[] = [];

  function toFinding({ id, rule }: Rule, reported: RuleFinding): QuestionnaireFinding {
    const { site } = reported;
    const pointer = site?.pointer ?? reported.pointer ?? document.resourcePointer;
    const resource = resourceAt(document, pointer);
    // A finding with no site is identified by its pointer below the resource.
    const key =
      (site === undefined ? undefined : keys.get(site)) ??
      pointer.slice(document.resourcePointer.length);
    return {
      kind: 'questionnaire',
      ruleId: id,
      severity: reported.severity ?? rule.meta.defaultSeverity,
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
      ...(site?.text === undefined
        ? {}
        : {
            expression: {
              text: site.text,
              ...(reported.range === undefined ? {} : { range: reported.range }),
            },
          }),
      fingerprint: questionnaireFingerprint({
        ruleId: id,
        file: input.baseRelative,
        resource,
        key,
      }),
    };
  }

  for (const rule of rules) {
    rule.rule.check({
      document,
      sites,
      // A stub until the scope model exists (core-plan §3.1).
      scopeAt: () => ({ available: false, names: [] }),
      options: undefined,
      report: (reported) => {
        findings.push(toFinding(rule, reported));
      },
    });
  }
  return findings;
}

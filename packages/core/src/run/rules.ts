import { describeError, LintFailure } from '../failure.js';
import { isWithin, parsePointer } from '../json-pointer.js';
import type { RegisteredRule } from '../plugins/registry.js';
import type { QuestionnaireDocument, RuleContext, RuleFinding } from '../plugins/types.js';
import type { QuestionnaireFinding, ResourceIdentity, Severity } from '../report/types.js';
import { questionnaireFingerprint } from './fingerprint.js';
import { identifySite } from './site.js';
import type { SourceMap } from './source-map.js';

const severities: readonly unknown[] = ['error', 'warning', 'info'];

function resourceIdentity(document: QuestionnaireDocument): ResourceIdentity {
  const { id } = document.resource;
  return {
    resourceType: 'Questionnaire',
    ...(typeof id === 'string' && id !== '' ? { id } : {}),
    pointer: document.resourcePointer,
  };
}

function crash(
  rule: RegisteredRule,
  document: QuestionnaireDocument,
  problem: string,
): LintFailure {
  return new LintFailure({
    code: 'RULE_CRASH',
    ruleId: rule.id,
    path: document.file,
    message: `rule ${rule.id} failed on ${document.file}: ${problem}`,
    help: `report this to the maintainers of the ${rule.plugin} plugin; set "${rule.id}": "off" in the config to skip the rule meanwhile`,
  });
}

// Turns what a rule reported into a report finding: rule ID, severity, locations, fingerprint.
function toFinding(
  rule: RegisteredRule,
  document: QuestionnaireDocument,
  reported: RuleFinding,
  sourceMap: SourceMap,
): QuestionnaireFinding {
  if (typeof reported.message !== 'string' || reported.message === '') {
    throw crash(rule, document, 'it reported a finding without a message');
  }
  if (reported.severity !== undefined && !severities.includes(reported.severity)) {
    throw crash(
      rule,
      document,
      `it reported an invalid severity ${JSON.stringify(reported.severity)}`,
    );
  }
  const pointer = reported.site?.pointer ?? reported.pointer ?? document.resourcePointer;
  const segments = parsePointer(pointer);
  if (segments === undefined || !isWithin(pointer, document.resourcePointer)) {
    throw crash(rule, document, `it reported a location outside its Questionnaire: ${pointer}`);
  }
  const resourceSegments = parsePointer(document.resourcePointer)?.length ?? 0;
  const site = identifySite(document.resource, segments.slice(resourceSegments));
  const resource = resourceIdentity(document);
  // An expression string at the pointer becomes the excerpt; a range must fit inside it.
  const text = typeof site.value === 'string' ? site.value : undefined;
  const range =
    reported.range !== undefined &&
    text !== undefined &&
    reported.range.startOffset <= reported.range.endOffset &&
    reported.range.endOffset <= text.length
      ? reported.range
      : undefined;
  const severity: Severity =
    reported.severity ??
    (rule.effectiveSeverity === 'off' ? rule.defaultSeverity : rule.effectiveSeverity);

  return {
    kind: 'questionnaire',
    ruleId: rule.id,
    severity,
    message: reported.message,
    ...(reported.help === undefined ? {} : { help: reported.help }),
    ...(reported.note === undefined ? {} : { note: reported.note }),
    ...(rule.docsUrl === undefined ? {} : { docsUrl: rule.docsUrl }),
    jsonLocation: {
      file: document.file,
      pointer,
      resource,
      ...(site.linkId === undefined ? {} : { linkId: site.linkId }),
    },
    sourceLocation: sourceMap.locate(reported.site ?? { pointer }),
    ...(text === undefined
      ? {}
      : { expression: { text, ...(range === undefined ? {} : { range }) } }),
    fingerprint: questionnaireFingerprint({ ruleId: rule.id, file: document.file, resource, site }),
  };
}

// Calls each enabled rule once per document. Any exception fails the whole run (core-plan §5.1),
// so no partial findings survive a crash.
export function runRules({
  documents,
  rules,
  sourceMap,
}: {
  documents: readonly QuestionnaireDocument[];
  rules: readonly RegisteredRule[];
  sourceMap: SourceMap;
}): QuestionnaireFinding[] {
  const findings: QuestionnaireFinding[] = [];
  // The lint namespace reports while suppressions are assessed, not per Questionnaire.
  const enabled = rules.filter((rule) => rule.enabled && rule.plugin !== 'lint');
  for (const document of documents) {
    for (const rule of enabled) {
      const reported: QuestionnaireFinding[] = [];
      const context: RuleContext = {
        document,
        // Stubs until the walker and scope analysis exist (core-plan §3.1).
        sites: [],
        scopeAt: () => ({ available: false, names: [] }),
        options: undefined,
        report: (finding) => {
          reported.push(toFinding(rule, document, finding, sourceMap));
        },
      };
      try {
        rule.rule.check(context);
      } catch (error) {
        if (error instanceof LintFailure) throw error;
        throw crash(rule, document, describeError(error));
      }
      findings.push(...reported);
    }
  }
  return findings;
}

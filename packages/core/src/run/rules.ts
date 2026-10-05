import type { SiteIdentity, WalkedDocument } from '../analysis/walker.js';
import { describeError, LintFailure } from '../failure.js';
import type { InputFile } from '../inputs/paths.js';
import type { RegisteredRule } from '../plugins/registry.js';
import type { QuestionnaireDocument, RuleContext, RuleFinding } from '../plugins/types.js';
import type {
  OffsetRange,
  QuestionnaireFinding,
  ResourceIdentity,
  Severity,
} from '../report/types.js';
import { questionnaireFingerprint } from './fingerprint.js';
import type { SourceMap } from './source-map.js';

const severities: readonly unknown[] = ['error', 'warning', 'info'];

// A walked Questionnaire and the input file it was read from.
export interface RunDocument extends WalkedDocument {
  input: InputFile;
}

// A finding with the file and site identity behind it, which suppressions match on but the report
// omits.
export interface RuleResult {
  finding: QuestionnaireFinding;
  input: InputFile;
  site: SiteIdentity;
}

function resourceIdentity(document: QuestionnaireDocument): ResourceIdentity {
  const { id } = document.resource;
  return {
    resourceType: 'Questionnaire',
    ...(typeof id === 'string' && id !== '' ? { id } : {}),
    pointer: document.resourcePointer,
  };
}

function fitsText({ startOffset, endOffset }: OffsetRange, text: string): boolean {
  return (
    Number.isInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    startOffset >= 0 &&
    startOffset <= endOffset &&
    endOffset <= text.length
  );
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
  walked: RunDocument,
  reported: RuleFinding,
  sourceMap: SourceMap,
): RuleResult {
  const { document, input } = walked;
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
  const located = walked.locate(pointer);
  if (located === undefined) {
    throw crash(rule, document, `it reported a location outside its Questionnaire: ${pointer}`);
  }
  const site = located.identity;
  const resource = resourceIdentity(document);
  // An expression string at the pointer becomes the excerpt; a range must fit inside it.
  const text = typeof located.value === 'string' ? located.value : undefined;
  const range =
    reported.range !== undefined && text !== undefined && fitsText(reported.range, text)
      ? reported.range
      : undefined;
  const severity: Severity =
    reported.severity ??
    (rule.effectiveSeverity === 'off' ? rule.defaultSeverity : rule.effectiveSeverity);

  const finding: QuestionnaireFinding = {
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
    fingerprint: questionnaireFingerprint({
      ruleId: rule.id,
      file: input.baseRelative,
      resource,
      site,
    }),
  };
  return { finding, input, site };
}

// Calls each enabled rule once per document, with the same sites for every rule. Any exception
// fails the whole run (core-plan §5.1), so no partial findings survive a crash.
export function runRules({
  documents,
  rules,
  sourceMap,
}: {
  documents: readonly RunDocument[];
  rules: readonly RegisteredRule[];
  sourceMap: SourceMap;
}): RuleResult[] {
  const results: RuleResult[] = [];
  // The lint namespace reports while suppressions are assessed, not per Questionnaire.
  const enabled = rules.filter((rule) => rule.enabled && rule.plugin !== 'lint');
  for (const walked of documents) {
    const { document, sites } = walked;
    for (const rule of enabled) {
      const reported: RuleResult[] = [];
      const context: RuleContext = {
        document,
        sites,
        // A stub until the scope model exists (core-plan §3.1).
        scopeAt: () => ({ available: false, names: [] }),
        options: undefined,
        report: (finding) => {
          reported.push(toFinding(rule, walked, finding, sourceMap));
        },
      };
      try {
        rule.rule.check(context);
      } catch (error) {
        if (error instanceof LintFailure) throw error;
        throw crash(rule, document, describeError(error));
      }
      results.push(...reported);
    }
  }
  return results;
}

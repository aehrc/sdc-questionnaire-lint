import { definerOf } from '../analysis/available-variables.js';
import type { QuestionnaireDocument } from '../analysis/expression-site.js';
import { hostVariableProblem } from '../config/validate.js';
import { LintFailure } from '../failure.js';
import type { HostVariableHook } from '../plugins/rule-set.js';
import { describeDocument, describeThrown, isThenable } from './rules.js';

// The names a plugin's hostVariables hook supplies to a document, without the names FHIRPath, FHIR
// or SDC define: a built-in resolves first wherever it is available, and %qitem would otherwise
// resolve at the root, where SDC does not define it. A throw, a promise or a result that is not an
// array of names is a PLUGIN_CRASH.
export function suppliedHostVariables(
  { plugin, compat }: HostVariableHook,
  document: QuestionnaireDocument,
): string[] {
  const { name, version } = plugin.meta;
  const crash = (what: string): LintFailure =>
    new LintFailure({
      code: 'PLUGIN_CRASH',
      plugin: { name, version },
      path: document.file,
      message: `plugin ${name}@${version} ${what}`,
      help: `this is a bug in the ${name} plugin; report it to its maintainers`,
    });
  const on = describeDocument(document);
  const names: string[] = [];
  let promised = false;
  let problem: string | undefined;
  try {
    // Typed as an array, but a plugin may still return anything.
    const returned: unknown = plugin.hostVariables({ document, compat });
    // Everything that reads the result stays inside the try: a getter, a proxy or then runs plugin
    // code too.
    if (isThenable(returned)) {
      // Handled, so a rejection is never unhandled; whatever the hook does later is discarded.
      returned.then(undefined, () => undefined);
      promised = true;
    } else if (!Array.isArray(returned)) {
      problem = 'expected an array of names';
    } else {
      const result: readonly unknown[] = returned;
      // By index, not forEach, which skips the holes of a sparse array.
      for (let index = 0; index < result.length && problem === undefined; index++) {
        if (!(index in result)) {
          problem = `entry ${String(index)} is missing`;
          break;
        }
        const entry = result[index];
        const shape = hostVariableProblem(entry);
        if (shape !== undefined) problem = `entry ${String(index)}: ${shape.problem}`;
        else names.push(entry as string);
      }
    }
  } catch (error) {
    throw crash(`crashed in hostVariables on ${on}: ${describeThrown(error)}`);
  }
  if (promised) {
    throw crash(
      `returned a promise from hostVariables on ${on}; hostVariables must be synchronous`,
    );
  }
  if (problem !== undefined) {
    throw crash(`returned invalid host variables on ${on}: ${problem}`);
  }
  return names.filter((each) => definerOf(each) === undefined);
}

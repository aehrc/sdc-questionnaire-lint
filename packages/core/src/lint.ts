import pkg from '../package.json' with { type: 'json' };
import { countExpressions } from './analysis/fhirpath.js';
import { findSites } from './analysis/walker.js';
import { resolveRunPaths } from './config/paths.js';
import { collectInputs } from './inputs/collect.js';
import { sdcPlugin } from './plugins/builtin.js';
import { buildSummary } from './report/summary.js';
import type { CompletedReport } from './report/types.js';
import { builtinRules, runRules } from './run/rules.js';
import { findFshSources } from './run/sources.js';

export interface LintOptions {
  // The working directory: CLI paths are relative to it, and reports show paths relative to it.
  cwd: string;
  // CLI paths; when given, the run is targeted.
  paths?: readonly string[];
}

// One lint run. Returns the completed report, or throws a LintFailure for a run that cannot
// complete.
export async function lint(options: LintOptions): Promise<CompletedReport> {
  const { cwd } = options;
  const runPaths = resolveRunPaths({ cwd, config: null });
  const inputs = await collectInputs({ cwd, cliPaths: options.paths ?? [], runPaths });
  const sources = await findFshSources(runPaths, cwd);
  const documents = inputs.documents.map(({ input, document }) => ({
    input,
    document,
    sites: findSites(document),
  }));
  const findings = documents.flatMap((doc) => runRules(doc, builtinRules));

  return {
    schemaVersion: 1,
    status: 'completed',
    run: {
      tool: { name: 'sdc-questionnaire-lint', version: pkg.version },
      plugins: [{ name: sdcPlugin.meta.name, version: sdcPlugin.meta.version }],
      compat: {},
      selection: inputs.selection,
    },
    findings,
    summary: buildSummary({
      findings,
      files: inputs.files,
      questionnaires: inputs.documents.length,
      expressions: countExpressions(documents.flatMap(({ sites }) => sites)),
      suppressedFindings: 0,
      suppressions: { applied: 0, stale: 0, notAssessed: 0 },
      config: null,
      fshSources: sources.fshSources,
      fshSourceLookup: sources.fshSourceLookup,
    }),
  };
}

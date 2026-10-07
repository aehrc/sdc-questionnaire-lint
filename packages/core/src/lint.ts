import pkg from '../package.json' with { type: 'json' };
import { findExpressionSites } from './analysis/expression-sites.js';
import { countExpressions } from './analysis/fhirpath.js';
import { loadConfig } from './config/load.js';
import { resolveRunPaths } from './config/paths.js';
import { collectInputs } from './inputs/collect.js';
import { buildRuleRegistry } from './plugins/rule-registry.js';
import { buildSummary } from './report/summary.js';
import type { CompletedReport } from './report/types.js';
import { runRules } from './run/rules.js';
import { findFshSources } from './run/sources.js';
import { applySuppressions } from './run/suppressions.js';

export interface LintOptions {
  // The working directory: CLI paths are relative to it, and reports show paths relative to it.
  cwd: string;
  // CLI paths; when given, the run is targeted.
  paths?: readonly string[];
  // --config: used instead of discovery, relative to cwd.
  configPath?: string;
}

// One lint run. Returns the completed report, or throws a LintFailure for a run that cannot
// complete.
export async function lint(options: LintOptions): Promise<CompletedReport> {
  const { cwd } = options;
  // Loaded before inputs are read, so an invalid config fails the same way with or without them.
  const loaded = await loadConfig({
    cwd,
    ...(options.configPath === undefined ? {} : { explicitPath: options.configPath }),
  });
  // Also checks the plugins, and the rule IDs rules and suppress name.
  const registry = buildRuleRegistry(loaded);
  const runPaths = resolveRunPaths({ cwd, config: loaded });
  const inputs = await collectInputs({ cwd, cliPaths: options.paths ?? [], runPaths });
  const sources = await findFshSources(runPaths, cwd);
  const documents = inputs.documents.map(({ input, document }) => ({
    input,
    document,
    sites: findExpressionSites(document),
  }));
  const outcome = await applySuppressions({
    loaded,
    rules: registry.rules,
    selection: inputs.selection,
    inputs: inputs.inputs,
    documents,
    findings: documents.flatMap((doc) => runRules(doc, registry.rules)),
    cwd,
  });

  return {
    schemaVersion: 1,
    status: 'completed',
    run: {
      tool: { name: 'sdc-questionnaire-lint', version: pkg.version },
      plugins: registry.plugins,
      compat: {},
      selection: inputs.selection,
    },
    findings: outcome.findings,
    summary: buildSummary({
      findings: outcome.findings,
      files: inputs.files,
      questionnaires: inputs.documents.length,
      expressions: countExpressions(documents.flatMap(({ sites }) => sites)),
      suppressedFindings: outcome.suppressedFindings,
      suppressions: outcome.suppressions,
      config: loaded?.display ?? null,
      fshSources: sources.fshSources,
      fshSourceLookup: sources.fshSourceLookup,
    }),
  };
}

import pkg from '../package.json' with { type: 'json' };
import { selectConfig } from './config/discover.js';
import { loadConfig } from './config/load.js';
import { resolveRunPaths } from './config/paths.js';
import { collectInputs } from './inputs/collect.js';
import { buildRegistry } from './plugins/registry.js';
import { buildSummary } from './report/summary.js';
import type { CompletedReport } from './report/types.js';
import { runRules } from './run/rules.js';
import { createSourceMap } from './run/source-map.js';
import { applySuppressions, checkSuppressionRules } from './run/suppressions.js';
import { findFshSources } from './run/sources.js';

export interface LintOptions {
  // The working directory: CLI paths and configPath are relative to it, and reports show paths
  // relative to it.
  cwd: string;
  configPath?: string;
  // CLI paths; when given, the run is targeted.
  paths?: readonly string[];
}

// One lint run. Returns the completed report, or throws a LintFailure for a run that cannot
// complete. Config modules and plugins run inside it, so the CLI guards stdout around the call.
export async function lint(options: LintOptions): Promise<CompletedReport> {
  const { cwd } = options;
  const selected = await selectConfig({
    cwd,
    ...(options.configPath === undefined ? {} : { explicitPath: options.configPath }),
  });
  const loaded = selected === null ? null : await loadConfig(selected);
  const registry = buildRegistry(loaded);
  checkSuppressionRules(loaded, registry);
  const runPaths = resolveRunPaths({ cwd, config: loaded });
  const inputs = await collectInputs({ cwd, cliPaths: options.paths ?? [], runPaths });
  const sources = await findFshSources(runPaths, cwd);
  const sourceMap = createSourceMap({
    directories: sources.directories,
    sushiIndex: runPaths.sushiIndex,
  });

  const results = runRules({ documents: inputs.documents, rules: registry.rules, sourceMap });
  const { findings, suppressedFindings, suppressions } = await applySuppressions({
    cwd,
    loaded,
    registry,
    suppressionFiles: runPaths.suppressionFiles,
    selection: inputs.selection,
    inputFiles: inputs.inputFiles,
    results,
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
    findings,
    summary: buildSummary({
      findings,
      files: inputs.files,
      questionnaires: inputs.documents.length,
      // Zero until the walker discovers expression sites.
      expressions: { analysed: 0, unchecked: 0 },
      suppressedFindings,
      suppressions,
      config: loaded?.display ?? null,
      fshSources: sources.fshSources,
      fshSourceLookup: sources.fshSourceLookup,
    }),
  };
}

/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import pkg from '../package.json' with { type: 'json' };
import { analyseDocument } from './analysis/document-analysis.js';
import { findExpressionSites } from './analysis/expression-sites.js';
import { loadConfig } from './config/load.js';
import { resolveRunPaths } from './config/paths.js';
import { loadInputs } from './inputs/load-inputs.js';
import type { AnalysedDocument } from './inputs/read.js';
import { incompleteSites } from './plugins/builtin.js';
import { type ResolvedRule, resolveRuleSet } from './plugins/rule-set.js';
import { summarizeExpressionCoverage } from './report/expression-coverage.js';
import { buildSummary } from './report/summary.js';
import type { CompletedReport } from './report/types.js';
import { suppliedHostVariables } from './run/host-variables.js';
import { runRules, type FindingOrigins } from './run/rules.js';
import { findFshSources } from './run/sources.js';
import { findSushiVersion } from './run/sushi-version.js';
import { applySuppressions } from './run/suppressions.js';
import { mapSourceLocations } from './source/map-findings.js';

export interface LintOptions {
  // The working directory: CLI paths are relative to it, and reports show paths relative to it.
  cwd: string;
  // CLI paths; when given, the run is targeted.
  paths?: readonly string[];
  // --config: used instead of discovery, relative to cwd.
  configPath?: string;
}

export interface LintRun {
  report: CompletedReport;
  // Every registered rule, sorted by ID, including rules configured off; for reporters that
  // describe rules, such as SARIF. The report itself carries no rule metadata.
  rules: readonly ResolvedRule[];
}

// One lint run. Returns the completed report, or throws a LintFailure for a run that cannot
// complete.
export async function lint(options: LintOptions): Promise<CompletedReport> {
  return (await lintWithRules(options)).report;
}

// lint() with the run's resolved rules as well, so the CLI does not load the config, and run its
// plugin code, a second time to describe them. Internal: index.ts does not export it.
export async function lintWithRules(options: LintOptions): Promise<LintRun> {
  const { cwd } = options;
  // Loaded before inputs are read, so an invalid config fails the same way with or without them.
  const loaded = await loadConfig({
    cwd,
    ...(options.configPath === undefined ? {} : { explicitPath: options.configPath }),
  });
  // Also checks the plugins, and the rule IDs rules and suppress name.
  const ruleSet = resolveRuleSet(loaded);
  const runPaths = resolveRunPaths({ cwd, config: loaded });
  const { documents, inputFiles, fileCounts, runKind } = await loadInputs({
    cwd,
    cliPaths: options.paths ?? [],
    runPaths,
  });
  const sources = await findFshSources(runPaths, cwd);
  const sushiVersion = await findSushiVersion(runPaths.base);
  const configNames = loaded?.config.hostVariables ?? [];
  // Every document is analysed before any rule runs, so a hook's crash wins over a rule's.
  const analysedDocuments: AnalysedDocument[] = documents.map(({ input, document }) => {
    // Called whether or not the plugin's rules are on: listing a plugin activates its names.
    const hostVariables = [
      ...configNames,
      ...ruleSet.hostVariableHooks.flatMap((hook) => suppliedHostVariables(hook, document)),
    ];
    const sites = findExpressionSites(document);
    return { input, document, sites, analysis: analyseDocument(document, sites, hostVariables) };
  });
  const origins: FindingOrigins = new WeakMap();
  const outcome = await applySuppressions({
    loaded,
    rules: ruleSet.rules,
    runKind,
    inputFiles,
    documents: analysedDocuments,
    findings: analysedDocuments.flatMap((doc) => runRules(doc, ruleSet.rules, origins)),
    cwd,
  });
  // Only the findings that will be reported are mapped.
  const findings = await mapSourceLocations(outcome.findings, origins, {
    directories: sources.directories,
    sushiIndex: runPaths.sushiIndex,
    cwd,
  });

  const report: CompletedReport = {
    schemaVersion: 1,
    status: 'completed',
    run: {
      tool: { name: 'sdc-questionnaire-lint', version: pkg.version },
      plugins: ruleSet.pluginVersions,
      compat: ruleSet.compat,
      selection: runKind,
      ...(sushiVersion === undefined ? {} : { sushi: { version: sushiVersion } }),
    },
    findings,
    summary: buildSummary({
      findings,
      files: fileCounts,
      questionnaires: documents.length,
      expressions: summarizeExpressionCoverage(
        analysedDocuments.flatMap(({ sites }) => sites),
        incompleteSites(analysedDocuments, ruleSet.rules),
      ),
      suppressedFindings: outcome.suppressedFindings,
      suppressions: outcome.suppressions,
      config: loaded?.display ?? null,
      fshSources: sources.fshSources,
      fshSourceLookup: sources.fshSourceLookup,
    }),
  };
  return { report, rules: ruleSet.rules };
}

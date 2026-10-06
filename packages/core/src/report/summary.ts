import type { Finding, Summary } from './types.js';

// Everything except the severity counts comes from the run as is.
export type SummaryInput = Omit<Summary, 'errors' | 'warnings' | 'info'> & {
  // Unsuppressed findings, before any text visibility filtering such as hiding info.
  findings: readonly Finding[];
};

export function buildSummary(input: SummaryInput): Summary {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const finding of input.findings) counts[finding.severity]++;
  return {
    files: { ...input.files },
    questionnaires: input.questionnaires,
    expressions: { ...input.expressions },
    errors: counts.error,
    warnings: counts.warning,
    info: counts.info,
    suppressedFindings: input.suppressedFindings,
    suppressions: { ...input.suppressions },
    config: input.config,
    fshSources: [...input.fshSources],
    fshSourceLookup: input.fshSourceLookup,
  };
}

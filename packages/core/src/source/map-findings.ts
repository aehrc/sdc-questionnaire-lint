import type { Finding, QuestionnaireFinding, SourceMapResult } from '../report/types.js';
import { findingOrigin, type FindingOrigin, type TracedFinding } from '../run/rules.js';
import { canonical, fshFiles } from './fsh-files.js';
import { locateExpression, sourceContext, type SourceContext } from './locate.js';
import { readSushiIndex } from './sushi-index.js';

export interface SourceMapOptions {
  // The existing FSH directories (run/sources.ts); empty when none exist or lookup is omitted.
  readonly directories: readonly string[];
  // The SUSHI index's path, whether or not it exists.
  readonly sushiIndex: string;
  readonly cwd: string;
}

// An exception while mapping one finding leaves it not-found; mapping never fails the run.
async function sourceLocation(
  finding: QuestionnaireFinding,
  origin: FindingOrigin,
  context: SourceContext,
): Promise<SourceMapResult> {
  try {
    return await locateExpression(
      { document: origin.document, site: origin.site, expression: finding.expression },
      context,
    );
  } catch {
    return { status: 'unmapped', reason: 'not-found' };
  }
}

// Gives each Questionnaire finding its FSH location, or the reason it has none, and removes the
// origin it carried; it changes nothing else: fingerprints, severities and counts stay as they
// are. Runs on the findings that will be reported, so after suppressions, and reads the FSH
// sources only when one of them is a Questionnaire finding. Without FSH directories, findings
// keep source-unavailable.
export async function mapSourceLocations(
  findings: readonly Finding[],
  options: SourceMapOptions,
): Promise<Finding[]> {
  const context =
    options.directories.length === 0 || !findings.some(({ kind }) => kind === 'questionnaire')
      ? undefined
      : sourceContext(
          await readSushiIndex(options.sushiIndex),
          fshFiles(options.directories),
          (await canonical(options.cwd)) ?? options.cwd,
        );
  const mapped: Finding[] = [];
  for (const each of findings) {
    if (each.kind !== 'questionnaire') {
      mapped.push(each);
      continue;
    }
    const { [findingOrigin]: origin, ...finding }: TracedFinding = each;
    mapped.push(
      context === undefined || origin === undefined
        ? finding
        : { ...finding, sourceLocation: await sourceLocation(finding, origin, context) },
    );
  }
  return mapped;
}

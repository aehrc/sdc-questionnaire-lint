import type { Finding } from '../report/types.js';
import type { FindingOrigins } from '../run/rules.js';
import { canonical, fshFiles } from './fsh-files.js';
import { locateExpression, sourceContext, unmapped, type SourceContext } from './locate.js';
import { readSushiIndex } from './sushi-index.js';

export interface SourceMapOptions {
  // The existing FSH directories (run/sources.ts); empty when none exist or lookup is omitted.
  readonly directories: readonly string[];
  // The SUSHI index's path, whether or not it exists.
  readonly sushiIndex: string;
  readonly cwd: string;
}

// Gives each Questionnaire finding its FSH location, or the reason it has none, by its origin; it
// changes nothing else: fingerprints, severities and counts stay as they are. Runs on the findings
// that will be reported, so after suppressions, and reads the FSH sources only when one of them is
// a Questionnaire finding. Without FSH directories, or without an origin, findings keep
// source-unavailable.
export async function mapSourceLocations(
  findings: readonly Finding[],
  origins: FindingOrigins,
  options: SourceMapOptions,
): Promise<Finding[]> {
  // Built once per run: its caches are shared by every finding.
  const context = await runContext(options, findings);
  const mapped: Finding[] = [];
  // One finding at a time, so the FSH files are read once each and never all at once.
  for (const finding of findings) mapped.push(await mapFinding(finding, origins, context));
  return mapped;
}

// What the run maps against, or undefined when there is nothing to map or nothing to map against.
async function runContext(
  options: SourceMapOptions,
  findings: readonly Finding[],
): Promise<SourceContext | undefined> {
  if (options.directories.length === 0 || !findings.some(({ kind }) => kind === 'questionnaire')) {
    return undefined;
  }
  return sourceContext(
    await readSushiIndex(options.sushiIndex),
    fshFiles(options.directories),
    (await canonical(options.cwd)) ?? options.cwd,
  );
}

async function mapFinding(
  finding: Finding,
  origins: FindingOrigins,
  context: SourceContext | undefined,
): Promise<Finding> {
  if (finding.kind !== 'questionnaire' || context === undefined) return finding;
  const origin = origins.get(finding);
  if (origin === undefined) return finding;
  return {
    ...finding,
    // An exception while mapping one finding leaves it not-found; it never fails the run.
    sourceLocation: await locateExpression(
      { document: origin.document, site: origin.site, expression: finding.expression },
      context,
    ).catch(() => unmapped('not-found')),
  };
}

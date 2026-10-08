import { realpath } from 'node:fs/promises';
import type { Finding, QuestionnaireFinding, SourceMapResult } from '../report/types.js';
import type { FindingOrigin } from '../run/rules.js';
import { fshFiles } from './fsh-files.js';
import { locateExpression, type SourceContext } from './locate.js';
import { readSushiIndex } from './sushi-index.js';

export interface SourceMapOptions {
  // The existing FSH directories (run/sources.ts); empty when none exist or lookup is omitted.
  readonly directories: readonly string[];
  // The SUSHI index's path, whether or not it exists.
  readonly sushiIndex: string;
  readonly cwd: string;
}

async function canonical(directory: string): Promise<string> {
  try {
    return await realpath(directory);
  } catch {
    return directory;
  }
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

// Gives each Questionnaire finding its FSH location, or the reason it has none, and changes
// nothing else: fingerprints, severities and counts stay as they are. Runs on the findings that
// will be reported, so after suppressions, and reads the FSH sources only when one of them is a
// Questionnaire finding. Without FSH directories, findings keep source-unavailable.
export async function mapSourceLocations(
  findings: readonly Finding[],
  origins: ReadonlyMap<QuestionnaireFinding, FindingOrigin>,
  options: SourceMapOptions,
): Promise<Finding[]> {
  if (options.directories.length === 0 || !findings.some(({ kind }) => kind === 'questionnaire')) {
    return [...findings];
  }
  const context: SourceContext = {
    index: await readSushiIndex(options.sushiIndex),
    files: fshFiles(options.directories),
    cwd: await canonical(options.cwd),
  };
  const mapped: Finding[] = [];
  for (const finding of findings) {
    const origin = finding.kind === 'questionnaire' ? origins.get(finding) : undefined;
    if (finding.kind !== 'questionnaire' || origin === undefined) {
      mapped.push(finding);
      continue;
    }
    mapped.push({ ...finding, sourceLocation: await sourceLocation(finding, origin, context) });
  }
  return mapped;
}

import type { Finding } from '../report/types.js';
import type { FindingOrigin, FindingOrigins } from '../run/rules.js';
import { canonical, fshFiles } from './fsh-files.js';
import { locateExpression, sourceContext, unmapped, type SourceContext } from './locate.js';
import { readSushiIndex } from './sushi-index.js';

export interface SourceMapOptions {
  readonly directories: readonly string[];
  readonly sushiIndex: string;
  readonly cwd: string;
}

const invalidFinding = (
  finding: Finding,
  sourceContext?: SourceContext,
  findingOrigin?: FindingOrigin,
): boolean =>
  finding.kind !== 'questionnaire' || sourceContext === undefined || findingOrigin === undefined;

async function mapFinding(
  finding: Finding,
  sourceContext?: SourceContext,
  findingOrigin?: FindingOrigin,
) {
  const defaultFinding = {
    ...finding,
    sourceLocation: unmapped('not-found'),
  };

  if (sourceContext === undefined || findingOrigin === undefined) {
    return defaultFinding;
  }

  const localeTarget = {
    document: findingOrigin.document,
    site: findingOrigin.site,
    expression: finding.expression,
  };

  defaultFinding.sourceLocation = await locateExpression(localeTarget, sourceContext).catch(() =>
    unmapped('not-found'),
  );

  return defaultFinding;
}

const invalidDataForContext = (options: SourceMapOptions, findings: readonly Finding[]) =>
  options.directories.length === 0 || !findings.some(({ kind }) => kind === 'questionnaire');

async function buildContext(
  options: SourceMapOptions,
  findings: readonly Finding[],
): Promise<SourceContext | undefined> {
  return invalidDataForContext(options, findings)
    ? undefined
    : sourceContext(
        await readSushiIndex(options.sushiIndex),
        fshFiles(options.directories),
        (await canonical(options.cwd)) ?? options.cwd,
      );
}

const mapSourceLocation = async (
  finding: Finding,
  sourceContext: SourceContext | undefined,
  origins: FindingOrigins,
) => {
  const origin = finding.kind === 'questionnaire' ? origins.get(finding) : undefined;
  return invalidFinding(finding, sourceContext, origin)
    ? finding
    : await mapFinding(finding, sourceContext, origin);
};

// Gives each Questionnaire finding its FSH location, or the reason it has none, by its origin;
export const mapSourceLocations = async (
  findings: readonly Finding[],
  origins: FindingOrigins,
  options: SourceMapOptions,
): Promise<Finding[]> =>
  await Promise.all(
    findings.map(async (finding) =>
      mapSourceLocation(finding, await buildContext(options, findings), origins),
    ),
  );

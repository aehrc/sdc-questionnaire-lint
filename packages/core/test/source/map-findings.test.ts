import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysedDocument } from '../../src/inputs/read.js';
import type { QuestionnaireFinding } from '../../src/report/types.js';
import { findingOrigin, type FindingOrigin, type TracedFinding } from '../../src/run/rules.js';
import { mapSourceLocations } from '../../src/source/map-findings.js';
import {
  expressionSite,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';
import { tempTree } from '../support/tmp.js';

function traced(finding: QuestionnaireFinding, origin: FindingOrigin): TracedFinding {
  return { ...finding, [findingOrigin]: origin };
}

describe('mapSourceLocations', () => {
  it('keeps every finding as it is, without its origin, when there are no FSH directories', async () => {
    const finding = questionnaireFinding();
    const findings = await mapSourceLocations(
      [traced(finding, { document: {} as AnalysedDocument })],
      { directories: [], sushiIndex: 'fsh-index.json', cwd: '.' },
    );
    expect(findings).toEqual([finding]);
    expect(Object.getOwnPropertySymbols(findings[0])).toEqual([]);
  });

  it('leaves a finding not-found when mapping it throws, and passes config findings through', async () => {
    const dir = await tempTree({ 'input/fsh/A.fsh': 'Instance: A\nInstanceOf: Questionnaire\n' });
    const finding = questionnaireFinding({ expression: { text: '%a' } });
    const config = staleSuppressionFinding();
    // A document without its Questionnaire makes the mapper throw once it reaches the site.
    // The copy stands for any step between the rules and the mapper; the origin survives it.
    const copied = {
      ...traced(finding, {
        document: {} as AnalysedDocument,
        site: expressionSite({ text: '%a' }),
      }),
    };
    const [mapped, passed] = await mapSourceLocations([copied, config], {
      directories: [path.join(dir, 'input/fsh')],
      sushiIndex: path.join(dir, 'fsh-generated/data/fsh-index.json'),
      cwd: dir,
    });
    expect(mapped).toEqual({
      ...finding,
      sourceLocation: { status: 'unmapped', reason: 'not-found' },
    });
    expect(passed).toBe(config);
  });
});

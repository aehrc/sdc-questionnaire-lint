import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysedDocument } from '../../src/inputs/read.js';
import { mapSourceLocations } from '../../src/source/map-findings.js';
import {
  expressionSite,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';
import { tempTree } from '../support/tmp.js';

describe('mapSourceLocations', () => {
  it('keeps every finding as it is when there are no FSH directories', async () => {
    const finding = questionnaireFinding();
    const origins = new Map([[finding, { document: {} as AnalysedDocument }]]);
    const findings = await mapSourceLocations([finding], origins, {
      directories: [],
      sushiIndex: 'fsh-index.json',
      cwd: '.',
    });
    expect(findings).toEqual([finding]);
  });

  it('leaves a finding not-found when mapping it throws, and passes config findings through', async () => {
    const dir = await tempTree({ 'input/fsh/A.fsh': 'Instance: A\nInstanceOf: Questionnaire\n' });
    const finding = questionnaireFinding({ expression: { text: '%a' } });
    const config = staleSuppressionFinding();
    // A document without its Questionnaire makes the mapper throw once it reaches the site.
    const origins = new Map([
      [finding, { document: {} as AnalysedDocument, site: expressionSite({ text: '%a' }) }],
    ]);
    const [mapped, passed] = await mapSourceLocations([finding, config], origins, {
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

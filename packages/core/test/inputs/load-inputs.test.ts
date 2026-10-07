import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRunPaths } from '../../src/config/paths.js';
import { loadInputs } from '../../src/inputs/load-inputs.js';
import { tempTree } from '../support/tmp.js';

const patient = JSON.stringify({ resourceType: 'Patient' });

async function load(cwd: string, cliPaths: string[] = []) {
  return loadInputs({ cwd, cliPaths, runPaths: resolveRunPaths({ cwd, config: null }) });
}

describe('loadInputs', () => {
  it('returns the run kind with the documents and counts', async () => {
    const cwd = await tempTree({
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
      }),
      'fsh-generated/resources/Patient-P.json': patient,
    });
    const inputs = await load(cwd);
    expect(inputs).toMatchObject({ runKind: 'full', fileCounts: { read: 2, skipped: 1 } });
    expect(inputs.documents).toHaveLength(1);
  });

  it('fails on a directory of other resources, naming it, without the SUSHI hint', async () => {
    const cwd = await tempTree({ 'other/Patient-P.json': patient });
    await expect(load(cwd, ['other'])).rejects.toMatchObject({
      code: 'NO_QUESTIONNAIRES',
      path: 'other',
      message: 'no Questionnaires found in other',
      help: 'pass paths to Questionnaire or Bundle JSON files, or list them in files in the config',
    });
  });

  it('adds the SUSHI hint when the default directory is missing', async () => {
    const cwd = await tempTree();
    await expect(load(cwd)).rejects.toMatchObject({
      code: 'NO_QUESTIONNAIRES',
      path: 'fsh-generated/resources',
      message: 'no Questionnaires found in fsh-generated/resources',
      help: 'run sushi . to generate fsh-generated/resources, then lint again; or pass paths to Questionnaire or Bundle JSON files, or list them in files in the config',
    });
  });

  it('names the IG directory in the SUSHI hint for a config in a subdirectory', async () => {
    const cwd = await tempTree({ 'ig/': '' });
    const runPaths = resolveRunPaths({ cwd, config: { dir: path.join(cwd, 'ig'), config: {} } });
    await expect(loadInputs({ cwd, cliPaths: [], runPaths })).rejects.toMatchObject({
      path: 'ig/fsh-generated/resources',
      help: expect.stringMatching(
        /^run sushi ig to generate ig\/fsh-generated\/resources, then lint again;/,
      ) as unknown,
    });
  });

  it('adds the SUSHI hint when the default directory is empty', async () => {
    const cwd = await tempTree({ 'fsh-generated/resources/': '' });
    await expect(load(cwd)).rejects.toMatchObject({
      help: expect.stringMatching(/^run sushi \. to generate/) as unknown,
    });
  });

  it('omits the SUSHI hint for an explicit path, and lists at most three inputs', async () => {
    const files = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((name) => [`${name}.json`, patient]),
    );
    const cwd = await tempTree(files);
    await expect(load(cwd, Object.keys(files))).rejects.toMatchObject({
      code: 'NO_QUESTIONNAIRES',
      message: 'no Questionnaires found in a.json, b.json, c.json and 2 more',
      help: 'pass paths to Questionnaire or Bundle JSON files, or list them in files in the config',
    });
  });
});

import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { lintWithPlugin } from './support/lint.js';

const files = {
  'Questionnaire-A.json': JSON.stringify({
    resourceType: 'Questionnaire',
    id: 'A',
    status: 'draft',
  }),
};

describe('the smart-forms plugin', () => {
  it('loads with its version and adds no findings', async () => {
    const report = await lintWithPlugin(files);
    expect(report.run.plugins).toEqual([
      { name: 'sdc', version: expect.any(String) as string },
      { name: 'smart-forms', version: pkg.version },
    ]);
    expect(report.findings).toEqual([]);
  });

  it('checks against the newest verified versions without a compat entry', async () => {
    const report = await lintWithPlugin(files);
    expect(report.run.compat).toEqual({
      'smart-forms': { renderer: '1.4.0', populate: '4.7.1', 'template-extract': '1.0.15' },
    });
  });

  it('resolves latest to the same versions', async () => {
    const report = await lintWithPlugin(files, "compat: { 'smart-forms': 'latest' }");
    expect(report.run.compat['smart-forms']).toEqual({
      renderer: '1.4.0',
      populate: '4.7.1',
      'template-extract': '1.0.15',
    });
  });

  it('accepts renderer and populate without template-extract', async () => {
    const report = await lintWithPlugin(
      files,
      "compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } }",
    );
    expect(report.run.compat).toEqual({ 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } });
  });

  it('requires populate in an explicit compat object', async () => {
    await expect(
      lintWithPlugin(files, "compat: { 'smart-forms': { renderer: '1.4.0' } }"),
    ).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      help: expect.stringContaining('4.7.1') as string,
    });
  });

  it('rejects an unverified version, listing the verified ones', async () => {
    await expect(
      lintWithPlugin(files, "compat: { 'smart-forms': { renderer: '1.5.0', populate: '4.7.1' } }"),
    ).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      help: 'set renderer to a verified version: 1.4.0',
    });
  });
});

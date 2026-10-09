import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type CompletedReport, lint } from 'sdc-questionnaire-lint';
import { onTestFinished } from 'vitest';

const plugin = pathToFileURL(path.resolve(import.meta.dirname, '../../dist/index.js')).href;

// Lints the given files with the built plugin listed in a temporary .mjs config. config is the
// source of the rest of the config object, such as "compat: { 'smart-forms': 'latest' }".
export async function lintWithPlugin(
  files: Record<string, string>,
  config = '',
): Promise<CompletedReport> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'sdc-lint-plugin-'));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(
    path.join(cwd, 'sdc-questionnaire-lint.config.mjs'),
    `import smartForms from ${JSON.stringify(plugin)};\n` +
      `export default { files: ${JSON.stringify(Object.keys(files))}, plugins: [smartForms], ${config} };\n`,
  );
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(cwd, name), content);
  }
  return lint({ cwd });
}

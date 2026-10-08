import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import { resolveRunPaths } from '../../src/config/paths.js';
import { loadInputs } from '../../src/inputs/load-inputs.js';
import type { ExpressionExcerpt } from '../../src/report/types.js';
import { resourceAt } from '../../src/run/rules.js';
import { findFshSources } from '../../src/run/sources.js';
import { parseFshDocument } from '../../src/source/fsh-document.js';
import { fshFiles } from '../../src/source/fsh-files.js';
import { decodeFshString } from '../../src/source/fsh-string.js';
import { locateExpression } from '../../src/source/locate.js';
import { readSushiIndex } from '../../src/source/sushi-index.js';

// The SUSHI-compiled projects in fixtures/source-map (see its README).
const fixtures = fileURLToPath(new URL('../fixtures/source-map/', import.meta.url));

// Every expression site of a project's compiled JSON, located as a finding over the whole
// expression would be: `resource pointer` to `confidence file:line:column`, or the reason.
async function locateEverySite(project: string): Promise<[string, string][]> {
  const cwd = await realpath(path.join(fixtures, project));
  const runPaths = resolveRunPaths({ cwd, config: null });
  const { documents } = await loadInputs({ cwd, cliPaths: [], runPaths });
  const context = {
    index: await readSushiIndex(runPaths.sushiIndex),
    files: fshFiles((await findFshSources(runPaths, cwd)).directories),
    cwd,
  };
  const rows: [string, string][] = [];
  for (const { input, document } of documents) {
    const sites = findExpressionSites(document);
    for (const site of sites) {
      if (site.text === undefined) continue;
      const expression: ExpressionExcerpt =
        site.fragment === undefined
          ? { text: site.text }
          : {
              text: site.fragment.query,
              range: { startOffset: site.fragment.startOffset, endOffset: site.fragment.endOffset },
            };
      const result = await locateExpression(
        { document: { input, document, sites }, site, expression },
        context,
      );
      const { resourceType, id = '' } = resourceAt(document, site.pointer);
      const fragment = site.fragment === undefined ? '' : ` {{${site.text}}}`;
      const key = `${resourceType}/${id}${fragment} ${site.pointer}`;
      if (result.status === 'unmapped') {
        rows.push([key, result.reason]);
        continue;
      }
      // The source under the range, decoded, must be the expression the range covers.
      const { file, line, column, endLine, endColumn } = result.location;
      const { text, lineStarts } = parseFshDocument(await readFile(path.join(cwd, file), 'utf8'));
      const at = (l: number, c: number) => (lineStarts[l - 1] ?? 0) + c - 1;
      const source = text.slice(at(line, column), at(endLine, endColumn));
      const { startOffset = 0, endOffset = expression.text.length } = expression.range ?? {};
      expect(decodeFshString(`"${source}"`)?.value, key).toBe(
        expression.text.slice(startOffset, endOffset),
      );
      rows.push([key, `${result.confidence} ${file}:${String(line)}:${String(column)}`]);
    }
  }
  return rows;
}

describe('source mapping of the SUSHI-compiled fixtures', () => {
  it('maps every expression of forms to its line, or gives the reason it cannot', async () => {
    expect(await locateEverySite('forms')).toEqual([
      // Inline.fsh: an inline Questionnaire in a Bundle, found by id and InstanceOf.
      [
        'Questionnaire/dup /entry/0/resource/extension/0/valueExpression/expression',
        'exact input/fsh/Inline.fsh:16:53',
      ],
      // Anchors.fsh: two variables told apart by name.
      [
        'Questionnaire/Anchors /extension/0/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:9:56',
      ],
      [
        'Questionnaire/Anchors /extension/1/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:12:56',
      ],
      // Sibling items told apart by a linkId assigned after the expression.
      [
        'Questionnaire/Anchors /item/0/extension/0/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:17:21',
      ],
      [
        'Questionnaire/Anchors /item/1/extension/0/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:24:21',
      ],
      // One item with the same text under two extensions, told apart by extension.
      [
        'Questionnaire/Anchors /item/2/extension/0/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:33:91',
      ],
      [
        'Questionnaire/Anchors /item/2/extension/1/valueExpression/expression',
        'anchored input/fsh/Anchors.fsh:35:88',
      ],
      // Nothing tells these two apart.
      ['Questionnaire/Anchors /item/3/extension/0/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/Anchors /item/3/extension/1/valueExpression/expression', 'ambiguous'],
      // Crlf.fsh: CRLF line endings.
      [
        'Questionnaire/Crlf /extension/0/valueExpression/expression',
        'exact input/fsh/Crlf.fsh:8:53',
      ],
      // Inline.fsh: a contained inline Questionnaire.
      [
        'Questionnaire/contained-form /contained/0/extension/0/valueExpression/expression',
        'exact input/fsh/Inline.fsh:38:53',
      ],
      // WithInsert.fsh: written by a parameterised RuleSet, then repeated text beside an insert.
      ['Questionnaire/WithInsert /item/0/extension/0/valueExpression/expression', 'not-found'],
      ['Questionnaire/WithInsert /item/1/extension/0/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/WithInsert /item/2/extension/0/valueExpression/expression', 'ambiguous'],
      // Standalone.fsh: id health-check on Instance HealthCheck; a query and its fragment.
      [
        'Questionnaire/health-check /extension/0/valueExpression/expression',
        'exact input/fsh/Standalone.fsh:11:19',
      ],
      [
        'Questionnaire/health-check {{(today() - 1 year}} /extension/0/valueExpression/expression',
        'exact input/fsh/Standalone.fsh:11:53',
      ],
      [
        'Questionnaire/health-check /item/0/extension/0/valueExpression/expression',
        'exact input/fsh/Standalone.fsh:19:21',
      ],
      // On _text, with escaped quotes.
      [
        'Questionnaire/health-check /item/1/_text/extension/0/valueExpression/expression',
        'exact input/fsh/Standalone.fsh:26:23',
      ],
      // A """ literal.
      ['Questionnaire/health-check /item/2/extension/0/valueExpression/expression', 'multiline'],
    ]);
  });

  it('maps through a current SUSHI index an Instance only the index can identify', async () => {
    expect(await locateEverySite('indexed')).toEqual([
      [
        'Questionnaire/Form /extension/0/valueExpression/expression',
        'exact input/fsh/Form.fsh:9:53',
      ],
    ]);
  });

  it.each(['stale-index', 'missing-index', 'escaping-index'])(
    'does not use the index of %s, so that Instance is not found',
    async (project) => {
      expect(await locateEverySite(project)).toEqual([
        ['Questionnaire/Form /extension/0/valueExpression/expression', 'not-found'],
      ]);
    },
  );

  it('reads Crlf.fsh with its CRLF line endings', async () => {
    const crlf = await readFile(path.join(fixtures, 'forms/input/fsh/Crlf.fsh'), 'utf8');
    expect(crlf).toContain('\r\n');
  });
});

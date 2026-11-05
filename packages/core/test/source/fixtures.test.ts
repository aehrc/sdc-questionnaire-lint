/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

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
import { locateExpression, sourceContext } from '../../src/source/locate.js';
import { readSushiIndex } from '../../src/source/sushi-index.js';

// The SUSHI-compiled project in fixtures/source-map (see its README).
const fixture = fileURLToPath(new URL('../fixtures/source-map/', import.meta.url));

// Every expression site of the fixture's compiled JSON, located as a finding over the whole
// expression would be: `resource pointer` to `confidence file:line:column`, or the reason.
async function locateEverySite(): Promise<[string, string][]> {
  const cwd = await realpath(fixture);
  const runPaths = resolveRunPaths({ cwd, config: null });
  const { documents } = await loadInputs({ cwd, cliPaths: [], runPaths });
  const context = sourceContext(
    await readSushiIndex(runPaths.sushiIndex),
    fshFiles((await findFshSources(runPaths, cwd)).directories),
    cwd,
  );
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
      rows.push([
        key,
        `${result.confidence} ${path.basename(file)}:${String(line)}:${String(column)}`,
      ]);
    }
  }
  return rows;
}

describe('source mapping of the SUSHI-compiled fixture', () => {
  it('maps every expression to its line, or gives the reason it cannot', async () => {
    expect(await locateEverySite()).toEqual([
      // Mapped.fsh: an inline Questionnaire in a Bundle, found by id and InstanceOf.
      [
        'Questionnaire/dup /entry/0/resource/extension/0/valueExpression/expression',
        'exact Mapped.fsh:95:53',
      ],
      // Unmapped.fsh: nothing tells the twins apart, and a """ literal.
      ['Questionnaire/Twins /item/0/extension/0/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/Twins /item/0/extension/1/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/Twins /item/1/extension/0/valueExpression/expression', 'multiline'],
      // Mapped.fsh: an item of a contained inline Questionnaire.
      [
        'Questionnaire/contained-form /contained/0/item/0/extension/0/valueExpression/expression',
        'exact Mapped.fsh:119:91',
      ],
      // Unmapped.fsh: written by a parameterised RuleSet; repeated text beside an insert; a """
      // literal on an item whose linkId a RuleSet assigns.
      ['Questionnaire/WithInsert /item/0/extension/0/valueExpression/expression', 'not-found'],
      ['Questionnaire/WithInsert /item/1/extension/0/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/WithInsert /item/2/extension/0/valueExpression/expression', 'ambiguous'],
      ['Questionnaire/WithInsert /item/3/extension/0/valueExpression/expression', 'multiline'],
      // Mapped.fsh: HealthCheck, found only through the index. A query and its fragment.
      [
        'Questionnaire/health-check /extension/0/valueExpression/expression',
        'exact Mapped.fsh:16:19',
      ],
      [
        'Questionnaire/health-check {{(today() - 1 year}} /extension/0/valueExpression/expression',
        'exact Mapped.fsh:16:53',
      ],
      // Two variables told apart by name.
      [
        'Questionnaire/health-check /extension/1/valueExpression/expression',
        'anchored Mapped.fsh:20:56',
      ],
      [
        'Questionnaire/health-check /extension/2/valueExpression/expression',
        'anchored Mapped.fsh:23:56',
      ],
      [
        'Questionnaire/health-check /item/0/extension/0/valueExpression/expression',
        'exact Mapped.fsh:31:21',
      ],
      // On _text, with escaped quotes.
      [
        'Questionnaire/health-check /item/1/_text/extension/0/valueExpression/expression',
        'exact Mapped.fsh:39:23',
      ],
      // Sibling items told apart by a linkId assigned after the expression.
      [
        'Questionnaire/health-check /item/2/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:44:21',
      ],
      [
        'Questionnaire/health-check /item/3/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:51:21',
      ],
      // One item, two extensions, one named by an alias.
      [
        'Questionnaire/health-check /item/4/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:60:91',
      ],
      [
        'Questionnaire/health-check /item/4/extension/1/valueExpression/expression',
        'anchored Mapped.fsh:62:61',
      ],
      // Uncatalogued, told apart by element, extension url and sub-extension url.
      [
        'Questionnaire/health-check /item/5/_text/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:70:59',
      ],
      [
        'Questionnaire/health-check /item/5/answerOption/0/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:74:70',
      ],
      [
        'Questionnaire/health-check /item/5/extension/0/extension/0/valueExpression/expression',
        'anchored Mapped.fsh:78:67',
      ],
    ]);
  });
});

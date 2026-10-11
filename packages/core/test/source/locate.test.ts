import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import type { OffsetRange, SourceMapResult } from '../../src/report/types.js';
import { excerpt } from '../../src/run/rules.js';
import { parseFshDocument } from '../../src/source/fsh-document.js';
import { fshFiles, type FshFiles } from '../../src/source/fsh-files.js';
import { locateExpression, sourceContext, type LocateTarget } from '../../src/source/locate.js';
import { tempTree } from '../support/tmp.js';

// What SUSHI cannot compile or show is tested here; every other mapping case is a row of the
// SUSHI-compiled fixture (fixtures.test.ts).

const variable = 'http://hl7.org/fhir/StructureDefinition/variable';

function extension(url: string, expression: string): Record<string, unknown> {
  return { url, valueExpression: { language: 'text/fhirpath', expression } };
}

interface Located {
  result: SourceMapResult;
  // The FSH text the mapped range covers.
  source?: string;
}

// Lints nothing: locates the expression of one site of questionnaire in fsh, as a finding with
// range would be located, and returns the result with the FSH text its range covers.
async function locate(
  fsh: string,
  questionnaire: Record<string, unknown>,
  pick: (sites: readonly ExpressionSite[]) => ExpressionSite | undefined,
  range?: OffsetRange,
  withFiles: (files: FshFiles) => FshFiles = (files) => files,
): Promise<Located> {
  const dir = await realpath(
    await tempTree({ 'input/fsh/Q.fsh': fsh, 'Questionnaire-Q.json': '{}' }),
  );
  const resource = { resourceType: 'Questionnaire', id: 'Q', ...questionnaire };
  const document = {
    file: 'Questionnaire-Q.json',
    resource,
    resourcePointer: '',
    localResources: [],
  };
  const analysed: LocateTarget['document'] = {
    input: { path: path.join(dir, 'Questionnaire-Q.json'), display: '', baseRelative: '' },
    document,
    sites: findExpressionSites(document),
  };
  const site = pick(analysed.sites);
  const result = await locateExpression(
    { document: analysed, site, expression: excerpt(site, range) },
    sourceContext([], withFiles(fshFiles([path.join(dir, 'input/fsh')])), dir),
  );
  if (result.status === 'unmapped') return { result };
  const { lineStarts, text } = parseFshDocument(fsh);
  const offset = (line: number, column: number) => (lineStarts[line - 1] ?? 0) + column - 1;
  const { line, column, endLine, endColumn } = result.location;
  return { result, source: text.slice(offset(line, column), offset(endLine, endColumn)) };
}

const header = 'Instance: Q\nInstanceOf: Questionnaire\n';
const byText = (text: string) => (sites: readonly ExpressionSite[]) =>
  sites.find((site) => site.text === text);

describe('locateExpression', () => {
  it('reads no aliases when every literal names its extension by url or last segment', async () => {
    const located = await locate(
      `${header}* extension[variable].valueExpression.expression = "%a + 1"\n`,
      { extension: [extension(variable, '%a + 1')] },
      byText('%a + 1'),
      undefined,
      (files) => ({ ...files, aliases: () => Promise.reject(new Error('aliases were read')) }),
    );
    expect(located.result).toMatchObject({ status: 'mapped', confidence: 'exact' });
  });

  it('does not map unique text to a literal a later rule assigns over', async () => {
    // The JSON's %a + 1 is the one CalcRules writes; the literal in the Instance is replaced.
    const fsh = [
      '* item[+].linkId = "a"',
      '* item[+].linkId = "b"',
      '* item[1].extension[variable].valueExpression.expression = "%a + 1"',
      '* item[1].extension[variable].valueExpression.expression = "%b"',
      '* insert CalcRules',
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: [
          { linkId: 'a', extension: [extension(variable, '%a + 1')] },
          { linkId: 'b', extension: [extension(variable, '%b')] },
        ],
      },
      byText('%a + 1'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'not-found' });
  });

  it("does not map unique text to a literal without the expression's anchors", async () => {
    // CalcRules writes %a + 1 on item a and replaces the literal on item b.
    const fsh = [
      '* item[+].linkId = "a"',
      '* item[+].linkId = "b"',
      '* item[=].extension[variable].valueExpression.expression = "%a + 1"',
      '* insert CalcRules',
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: [
          { linkId: 'a', extension: [extension(variable, '%a + 1')] },
          { linkId: 'b', extension: [extension(variable, '%b')] },
        ],
      },
      byText('%a + 1'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'not-found' });
  });

  it('counts lines and columns after a byte order mark and CRLF line endings', async () => {
    // SUSHI rejects a byte order mark, so the fixture cannot hold one.
    const fsh = `${String.fromCharCode(0xfeff)}Instance: Q\r\nInstanceOf: Questionnaire\r\n* extension[variable].valueExpression.expression = "%a.b"\r\n`;
    const located = await locate(
      fsh,
      { extension: [extension(variable, '%a.b')] },
      byText('%a.b'),
      { startOffset: 3, endOffset: 4 },
    );
    expect(located).toMatchObject({
      result: { location: { line: 3, column: 56, endLine: 3, endColumn: 57 } },
      source: 'b',
    });
  });

  it('reports not-found for a finding with no expression', async () => {
    const located = await locate(header, {}, () => undefined);
    expect(located.result).toEqual({ status: 'unmapped', reason: 'not-found' });
  });
});

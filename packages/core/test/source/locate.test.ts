import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExpressionSite } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import type { AnalysedDocument } from '../../src/inputs/read.js';
import type { OffsetRange, SourceMapResult } from '../../src/report/types.js';
import { parseFshDocument } from '../../src/source/fsh-document.js';
import { fshFiles, type FshFiles } from '../../src/source/fsh-files.js';
import { locateExpression, sourceContext } from '../../src/source/locate.js';
import { tempTree } from '../support/tmp.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const variable = 'http://hl7.org/fhir/StructureDefinition/variable';

function fhirpath(expression: string, name?: string): Record<string, unknown> {
  return {
    valueExpression: {
      ...(name === undefined ? {} : { name }),
      language: 'text/fhirpath',
      expression,
    },
  };
}

function extension(url: string, expression: string, name?: string): Record<string, unknown> {
  return { url, ...fhirpath(expression, name) };
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
  const analysed: AnalysedDocument = {
    input: { path: path.join(dir, 'Questionnaire-Q.json'), display: '', baseRelative: '' },
    document,
    sites: findExpressionSites(document),
  };
  const site = pick(analysed.sites);
  // As the rule runner shows it: a fragment within its query.
  const expression =
    site?.fragment !== undefined
      ? {
          text: site.fragment.query,
          range: {
            startOffset: site.fragment.startOffset + (range?.startOffset ?? 0),
            endOffset:
              range === undefined
                ? site.fragment.endOffset
                : site.fragment.startOffset + range.endOffset,
          },
        }
      : site?.text === undefined
        ? undefined
        : { text: site.text, ...(range === undefined ? {} : { range }) };
  const result = await locateExpression(
    { document: analysed, site, expression },
    sourceContext([], withFiles(fshFiles([path.join(dir, 'input/fsh')])), dir),
  );
  if (result.status === 'unmapped') return { result };
  const { lineStarts, text } = parseFshDocument(fsh);
  const offset = (line: number, column: number) => (lineStarts[line - 1] ?? 0) + column - 1;
  const { line, column, endLine, endColumn } = result.location;
  return { result, source: text.slice(offset(line, column), offset(endLine, endColumn)) };
}

const header = 'Instance: Q\nInstanceOf: Questionnaire\n';
const byText =
  (text: string, nth = 0) =>
  (sites: readonly ExpressionSite[]) =>
    sites.filter((site) => site.text === text)[nth];

describe('locateExpression', () => {
  it('maps a unique expression exactly, over the reported range', async () => {
    const located = await locate(
      `${header}* item[+].linkId = "bmi"\n* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.expression = "%h.fist()"\n`,
      {
        item: [
          { linkId: 'bmi', extension: [extension(`${sdc}calculatedExpression`, '%h.fist()')] },
        ],
      },
      byText('%h.fist()'),
      { startOffset: 3, endOffset: 7 },
    );
    expect(located).toMatchObject({
      result: {
        status: 'mapped',
        confidence: 'exact',
        location: { file: 'input/fsh/Q.fsh', line: 4, endLine: 4 },
      },
      source: 'fist',
    });
  });

  it('covers the whole expression when no range is reported', async () => {
    const located = await locate(
      `${header}* extension[variable].valueExpression.expression = "%a + 1"\n`,
      { extension: [extension(variable, '%a + 1')] },
      byText('%a + 1'),
    );
    expect(located.source).toBe('%a + 1');
  });

  it('anchors repeated text to the item with the linkId, even assigned after it', async () => {
    const fsh = [
      '* item[+]',
      '  * extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%age > 12"',
      '  * linkId = "a"',
      '* item[+]',
      '  * extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%age > 12"',
      '  * linkId = "b"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: ['a', 'b'].map((linkId) => ({
          linkId,
          extension: [extension(`${sdc}enableWhenExpression`, '%age > 12')],
        })),
      },
      byText('%age > 12', 1),
    );
    expect(located.result).toMatchObject({
      status: 'mapped',
      confidence: 'anchored',
      location: { line: 7 },
    });
  });

  it('anchors repeated text in one item by extension', async () => {
    const fsh = [
      '* item[+].linkId = "a"',
      '* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.expression = "%x"',
      '* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%x"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: [
          {
            linkId: 'a',
            extension: [
              extension(`${sdc}enableWhenExpression`, '%x'),
              extension(`${sdc}calculatedExpression`, '%x'),
            ],
          },
        ],
      },
      byText('%x', 0),
    );
    expect(located.result).toMatchObject({ confidence: 'anchored', location: { line: 5 } });
  });

  it('anchors two variables with the same text by name', async () => {
    const fsh = [
      '* extension[variable][+].valueExpression.name = "h"',
      '* extension[variable][=].valueExpression.expression = "%x"',
      '* extension[variable][+].valueExpression.name = "w"',
      '* extension[variable][=].valueExpression.expression = "%x"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      { extension: [extension(variable, '%x', 'h'), extension(variable, '%x', 'w')] },
      byText('%x', 1),
    );
    expect(located.result).toMatchObject({ confidence: 'anchored', location: { line: 6 } });
  });

  it('anchors an uncatalogued expression by the url of the extension holding it', async () => {
    const custom = 'http://example.org/custom';
    const fsh = [
      '* item[+].linkId = "a"',
      `* item[=].answerOption[+].extension[${custom}].valueExpression.expression = "%x"`,
      '* item[+].linkId = "b"',
      `* item[=].answerOption[+].extension[${custom}].valueExpression.expression = "%x"`,
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: ['a', 'b'].map((linkId) => ({
          linkId,
          answerOption: [{ valueString: 'x', extension: [extension(custom, '%x')] }],
        })),
      },
      byText('%x', 1),
    );
    expect(located.result).toMatchObject({ confidence: 'anchored', location: { line: 6 } });
  });

  it('anchors an uncatalogued expression in a complex extension by both urls', async () => {
    const complex = 'http://example.org/complex';
    const fsh = [
      '* item[+].linkId = "a"',
      `* item[=].extension[${complex}].extension[expr].valueExpression.expression = "%x"`,
      '* item[+].linkId = "b"',
      `* item[=].extension[${complex}].extension[expr].valueExpression.expression = "%x"`,
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        item: ['a', 'b'].map((linkId) => ({
          linkId,
          extension: [{ url: complex, extension: [extension('expr', '%x')] }],
        })),
      },
      byText('%x', 1),
    );
    expect(located.result).toMatchObject({ confidence: 'anchored', location: { line: 6 } });
  });

  it('maps an item expression of a contained Questionnaire to its inline Instance', async () => {
    const fsh = [
      '* contained[+] = C',
      '',
      'Instance: C',
      'InstanceOf: Questionnaire',
      'Usage: #inline',
      '* id = "C"',
      '* item[+].linkId = "q1"',
      '* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%a.fist()"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      {
        contained: [
          {
            resourceType: 'Questionnaire',
            id: 'C',
            item: [
              {
                linkId: 'q1',
                extension: [extension(`${sdc}enableWhenExpression`, '%a.fist()')],
              },
            ],
          },
        ],
      },
      byText('%a.fist()'),
    );
    expect(located.result).toMatchObject({ confidence: 'exact', location: { line: 10 } });
  });

  it("maps an uncatalogued expression in a primitive element's extension", async () => {
    const custom = 'http://example.org/custom';
    const fsh = [
      '* item[+].linkId = "q1"',
      '* item[=].text = "Q"',
      `* item[=].text.extension[${custom}].valueExpression.expression = "%x"`,
    ].join('\n');
    const located = await locate(
      header + fsh,
      { item: [{ linkId: 'q1', text: 'Q', _text: { extension: [extension(custom, '%x')] } }] },
      byText('%x'),
    );
    expect(located.result).toMatchObject({ confidence: 'exact', location: { line: 5 } });
  });

  it('anchors by an alias of the extension url', async () => {
    const custom = 'http://example.org/custom';
    const fsh = [
      `Alias: $custom = ${custom}`,
      '',
      'Instance: Q',
      'InstanceOf: Questionnaire',
      '* item[+].linkId = "a"',
      '* item[=].extension[$custom].valueExpression.expression = "%x"',
      '* item[+].linkId = "b"',
      '* item[=].extension[$custom].valueExpression.expression = "%x"',
    ].join('\n');
    const located = await locate(
      fsh,
      { item: ['a', 'b'].map((linkId) => ({ linkId, extension: [extension(custom, '%x')] })) },
      byText('%x', 1),
    );
    expect(located.result).toMatchObject({ confidence: 'anchored', location: { line: 8 } });
  });

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

  it('leaves repeated text ambiguous when anchors cannot tell the expressions apart', async () => {
    const fsh = [
      '* extension[variable][+].valueExpression.expression = "%x"',
      '* extension[variable][+].valueExpression.expression = "%x"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      { extension: [extension(variable, '%x'), extension(variable, '%x')] },
      byText('%x'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'ambiguous' });
  });

  it('never anchors in a definition with an insert rule', async () => {
    const fsh = [
      '* insert Common',
      '* extension[variable][+].valueExpression.name = "h"',
      '* extension[variable][=].valueExpression.expression = "%x"',
      '* extension[variable][+].valueExpression.name = "w"',
      '* extension[variable][=].valueExpression.expression = "%x"',
    ].join('\n');
    const located = await locate(
      header + fsh,
      { extension: [extension(variable, '%x', 'h'), extension(variable, '%x', 'w')] },
      byText('%x'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'ambiguous' });
  });

  it('reports a """ expression as multiline', async () => {
    const located = await locate(
      `${header}* extension[variable].valueExpression.expression = """\n  %a\n    + 1\n  """\n`,
      { extension: [extension(variable, '%a\n  + 1')] },
      byText('%a\n  + 1'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'multiline' });
  });

  it('reports a unique """ expression as multiline even without the expression\'s anchors', async () => {
    // ItemIds assigns the linkId, so the literal has none.
    const fsh = [
      '* insert ItemIds',
      '* item[0].extension[variable].valueExpression.expression = """',
      '  %a',
      '    + 1',
      '  """',
    ].join('\n');
    const located = await locate(
      header + fsh,
      { item: [{ linkId: 'q', extension: [extension(variable, '%a\n  + 1')] }] },
      byText('%a\n  + 1'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'multiline' });
  });

  it('maps a range across escaped quotes to the escapes in the source', async () => {
    const located = await locate(
      `${header}* extension[variable].valueExpression.expression = "%a = \\"x\\" or %b"\n`,
      { extension: [extension(variable, '%a = "x" or %b')] },
      byText('%a = "x" or %b'),
      { startOffset: 5, endOffset: 8 },
    );
    expect(located.source).toBe('\\"x\\"');
  });

  it("maps a fragment's range inside {{…}} of its query", async () => {
    const query = 'Observation?code={{%code}}&patient={{%patient.id}}';
    const located = await locate(
      `${header}* extension[sdc-questionnaire-itemPopulationContext].valueExpression.name = "obs"\n* extension[sdc-questionnaire-itemPopulationContext].valueExpression.expression = "${query}"\n`,
      {
        extension: [
          {
            url: `${sdc}itemPopulationContext`,
            valueExpression: {
              name: 'obs',
              language: 'application/x-fhir-query',
              expression: query,
            },
          },
        ],
      },
      (sites) => sites.find((site) => site.text === '%patient.id'),
    );
    expect(located).toMatchObject({ result: { confidence: 'exact' }, source: '%patient.id' });
  });

  it('counts lines and columns after a byte order mark and CRLF line endings', async () => {
    const fsh = `${String.fromCharCode(0xfeff)}Instance: Q\r\nInstanceOf: Questionnaire\r\n* extension[variable].valueExpression.expression = "%a.b"\r\n`;
    const located = await locate(
      fsh,
      { extension: [extension(variable, '%a.b')] },
      byText('%a.b'),
      {
        startOffset: 3,
        endOffset: 4,
      },
    );
    expect(located).toMatchObject({
      result: { location: { line: 3, column: 56, endLine: 3, endColumn: 57 } },
      source: 'b',
    });
  });

  it('reports not-found for text that is not in the definition', async () => {
    const located = await locate(
      `${header}* extension[variable].valueExpression.expression = "%other"\n`,
      { extension: [extension(variable, '%a')] },
      byText('%a'),
    );
    expect(located.result).toEqual({ status: 'unmapped', reason: 'not-found' });
  });

  it('reports not-found for a finding with no expression', async () => {
    const located = await locate(header, {}, () => undefined);
    expect(located.result).toEqual({ status: 'unmapped', reason: 'not-found' });
  });
});

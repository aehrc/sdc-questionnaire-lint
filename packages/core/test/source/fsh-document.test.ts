import { describe, expect, it } from 'vitest';
import { parseFshDocument, type FshDefinition } from '../../src/source/fsh-document.js';

function only(source: string): FshDefinition {
  const { definitions } = parseFshDocument(source);
  expect(definitions).toHaveLength(1);
  const [definition] = definitions;
  if (definition === undefined) throw new Error('no definition');
  return definition;
}

// The literal and the text at its offset, which must be the same.
function stringValue(source: string, line: number): { literal: string; atOffset: string } {
  const document = parseFshDocument(source);
  const rule = document.definitions
    .flatMap(({ rules }) => rules)
    .find((each) => each.line === line);
  if (rule?.kind !== 'assignment' || rule.value.kind !== 'string') {
    throw new Error(`no string assignment on line ${String(line)}`);
  }
  const { literal, offset } = rule.value;
  return { literal, atOffset: document.text.slice(offset, offset + literal.length) };
}

describe('parseFshDocument', () => {
  it('reads definitions with their keyword, name, lines and metadata', () => {
    const { definitions } = parseFshDocument(
      [
        'Instance: HealthCheck',
        'InstanceOf: Questionnaire',
        'Usage: #example',
        '* status = #draft',
        '',
        'RuleSet: Item(linkId, text)',
        '* linkId = {linkId}',
      ].join('\n'),
    );
    expect(definitions).toEqual([
      {
        keyword: 'Instance',
        name: 'HealthCheck',
        startLine: 1,
        endLine: 4,
        metadata: new Map([
          ['InstanceOf', 'Questionnaire'],
          ['Usage', '#example'],
        ]),
        rules: [
          {
            line: 4,
            indent: 0,
            kind: 'assignment',
            path: 'status',
            value: { kind: 'other', text: '#draft' },
          },
        ],
      },
      expect.objectContaining({ keyword: 'RuleSet', name: 'Item', startLine: 6, endLine: 7 }),
    ]);
  });

  it('reads the indentation, path and kind of each rule', () => {
    const { rules } = only(
      [
        'Instance: Q',
        'InstanceOf: Questionnaire',
        '* item[+]',
        '  * linkId = "a"',
        '  * insert Hidden',
        '* ^url = "http://example.org"',
        '* item 1..1',
        '* item[0].text = "a" (exactly)',
      ].join('\n'),
    );
    expect(rules.map(({ line, indent, kind }) => [line, indent, kind])).toEqual([
      [3, 0, 'path'],
      [4, 2, 'assignment'],
      [5, 2, 'insert'],
      [6, 0, 'other'],
      [7, 0, 'other'],
      [8, 0, 'assignment'],
    ]);
    expect(rules[0]).toMatchObject({ path: 'item[+]' });
    expect(rules[1]).toMatchObject({ path: 'linkId', value: { kind: 'string', literal: '"a"' } });
    // A string followed by anything else is not a string value.
    expect(rules[5]).toMatchObject({ value: { kind: 'other', text: '"a" (exactly)' } });
  });

  it('gives each string value its literal and its offset in the text', () => {
    const source = 'Instance: Q\n* item[0].text = "say \\"hi\\""\n';
    expect(stringValue(source, 2)).toEqual({
      literal: '"say \\"hi\\""',
      atOffset: '"say \\"hi\\""',
    });
  });

  it('ignores a // comment after whitespace', () => {
    const { rules } = only('Instance: Q\n* item[+] //in-progress\n  * linkId = "a" // done');
    expect(rules).toMatchObject([
      { kind: 'path', path: 'item[+]' },
      { kind: 'assignment', value: { kind: 'string', literal: '"a"' } },
    ]);
  });

  it('keeps // inside a word, as in a URL, and inside a string', () => {
    const document = parseFshDocument(
      [
        'Alias: $X = http://example.org/x//y',
        'Instance: Q',
        '* extension[http://hl7.org/fhir/StructureDefinition/variable].valueExpression.expression = "%a // b"',
      ].join('\n'),
    );
    expect(document.aliases).toEqual(new Map([['$X', 'http://example.org/x//y']]));
    expect(document.definitions[0]?.rules).toMatchObject([
      {
        path: 'extension[http://hl7.org/fhir/StructureDefinition/variable].valueExpression.expression',
        value: { kind: 'string', literal: '"%a // b"' },
      },
    ]);
  });

  it('treats a string with text right after it as part of a word, as SUSHI does', () => {
    const { rules } = only('Instance: Q\n* text = "a"//b');
    expect(rules).toMatchObject([{ value: { kind: 'other', text: '"a"//b' } }]);
  });

  it('ignores a block comment, even one that holds a keyword', () => {
    const { definitions } = parseFshDocument(
      'Instance: Q\n/* Instance: NotReal\n* linkId = "x" */\n* linkId = "a"',
    );
    expect(definitions).toMatchObject([{ name: 'Q', rules: [{ line: 4 }] }]);
  });

  it('reads a "…" string that spans lines, and ends the definition where it ends', () => {
    const source = 'Instance: Q\n* text = "multi\nline"\n';
    expect(stringValue(source, 2).literal).toBe('"multi\nline"');
    expect(only(source)).toMatchObject({ startLine: 1, endLine: 3 });
  });

  it('reads a """ string', () => {
    const source = 'Instance: Q\n* text = """\n  a\n  """';
    expect(stringValue(source, 2)).toEqual({
      literal: '"""\n  a\n  """',
      atOffset: '"""\n  a\n  """',
    });
  });

  it('counts lines and indentation the same with CRLF', () => {
    const source = 'Instance: Q\r\n* item[+]\r\n  * linkId = "a"\r\n';
    const { rules } = only(source);
    expect(rules.map(({ line, indent }) => [line, indent])).toEqual([
      [2, 0],
      [3, 2],
    ]);
    expect(stringValue(source, 3).atOffset).toBe('"a"');
  });

  it('drops a byte order mark, so offsets and columns do not count it', () => {
    const source = `${String.fromCharCode(0xfeff)}Instance: Q\n* linkId = "a"`;
    const document = parseFshDocument(source);
    expect(document.text.startsWith('Instance')).toBe(true);
    expect(document.definitions[0]?.startLine).toBe(1);
    expect(stringValue(source, 2).atOffset).toBe('"a"');
  });

  it('reads an alias with or without $, and ends the definition before it', () => {
    const document = parseFshDocument(
      'Instance: Q\n* linkId = "a"\nAlias: LNC = http://loinc.org\n* linkId = "b"\nAlias: $SCT = http://snomed.info/sct',
    );
    expect(document.aliases).toEqual(
      new Map([
        ['LNC', 'http://loinc.org'],
        ['$SCT', 'http://snomed.info/sct'],
      ]),
    );
    expect(document.definitions).toMatchObject([{ endLine: 2, rules: [{ line: 2 }] }]);
  });

  it('accepts an indented keyword, as SUSHI does', () => {
    expect(only('  Instance: Q\nInstanceOf: Questionnaire')).toMatchObject({
      name: 'Q',
      metadata: new Map([['InstanceOf', 'Questionnaire']]),
    });
  });

  it('reads an insert rule with a path, which sets the context like a path rule', () => {
    expect(only('Instance: Q\n* item[0] insert Hidden').rules).toEqual([
      { line: 2, indent: 0, kind: 'insert', path: 'item[0]' },
    ]);
  });

  it('ignores rules before the first definition', () => {
    expect(parseFshDocument('* linkId = "a"\n').definitions).toEqual([]);
  });
});

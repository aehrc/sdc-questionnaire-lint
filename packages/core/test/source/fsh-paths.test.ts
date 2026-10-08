import { describe, expect, it } from 'vitest';
import { parseFshDocument } from '../../src/source/fsh-document.js';
import { assemblePath, parsePath, resolvePaths } from '../../src/source/fsh-paths.js';

// The full paths of an Instance's rules. Every expected list below is what SUSHI 3.20.1 computes
// for the same rules (FSHImporter, then PathUtils.resolveSoftIndexing).
function paths(...rules: string[]): string[] {
  const [definition] = parseFshDocument(
    ['Instance: Q', 'InstanceOf: Questionnaire', ...rules].join('\n'),
  ).definitions;
  if (definition === undefined) throw new Error('no definition');
  return resolvePaths(definition).map(({ path }) => path);
}

describe('parsePath', () => {
  it('splits on periods outside brackets, so a URL stays whole', () => {
    expect(parsePath('extension[http://x.org/y.z][+].valueString')).toEqual([
      { base: 'extension', brackets: ['http://x.org/y.z', '+'], slices: ['http://x.org/y.z'] },
      { base: 'valueString', brackets: [], slices: [] },
    ]);
  });

  it('assembles the parts back into the path', () => {
    const path = 'item[0].extension[variable][1].valueExpression.expression';
    expect(assemblePath(parsePath(path))).toBe(path);
  });
});

describe('resolvePaths', () => {
  it('numbers [+] and [=] in flat paths', () => {
    expect(
      paths(
        '* item[+].linkId = "a"',
        '* item[=].text = "A"',
        '* item[+].linkId = "b"',
        '* item[=].item[+].linkId = "b1"',
      ),
    ).toEqual(['item[0].linkId', 'item[0].text', 'item[1].linkId', 'item[1].item[0].linkId']);
  });

  it('puts indented rules under their parent, whose [+] they do not repeat', () => {
    expect(
      paths(
        '* item[+]',
        '  * linkId = "a"',
        '  * text = "A"',
        '* item[+]',
        '  * linkId = "b"',
        '  * item[+]',
        '    * linkId = "b1"',
      ),
    ).toEqual([
      'item[0]',
      'item[0].linkId',
      'item[0].text',
      'item[1]',
      'item[1].linkId',
      'item[1].item[0]',
      'item[1].item[0].linkId',
    ]);
  });

  it('continues [+] and [=] from the last numeric index', () => {
    expect(
      paths(
        '* item[3].linkId = "d"',
        '* item[+].linkId = "e"',
        '* item[1].linkId = "b"',
        '* item[=].text = "B"',
      ),
    ).toEqual(['item[3].linkId', 'item[4].linkId', 'item[1].linkId', 'item[1].text']);
  });

  it('counts each slice on its own', () => {
    expect(
      paths(
        '* extension[variable][+].valueExpression.name = "a"',
        '* extension[http://x.org/y.z][+].valueString = "u"',
        '* extension[variable][+].valueExpression.name = "b"',
        '* extension[http://x.org/y.z][+].valueString = "v"',
      ),
    ).toEqual([
      'extension[variable][0].valueExpression.name',
      'extension[http://x.org/y.z][0].valueString',
      'extension[variable][1].valueExpression.name',
      'extension[http://x.org/y.z][1].valueString',
    ]);
  });

  it('numbers the soft indices of every part, as in smart-forms-ig', () => {
    expect(
      paths(
        '* item[+].linkId = "g"',
        '* item[=].item[+].extension[sdc-questionnaire-itemPopulationContext][+].valueExpression[+].name = "x"',
        '* item[=].item[=].extension[sdc-questionnaire-itemPopulationContext][=].valueExpression[=].expression = "%x"',
      ),
    ).toEqual([
      'item[0].linkId',
      'item[0].item[0].extension[sdc-questionnaire-itemPopulationContext][0].valueExpression[0].name',
      'item[0].item[0].extension[sdc-questionnaire-itemPopulationContext][0].valueExpression[0].expression',
    ]);
  });

  it('keeps the own path of a rule under an insert, or indented by an odd number of spaces', () => {
    expect(paths('* insert Hidden', '  * linkId = "a"', '* item[+]', '   * linkId = "b"')).toEqual([
      'linkId',
      'item[0]',
      'linkId',
    ]);
  });
});

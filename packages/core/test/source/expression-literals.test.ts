import { describe, expect, it } from 'vitest';
import { parseFshDocument } from '../../src/source/fsh-document.js';
import { expressionLiterals, namesExtension } from '../../src/source/expression-literals.js';

function literals(...rules: string[]) {
  const [definition] = parseFshDocument(
    ['Instance: Q', 'InstanceOf: Questionnaire', ...rules].join('\n'),
  ).definitions;
  if (definition === undefined) throw new Error('no definition');
  return expressionLiterals(definition);
}

// The anchors themselves (linkId, element, extension, sub-extension, name) are rows of the
// SUSHI-compiled fixture (fixtures.test.ts); what it cannot show is tested here.
describe('expressionLiterals', () => {
  it('leaves out a string a later rule assigns over, and strings in contained resources', () => {
    expect(
      literals(
        '* extension[variable].valueExpression.expression = "%old"',
        '* contained[0].extension[variable].valueExpression.expression = "%contained"',
        '* extension[variable].valueExpression.expression = "%new"',
      ).map(({ literal }) => literal),
    ).toEqual(['"%new"']);
  });

  it('reads a part without an index as index 0, as SUSHI does', () => {
    expect(
      literals(
        '* item.linkId = "a"',
        '* item[0].extension[variable].valueExpression.name = "v"',
        '* item.extension[variable][0].valueExpression.expression = "%x"',
      ),
    ).toMatchObject([{ linkId: 'a', name: 'v' }]);
  });

  it('gives an expression on the root no linkId', () => {
    expect(
      literals('* extension[variable].valueExpression.expression = "%x"', '* linkId = "nope"'),
    ).toEqual([expect.not.objectContaining({ linkId: expect.anything() as unknown })]);
  });

  it('ignores strings at other paths and values that are not strings', () => {
    expect(
      literals(
        '* item[+].text = "expression"',
        '* item[=].extension[x].valueExpression.expression = #x',
      ),
    ).toEqual([]);
  });
});

describe('namesExtension', () => {
  const url =
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression';
  const aliases = new Map([['$enableWhen', url]]);

  it.each([
    [url, true],
    ['$enableWhen', true],
    ['sdc-questionnaire-enableWhenExpression', true],
    // A StructureDefinition name.
    ['SDCQuestionnaireEnableWhenExpression', false],
  ])('names the extension by %s: %s', (name, names) => {
    expect(namesExtension(name, url, aliases)).toBe(names);
  });
});

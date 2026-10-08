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

describe('expressionLiterals', () => {
  it("anchors an expression to its item's linkId, even one assigned after it", () => {
    expect(
      literals(
        '* item[+]',
        '  * extension[sdc-questionnaire-enableWhenExpression].valueExpression',
        '    * language = #text/fhirpath',
        '    * expression = "%age > 12"',
        '  * linkId = "vision"',
      ),
    ).toEqual([
      {
        literal: '"%age > 12"',
        offset: expect.any(Number) as number,
        path: 'item[0].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression',
        linkId: 'vision',
        extension: 'sdc-questionnaire-enableWhenExpression',
      },
    ]);
  });

  it('leaves out a string a later rule assigns over, and strings in contained resources', () => {
    expect(
      literals(
        '* extension[variable].valueExpression.expression = "%old"',
        '* contained[0].extension[variable].valueExpression.expression = "%contained"',
        '* extension[variable].valueExpression.expression = "%new"',
      ).map(({ literal }) => literal),
    ).toEqual(['"%new"']);
  });

  it('tells two variables of one item apart by name', () => {
    expect(
      literals(
        '* item[+].linkId = "bmi"',
        '* item[=].extension[variable][+].valueExpression.name = "h"',
        '* item[=].extension[variable][=].valueExpression.expression = "%x"',
        '* item[=].extension[variable][+].valueExpression.name = "w"',
        '* item[=].extension[variable][=].valueExpression.expression = "%x"',
      ).map(({ linkId, extension, name }) => ({ linkId, extension, name })),
    ).toEqual([
      { linkId: 'bmi', extension: 'variable', name: 'h' },
      { linkId: 'bmi', extension: 'variable', name: 'w' },
    ]);
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

  it('names an extension by its url rule when its brackets hold only an index', () => {
    expect(
      literals(
        '* extension[0].url = "http://hl7.org/fhir/StructureDefinition/variable"',
        '* extension[0].valueExpression.expression = "%x"',
      ),
    ).toMatchObject([{ extension: 'http://hl7.org/fhir/StructureDefinition/variable' }]);
  });

  it('records the primitive element and the sub-extension', () => {
    expect(
      literals(
        '* item[+].linkId = "smoking"',
        '* item[=].text.extension[cqf-expression].valueExpression.expression = "%a"',
        '* item[=].extension[targetConstraint].extension[expression].valueExpression.expression = "%b"',
      ).map(({ element, extension, subExtension }) => ({ element, extension, subExtension })),
    ).toEqual([
      { element: 'text', extension: 'cqf-expression', subExtension: undefined },
      { element: undefined, extension: 'targetConstraint', subExtension: 'expression' },
    ]);
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

  it.each([url, '$enableWhen', 'sdc-questionnaire-enableWhenExpression'])('accepts %s', (name) => {
    expect(namesExtension(name, url, aliases)).toBe(true);
  });

  it('rejects any other name, such as a StructureDefinition name', () => {
    expect(namesExtension('SDCQuestionnaireEnableWhenExpression', url, aliases)).toBe(false);
  });
});

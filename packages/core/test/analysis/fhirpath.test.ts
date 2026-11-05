/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import fhirpath from 'fhirpath';
import r4 from 'fhirpath/fhir-context/r4/index.js';
import { describe, expect, it } from 'vitest';
import {
  findFhirPathSyntaxProblem,
  findFunctionCalls,
  findLinkIdReferences,
  findVariableReferences,
  readsInput,
} from '../../src/analysis/fhirpath.js';

describe('findFhirPathSyntaxProblem', () => {
  it('returns undefined for valid text', () => {
    expect(
      findFhirPathSyntaxProblem("%resource.item.where(linkId = 'a').answer.value"),
    ).toBeUndefined();
  });

  it('gives the offset of an error on line 1', () => {
    expect(findFhirPathSyntaxProblem('a.where(b')).toEqual({
      parserMessage: "missing ')' at '<EOF>'",
      offset: 9,
    });
  });

  it('gives the offset of an error on line 2, counting from the start of the text', () => {
    // Line 2 starts at offset 5, after "a +\r\n"; the error is at column 2 of it.
    expect(findFhirPathSyntaxProblem('a +\r\n  / b')).toMatchObject({ offset: 7 });
    expect(findFhirPathSyntaxProblem('a +\n  b c')).toMatchObject({
      parserMessage: "extraneous input 'c' expecting <EOF>",
      offset: 8,
    });
  });

  it('throws when valid input overflows the parser stack, instead of blaming the expression', () => {
    const nested = `${'('.repeat(20000)}1${')'.repeat(20000)}`;
    expect(() => findFhirPathSyntaxProblem(nested)).toThrow(RangeError);
  });

  it('returns no message and no offset when the parser fails without a position', () => {
    expect(findFhirPathSyntaxProblem('a.b..c')).toEqual({});
  });
});

describe('findFunctionCalls', () => {
  const names = (text: string) => findFunctionCalls(text)?.map(({ name }) => name);

  it('gives the name and offsets of a call', () => {
    expect(findFunctionCalls('a.where(b)')).toEqual([
      { name: 'where', startOffset: 2, endOffset: 7 },
    ]);
  });

  it('finds a call with no target', () => {
    expect(findFunctionCalls('today()')).toEqual([{ name: 'today', startOffset: 0, endOffset: 5 }]);
  });

  it('gives offsets of a call on line 2, counting from the start of the text', () => {
    // Line 2 starts at offset 5, after "a +\r\n".
    expect(findFunctionCalls('a +\r\n  b.fist()')).toEqual([
      { name: 'fist', startOffset: 9, endOffset: 13 },
    ]);
  });

  it('strips the backticks of a delimited name, and its range keeps them', () => {
    expect(findFunctionCalls('a.`fist`()')).toEqual([
      { name: 'fist', startOffset: 2, endOffset: 8 },
    ]);
  });

  it('skips a delimited name with an escape sequence, which it cannot read as fhirpath.js does', () => {
    expect(findFunctionCalls('a.`fi\\u0072st`()')).toEqual([]);
  });

  it('finds calls nested in arguments, in source order', () => {
    expect(names('a.where(b.fist()).first()')).toEqual(['where', 'fist', 'first']);
  });

  it.each([
    ["%factory.Coding('s', 'c').exists()", ['exists']],
    ["%terminologies.expand('v').exists()", ['exists']],
    ["%`factory`.Coding('s', 'c')", []],
    ["%'factory'.Coding('s', 'c')", []],
    ["(%factory).Coding('s', 'c')", []],
    ["%factory.Coding('s', a.fist())", ['fist']],
  ])(
    'skips calls that fhirpath.js resolves on the factory or terminologies: %s',
    (text, expected) => {
      expect(names(text)).toEqual(expected);
    },
  );

  it('keeps a call on any other constant', () => {
    expect(names('%v.fist()')).toEqual(['fist']);
  });

  it('finds sort, which fhirpath.js parses without a name, and the calls in its arguments', () => {
    expect(findFunctionCalls('(1|2).sort($this)')).toEqual([
      { name: 'sort', startOffset: 6, endOffset: 10 },
    ]);
    expect(findFunctionCalls('`sort`()')).toEqual([{ name: 'sort', startOffset: 0, endOffset: 6 }]);
    expect(names('a.sort($this.fist() desc, b.first())')).toEqual(['sort', 'fist', 'first']);
  });

  it('does not count a member access as a call', () => {
    expect(findFunctionCalls('a.b')).toEqual([]);
  });

  it('returns undefined for text that does not parse, with or without a parser position', () => {
    expect(findFunctionCalls('a.where(')).toBeUndefined();
    expect(findFunctionCalls('a.b..c')).toBeUndefined();
  });

  it('throws when valid input overflows the parser stack, instead of blaming the expression', () => {
    const nested = `${'('.repeat(20000)}1${')'.repeat(20000)}`;
    expect(() => findFunctionCalls(nested)).toThrow(RangeError);
  });
});

describe('findVariableReferences', () => {
  const names = (text: string) => findVariableReferences(text)?.map(({ name }) => name);

  it('gives the name and offsets of a reference', () => {
    expect(findVariableReferences('1 + %weight')).toEqual([
      { name: 'weight', startOffset: 4, endOffset: 11, complete: true, conditional: false },
    ]);
  });

  it.each([
    ['%`a b`', 'a b'],
    ['%`a\\u0062`', 'a\\u0062'],
    ["%'a b'", 'a b'],
    ["%'a\\'b'", "a'b"],
    ["%'a\\u0062'", 'ab'],
  ])('reduces %s to the name fhirpath.js looks up, %s', (text, name) => {
    expect(findVariableReferences(text)).toEqual([
      { name, startOffset: 0, endOffset: text.length, complete: true, conditional: false },
    ]);
  });

  it.each(['as', 'contains', 'in', 'is', 'asc', 'desc', 'sort'])(
    'finds a reference to the keyword name %s',
    (name) => {
      expect(names(`%${name}`)).toEqual([name]);
    },
  );

  it.each([
    ['% a', 'a', 3],
    ['% /* c */ a', 'a', 11],
    ['%\n// c\na', 'a', 8],
    ["% /* c */ 'a'", 'a', 13],
    ["% // c 'a'\n 'a'", 'a', 15],
    ["% /* 'a' */ 'a'", 'a', 15],
    ["% /* c */ 'a\\'' // 'a'", "a'", 15],
  ])('covers whitespace and comments after the %% of %j', (text, name, endOffset) => {
    expect(findVariableReferences(text)).toEqual([
      { name, startOffset: 0, endOffset, complete: true, conditional: false },
    ]);
  });

  it('gives offsets across lines, counting from the start of the text, with CRLF line endings', () => {
    // Line 2 starts at offset 5, after "1 +\r\n"; line 3 at 10, after "  %\r\n".
    expect(findVariableReferences("1 +\r\n  %\r\n  'a' + %b")).toEqual([
      { name: 'a', startOffset: 7, endOffset: 15, complete: true, conditional: false },
      { name: 'b', startOffset: 18, endOffset: 20, complete: true, conditional: false },
    ]);
  });

  it('finds references nested in arguments and parentheses, in source order', () => {
    expect(names('(%a).where(%b = (%c.select(%d))) | %e')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('leaves out a name defineVariable binds for the later steps of its chain', () => {
    expect(names("defineVariable('y').select(%y).where(%y.select(%y))")).toEqual([]);
    expect(names("%a.defineVariable('y', 1).select(%y)")).toEqual(['a']);
    expect(names("defineVariable('a\\'b').select(%'a\\'b')")).toEqual([]);
    expect(names("(defineVariable('y')).select(%y)")).toEqual([]);
    expect(names("defineVariable('y', 1)[%y]")).toEqual([]);
  });

  it('keeps a reference in the initializer of defineVariable, which does not see its own name', () => {
    expect(findVariableReferences("defineVariable('y', %y).select(%y)")).toEqual([
      { name: 'y', startOffset: 20, endOffset: 22, complete: true, conditional: false },
    ]);
  });

  it('keeps a reference outside the chain: in another operand, an argument or before it', () => {
    expect(names("defineVariable('y', 1).select(%y) | %y")).toEqual(['y']);
    expect(names("defineVariable('y').exists() and %y")).toEqual(['y']);
    expect(names("a.where(defineVariable('y').exists()).select(%y)")).toEqual(['y']);
    expect(names("%y.defineVariable('y')")).toEqual(['y']);
    expect(names("(defineVariable('y') | a).select(%y)")).toEqual(['y']);
  });

  it('marks references after a defineVariable with a computed name incomplete', () => {
    expect(findVariableReferences('defineVariable(%n, 1).select(%y) | %z')).toEqual([
      { name: 'n', startOffset: 15, endOffset: 17, complete: true, conditional: false },
      { name: 'y', startOffset: 29, endOffset: 31, complete: false, conditional: true },
      { name: 'z', startOffset: 35, endOffset: 37, complete: true, conditional: false },
    ]);
  });

  it('marks references after a call whose name has an escape sequence incomplete, since it may be defineVariable', () => {
    expect(findVariableReferences("`defineV\\u0061riable`('a', 1).select(%a)")).toEqual([
      { name: 'a', startOffset: 37, endOffset: 39, complete: false, conditional: true },
    ]);
  });

  it('finds references in the arguments of sort, which fhirpath.js parses without a parameter list', () => {
    expect(names('(1|2).sort(%x)')).toEqual(['x']);
    expect(names('a.sort(%a desc, %b asc).select(%c)')).toEqual(['a', 'b', 'c']);
    expect(names('sort()')).toEqual([]);
  });

  it('decodes escapes in a quoted name as fhirpath.js does, keeping a backslash before a line break', () => {
    expect(names("%'a\\\nb'")).toEqual(['a\\\nb']);
  });

  it('ignores a defineVariable that fhirpath.js rejects for its arity', () => {
    expect(names('defineVariable().select(%y)')).toEqual(['y']);
    expect(names("defineVariable('y', 1, 2).select(%y)")).toEqual(['y']);
  });

  it('returns undefined for text that does not parse', () => {
    expect(findVariableReferences('%a.where(')).toBeUndefined();
    expect(findVariableReferences('%div')).toBeUndefined();
  });

  describe('conditional', () => {
    // Each reference's name and whether fhirpath.js may skip evaluating it.
    const conditional = (text: string) =>
      findVariableReferences(text)?.map(({ name, conditional }) => [name, conditional]);

    it.each([
      [
        'iif(%c, %a, %b)',
        [
          ['c', false],
          ['a', true],
          ['b', true],
        ],
      ],
      [
        'x.iif(%c, %a, %b)',
        [
          ['c', false],
          ['a', true],
          ['b', true],
        ],
      ],
      [
        'coalesce(%a, %b, %c)',
        [
          ['a', false],
          ['b', true],
          ['c', true],
        ],
      ],
      [
        'x.coalesce(%a, %b)',
        [
          ['a', false],
          ['b', true],
        ],
      ],
      ['x.where(%a)', [['a', true]]],
      ['x.select(%a)', [['a', true]]],
      ['x.exists(%a)', [['a', true]]],
      ['x.all(%a)', [['a', true]]],
      ['x.repeat(%a)', [['a', true]]],
      [
        'x.aggregate(%a, %b)',
        [
          ['a', true],
          ['b', false],
        ],
      ],
      [
        'x.sort(%a, %b desc)',
        [
          ['a', true],
          ['b', true],
        ],
      ],
    ])(
      'marks a reference fhirpath.js may skip, after an iif criterion, a first coalesce argument or in an argument evaluated per item: %s',
      (text, expected) => {
        expect(conditional(text)).toEqual(expected);
      },
    );

    it.each([
      ['iif(true, iif(%c, 1), 0)', [['c', true]]],
      ['iif(true, (%a + 1).toString(), 0)', [['a', true]]],
      [
        'x.where(y.select(%a) | %b).first()',
        [
          ['a', true],
          ['b', true],
        ],
      ],
      ["iif(true, defineVariable('z', %a), 0)", [['a', true]]],
      [
        'x.where(true).select(%a) | %b',
        [
          ['a', true],
          ['b', false],
        ],
      ],
    ])('passes the flag down to every reference below such an argument: %s', (text, expected) => {
      expect(conditional(text)).toEqual(expected);
    });

    it('marks the arguments of a call whose name has an escape sequence, which may be any function', () => {
      expect(conditional('x.`wh\\u0065re`(%a)')).toEqual([['a', true]]);
    });

    it.each([
      ['false and %a', [['a', false]]],
      ['true or %a', [['a', false]]],
      [
        '%a xor %b',
        [
          ['a', false],
          ['b', false],
        ],
      ],
      [
        '%a implies %b',
        [
          ['a', false],
          ['b', false],
        ],
      ],
      [
        '1 + %a = %b',
        [
          ['a', false],
          ['b', false],
        ],
      ],
      ['x | %a', [['a', false]]],
      ['x.combine(%a)', [['a', false]]],
      ['x.union(%a)', [['a', false]]],
      ["x.trace('t', %a)", [['a', false]]],
      ["defineVariable('z', %a)", [['a', false]]],
      ['%a.where(true).first()', [['a', false]]],
      [
        'x.substring(%a, %b)',
        [
          ['a', false],
          ['b', false],
        ],
      ],
    ])('leaves a reference fhirpath.js always evaluates unmarked: %s', (text, expected) => {
      expect(conditional(text)).toEqual(expected);
    });
  });
});

describe('findLinkIdReferences', () => {
  const roots = new Set(['questionnaire', 'resource', 'context', 'qitem']);
  // The literal linkIds found, and whether a reference was uncertain, with the site's input
  // established as this form's.
  const found = (text: string, focus = true) => {
    const result = findLinkIdReferences(text, { roots, focus });
    return (
      result && {
        linkIds: result.literals.map(({ linkId }) => linkId),
        uncertain: result.uncertain,
      }
    );
  };
  const literals = (...linkIds: string[]) => ({ linkIds, uncertain: false });
  const uncertain = { linkIds: [], uncertain: true };
  const none = literals();

  it('gives the linkId and the offsets of its string literal', () => {
    expect(findLinkIdReferences("item.where(linkId = 'a\\'b')", { roots, focus: true })).toEqual({
      literals: [{ linkId: "a'b", startOffset: 20, endOffset: 26 }],
      uncertain: false,
    });
  });

  it.each([
    ["%questionnaire.item.where(linkId = 'a')"],
    ["%questionnaire.repeat(item).where(linkId = 'a')"],
    ["%qitem.item.where(linkId = 'a')"],
    ["%qitem.repeat(item).where(linkId = 'a')"],
    ["%resource.item.where(linkId = 'a')"],
    ["%resource.repeat(item).where(linkId = 'a')"],
    ["%resource.repeat(item | answer.item).where(linkId = 'a')"],
    ["%context.item.where(linkId = 'a')"],
    ["item.where(linkId = 'a')"],
    ["repeat(item).where(linkId = 'a')"],
    ["$this.item.where(linkId = 'a')"],
    ["where(linkId = 'a')"],
    ["(%resource.item).where(linkId = 'a')"],
    ["%resource.item.where('a' = linkId)"],
    ["%resource.item.answer.item.where(linkId = 'a')"],
    ["%resource.item.where(answer.exists()).where(linkId = 'a')"],
    ["%resource.item.select(item.where(linkId = 'a'))"],
    ["iif(item.where(linkId = 'a').answer.value = true, 1, 0)"],
    [
      "%resource.repeat(item).where(linkId = 'g').answer.all(item.where(linkId = 'a').exists().not() or item.where(linkId = 'a').answer.value)",
    ],
  ])('finds the literal selected from items of this form in %s', (text) => {
    expect(found(text)?.linkIds.at(-1)).toBe('a');
    expect(found(text)?.uncertain).toBe(false);
  });

  it('finds each selector of a chain, in source order', () => {
    expect(found("item.where(linkId = 'a').item.where(linkId = 'b').answer.value")).toEqual(
      literals('a', 'b'),
    );
  });

  it.each([
    ["%previousResponse.item.where(linkId = 'a')"],
    ["%group.item.where(linkId = 'a')"],
    ["%resource.descendants().where(linkId = 'a')"],
    ["%questionnaire.contained.item.where(linkId = 'a')"],
    ["%resource.item.first().item.where(linkId = 'a')"],
    ["%resource.repeat(descendants()).where(linkId = 'a')"],
    ["item.where(linkId = %prefix + '1')"],
    ["item.where(linkId = 'a' + 'b')"],
    ["%resource.item.answer.value.combine(item.where(linkId = 'a'))"],
  ])('marks a reference whose target or linkId is not established uncertain: %s', (text) => {
    expect(found(text)).toEqual(uncertain);
  });

  it('marks an implicit input uncertain when the site does not establish it', () => {
    expect(found("item.where(linkId = 'a')", false)).toEqual(uncertain);
    expect(found("%resource.item.where(linkId = 'a')", false)).toEqual(literals('a'));
  });

  it('marks %qitem uncertain when it is not a root of the site', () => {
    const result = findLinkIdReferences("%qitem.item.where(linkId = 'a')", {
      roots: new Set(['resource']),
      focus: true,
    });
    expect(result).toEqual({ literals: [], uncertain: true });
  });

  it.each([
    ["item.where(linkId = 'a').exists()"],
    ["item.where(linkId = 'a').exists(answer.exists())"],
    ["item.where(linkId = 'a').empty()"],
    ["item.where(linkId = 'a').count() > 0"],
    ["0 = item.where(linkId = 'a').count()"],
    ["item.where(linkId = 'g').item.where(linkId = 'a').exists()"],
    ["(%resource.repeat(item).where(linkId = 'a') | item.where(linkId = 'b')).empty()"],
    ["%previousResponse.item.where(linkId = 'a').exists()"],
    ["item.where(linkId = %prefix + '1').exists()"],
  ])('leaves out a deliberate absence probe: %s', (text) => {
    expect(found(text)).toEqual(none);
  });

  it('does not treat a selector whose answers are tested as an absence probe', () => {
    expect(found("item.where(linkId = 'a').answer.value.exists()")).toEqual(literals('a'));
    expect(found("item.where(linkId = 'a').answer.exists()")).toEqual(literals('a'));
    expect(found("item.where(linkId = 'a').answer.value.count() > 0")).toEqual(literals('a'));
    expect(found("item.where(linkId = 'a').count()")).toEqual(literals('a'));
  });

  it('follows a selection through repeat only along item steps', () => {
    expect(found("%resource.repeat(item.where(linkId = 'a')).exists()")).toEqual(none);
    expect(found("%resource.item.where(linkId = 'a').repeat(item).exists()")).toEqual(none);
    expect(found("%resource.item.where(linkId = 'a').repeat(item | answer.item).empty()")).toEqual(
      none,
    );
    expect(found("%resource.item.where(linkId = 'a').repeat(answer.item).exists()")).toEqual(
      literals('a'),
    );
    expect(found("%resource.repeat(answer.item.where(linkId = 'a')).exists()")).toEqual(none);
  });

  it.each([
    ["item.where(linkId != 'a')"],
    ["item.where(linkId = 'a' or linkId = 'b')"],
    ["item.where(linkId ~ 'a')"],
    ["item.where(linkId.startsWith('a'))"],
    ['%resource.item.answer.value'],
  ])('finds no reference outside the supported pattern: %s', (text) => {
    expect(found(text)).toEqual(none);
  });

  it('returns undefined for text that does not parse', () => {
    expect(findLinkIdReferences("item.where(linkId = 'a'", { roots, focus: true })).toBeUndefined();
  });
});

describe('readsInput', () => {
  it('is true for a path, $this or a function call with no target at the top level', () => {
    for (const text of ['item.answer.value', '$this.item', 'exists()', 'ofType(Coding)', 'text']) {
      expect(readsInput(text), text).toBe(true);
    }
  });

  it('is true for %context anywhere', () => {
    for (const text of [
      '%context',
      '%context.item',
      "%resource.item.where(linkId = 'a').select(%context.item)",
      '%resource.iif(%context.exists(), 1, 0)',
    ]) {
      expect(readsInput(text), text).toBe(true);
    }
  });

  it('is false for a path in an argument evaluated against the target', () => {
    for (const text of [
      "%resource.item.where(linkId = 'x')",
      '%resource.iif(true, item.answer.valueString, 0)',
      '%resource.item.select(answer.valueString)',
      '%resource.item.exists(answer.exists())',
      '%resource.item.all(answer.exists())',
      '%resource.repeat(item)',
      '%resource.item.aggregate($total + answer.count(), 0)',
      "%resource.trace('t', item)",
      "%resource.defineVariable('v', item).select(%v)",
      '%resource.item.sort(linkId)',
      '%resource.coalesce(item.answer)',
    ]) {
      expect(readsInput(text), text).toBe(false);
    }
  });

  it('is true for a path in any other argument or operand', () => {
    for (const text of [
      '%resource.item.select(answer.valueString).combine(item.answer.valueString)',
      '%resource.item.aggregate($total + 1, item.count())',
      '%resource.trace(item.linkId.first(), 1)',
      '%resource.item.count() + item.count()',
      'iif(item.exists(), 1, 0)',
    ]) {
      expect(readsInput(text), text).toBe(true);
    }
  });

  it('is true for a path in a sort argument that reads the input', () => {
    expect(
      readsInput('%resource.item.sort(iif(linkId = %context.item.answer.valueString, 0, 1))'),
    ).toBe(true);
    expect(readsInput('%resource.item.sort(linkId desc, text)')).toBe(false);
  });

  it('is true for %context written as a string literal with an escape', () => {
    expect(readsInput("%'cont\\u0065xt'.item")).toBe(true);
    expect(readsInput('%`context`.item')).toBe(true);
  });

  it('does not take a function named like an Object property for a known one', () => {
    expect(readsInput('__proto__(1)')).toBe(true);
    expect(readsInput("%resource.constructor('x')")).toBe(false);
  });

  it('is true for $this in a coalesce argument, which keeps the enclosing $this', () => {
    expect(readsInput('%resource.coalesce($this.item)')).toBe(true);
  });

  it('is false for functions with no target that do not read it, literals and other names', () => {
    for (const text of [
      'today()',
      'now()',
      'timeOfDay()',
      "iif(%a > 1, 'x', 'y')",
      "select('x')",
      "'x'",
      '1 + 2',
      '%resource.item.answer',
      '%rootResource',
      '%qitem.text',
      '%weight / (%height * %height)',
      '%resource.ofType(QuestionnaireResponse)',
      '%resource.item is Coding',
    ]) {
      expect(readsInput(text), text).toBe(false);
    }
  });

  it("is false for a term that reads only the input's linkId", () => {
    for (const text of [
      'linkId',
      '$this.linkId',
      '%context.linkId',
      '(%context).linkId',
      '%resource.item.where(linkId = %context.linkId).count()',
    ]) {
      expect(readsInput(text), text).toBe(false);
    }
  });

  it('is true for linkId together with another read', () => {
    expect(readsInput('linkId & item.answer.value')).toBe(true);
  });

  it('returns undefined for text that does not parse', () => {
    expect(readsInput('item.where(')).toBeUndefined();
  });

  // Two repetitions of the group g, which share their linkId, evaluated with the pinned fhirpath.js
  // and its R4 model as QuestionnaireResponse items, so that answer.value resolves: readsInput is
  // true exactly when the values differ.
  describe('against two repetitions of a group', () => {
    const repetition = (value: string) => ({
      linkId: 'g',
      item: [{ linkId: 'a', answer: [{ valueString: value }] }],
    });
    const repetitions = [repetition('first'), repetition('second')];
    const resource = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: [{ linkId: 'x', answer: [{ valueString: 'outside' }] }, ...repetitions],
    };
    const valueAt = (text: string, input: object): string =>
      JSON.stringify(
        fhirpath.evaluate(
          input,
          { base: 'QuestionnaireResponse.item', expression: text },
          { resource, rootResource: resource },
          // Its typings break exactOptionalPropertyTypes.
          r4 as Parameters<typeof fhirpath.evaluate>[3],
        ),
      );

    it.each([
      ["item.where(linkId='a').answer.value", true],
      ['%context.item.answer.value', true],
      ['$this.item.answer.value', true],
      ['linkId', false],
      ["%resource.item.where(linkId='x').answer.value", false],
      ['%resource.item.where(linkId=%context.linkId).count()', false],
      ["%'cont\\u0065xt'.item.answer.value", true],
      ['%resource.item.sort(iif(linkId = %context.linkId, 0, 1)).first().linkId', false],
    ])('%s', (text, differs) => {
      const [first, second] = repetitions.map((input) => valueAt(text, input));
      expect(first).not.toBe('[]');
      expect(first !== second).toBe(differs);
      expect(readsInput(text)).toBe(differs);
    });
  });
});

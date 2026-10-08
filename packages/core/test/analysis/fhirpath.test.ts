import { describe, expect, it } from 'vitest';
import {
  findFhirPathSyntaxProblem,
  findFunctionCalls,
  findLinkIdReferences,
  findVariableReferences,
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
      { name: 'weight', startOffset: 4, endOffset: 11, complete: true },
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
      { name, startOffset: 0, endOffset: text.length, complete: true },
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
      { name, startOffset: 0, endOffset, complete: true },
    ]);
  });

  it('gives offsets across lines, counting from the start of the text, with CRLF line endings', () => {
    // Line 2 starts at offset 5, after "1 +\r\n"; line 3 at 10, after "  %\r\n".
    expect(findVariableReferences("1 +\r\n  %\r\n  'a' + %b")).toEqual([
      { name: 'a', startOffset: 7, endOffset: 15, complete: true },
      { name: 'b', startOffset: 18, endOffset: 20, complete: true },
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
      { name: 'y', startOffset: 20, endOffset: 22, complete: true },
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
      { name: 'n', startOffset: 15, endOffset: 17, complete: true },
      { name: 'y', startOffset: 29, endOffset: 31, complete: false },
      { name: 'z', startOffset: 35, endOffset: 37, complete: true },
    ]);
  });

  it('marks references after a call whose name has an escape sequence incomplete, since it may be defineVariable', () => {
    expect(findVariableReferences("`defineV\\u0061riable`('a', 1).select(%a)")).toEqual([
      { name: 'a', startOffset: 37, endOffset: 39, complete: false },
    ]);
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

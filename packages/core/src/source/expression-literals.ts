import type { FshDefinition } from './fsh-document.js';
import { assemblePath, parsePath, resolvePaths, type PathPart } from './fsh-paths.js';
import { decodeFshString } from './fsh-string.js';

// The strings an Instance assigns to an Expression's expression, each with what identifies that
// Expression without array indices: its item's linkId, its extension and its name. Indices cannot
// be compared with the compiled JSON, because SUSHI orders slices of extension differently from
// how the rules number them (core-plan §7.2).

export interface ExpressionLiteral {
  // The "…" or """…""" literal, quotes included, at offset in the document's text.
  readonly literal: string;
  readonly offset: number;
  // The rule's full path.
  readonly path: string;
  // The linkId assigned to the item the Expression is on; absent on the root, or when the
  // definition assigns none as a string.
  readonly linkId?: string;
  // The primitive element whose extension holds the Expression, such as text for _text.
  readonly element?: string;
  // How the definition names the extension holding the Expression: the slice name, alias or URL in
  // its brackets, or the value of its url rule when the brackets hold only an index.
  readonly extension?: string;
  // The same for the sub-extension of a complex extension, such as targetConstraint.
  readonly subExtension?: string;
  // The name assigned to the Expression.
  readonly name?: string;
}

const indexPattern = /^[0-9]+$/;

function isExtension({ base }: PathPart): boolean {
  return base === 'extension' || base === 'modifierExtension';
}

// A path as a key for looking up assignments: a part without an index, such as item in
// item.linkId, means index 0 in SUSHI, so it gets [0].
function keyOf(parts: readonly PathPart[]): string {
  return assemblePath(
    parts.map((part) =>
      part.brackets.some((bracket) => indexPattern.test(bracket))
        ? part
        : { ...part, brackets: [...part.brackets, '0'] },
    ),
  );
}

export function expressionLiterals(definition: FshDefinition): ExpressionLiteral[] {
  const rules = resolvePaths(definition);

  // The decoded string last assigned at each path key, as SUSHI keeps the last assignment.
  const strings = new Map<string, string>();
  for (const { rule, path } of rules) {
    if (rule.kind !== 'assignment') continue;
    const { value } = rule;
    const decoded =
      value.kind === 'string' && !value.literal.startsWith('"""')
        ? decodeFshString(value.literal)?.value
        : undefined;
    const key = keyOf(parsePath(path));
    if (decoded === undefined) strings.delete(key);
    else strings.set(key, decoded);
  }

  // The string assigned to the element named field under parts.
  const assigned = (parts: readonly PathPart[], field: string): string | undefined =>
    strings.get(keyOf([...parts, ...parsePath(field)]));

  // How the definition names the extension at parts[position].
  function extensionName(parts: readonly PathPart[], position: number): string | undefined {
    const part = parts[position];
    const slice = part?.brackets.find((bracket) => !indexPattern.test(bracket));
    return slice ?? assigned(parts.slice(0, position + 1), 'url');
  }

  return rules.flatMap(({ rule, path }): ExpressionLiteral[] => {
    if (rule.kind !== 'assignment' || rule.value.kind !== 'string') return [];
    const parts = parsePath(path);
    if (parts.at(-1)?.base !== 'expression') return [];

    // The item path is the leading item parts; the extension and sub-extension follow it.
    const firstOther = parts.findIndex(({ base }) => base !== 'item');
    const [outer, inner] = parts.flatMap((part, position) => (isExtension(part) ? [position] : []));
    const linkId = firstOther > 0 ? assigned(parts.slice(0, firstOther), 'linkId') : undefined;
    // A primitive element, such as text, holds the extension directly and has no brackets.
    const holder = parts[firstOther];
    const element =
      outer === firstOther + 1 && holder?.brackets.length === 0 ? holder.base : undefined;
    const extension = outer === undefined ? undefined : extensionName(parts, outer);
    const subExtension = inner === undefined ? undefined : extensionName(parts, inner);
    const name = assigned(parts.slice(0, -1), 'name');

    return [
      {
        literal: rule.value.literal,
        offset: rule.value.offset,
        path,
        ...(linkId === undefined ? {} : { linkId }),
        ...(element === undefined ? {} : { element }),
        ...(extension === undefined ? {} : { extension }),
        ...(subExtension === undefined ? {} : { subExtension }),
        ...(name === undefined ? {} : { name }),
      },
    ];
  });
}

// Whether an extension name from an ExpressionLiteral names the extension with this URL: the URL
// itself, an alias of it, or its last path segment, which is how SDC and FHIR extensions are
// usually named in FSH (sdc-questionnaire-enableWhenExpression, variable). Anything else, such as
// a StructureDefinition name, does not match, so an unknown name never selects a literal.
export function namesExtension(
  name: string,
  url: string,
  aliases: ReadonlyMap<string, string>,
): boolean {
  return name === url || aliases.get(name) === url || url.split('/').at(-1) === name;
}

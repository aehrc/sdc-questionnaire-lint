/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { isObject } from '../object.js';
import {
  canReferenceDeclaration,
  extractionOnly,
  type AvailableVariables,
} from './available-variables.js';
import type { Declaration } from './declarations.js';
import type { ExpressionSite, QuestionnaireDocument, SiteItem } from './expression-site.js';
import { hasFhirPathText, type VariableReference } from './fhirpath.js';
import { hasQueryText, scanQueryFragments } from './x-fhir-query.js';

// DeclarationUse is public: plugin rules receive it from RuleContext's useOf (API stage C).
// findUses stays internal.

// Whether the expressions of others reference a declaration: referenced when a reference resolves
// to it, and unreferenced when none does and every expression that could see it was analysed (D5).
// Otherwise it is blocked when only expressions with a syntax error went unanalysed, an established
// invalid expression rather than a limitation, and unknown when others did.
export type DeclarationUse = 'referenced' | 'unreferenced' | 'blocked' | 'unknown';

// Content that may reference names but that core does not analyse: a whole-string FHIRPath
// constraint, and a module that $assemble puts in place of the item.
const unanalysedExtensions: ReadonlySet<unknown> = new Set([
  'http://hl7.org/fhir/StructureDefinition/questionnaire-constraint',
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-subQuestionnaire',
]);

// An expression or extension that core did not analyse, which may reference any declaration it can
// see, or only those named name.
interface UnanalysedConsumer {
  readonly item: SiteItem | undefined;
  readonly extraction: boolean;
  // Whether it went unanalysed because of a syntax error.
  readonly invalid: boolean;
  readonly name?: string;
  // The declaration whose own expression it is, which it does not use.
  readonly own?: Declaration;
}

// The root or items that hold an unanalysed extension.
function unanalysedOwners(document: QuestionnaireDocument): (SiteItem | undefined)[] {
  const owners: (SiteItem | undefined)[] = [];
  const visit = (node: Readonly<Record<string, unknown>>, item: SiteItem | undefined): void => {
    const { extension, item: children } = node;
    if (
      Array.isArray(extension) &&
      extension.some((each: unknown) => isObject(each) && unanalysedExtensions.has(each.url))
    ) {
      owners.push(item);
    }
    if (!Array.isArray(children)) return;
    children.forEach((child: unknown, index) => {
      const pointer = `${item?.pointer ?? document.resourcePointer}/item/${String(index)}`;
      if (isObject(child)) visit(child, { pointer });
    });
  };
  visit(document.resource, undefined);
  return owners;
}

// A declaration's element and name, which a duplicate on the same element shares: which of them a
// reference gets is not for core to choose (D8).
const keyOf = ({ item, name }: Declaration): string => `${item?.pointer ?? ''}\n${name}`;

// Whether a consumer may reference a declaration: the declaration is on its element or an ancestor,
// and visible to it (D19).
const mayUse = (consumer: UnanalysedConsumer, declaration: Declaration): boolean =>
  (consumer.own === undefined || keyOf(consumer.own) !== keyOf(declaration)) &&
  (consumer.name === undefined || consumer.name === declaration.name) &&
  canReferenceDeclaration(declaration, consumer.item, consumer.extraction);

// The use of each declaration of a document by the expressions of others. A reference from a
// declaration's own expression, or the fragments of its query, is not a use of it.
export function findUses(
  document: QuestionnaireDocument,
  declarations: readonly Declaration[],
  sites: readonly ExpressionSite[],
  references: ReadonlyMap<ExpressionSite, readonly VariableReference[]>,
  variablesAt: (site: ExpressionSite) => AvailableVariables | undefined,
): ReadonlyMap<Declaration, DeclarationUse> {
  const referenced = new Set<string>();
  const uncertain = new Set<string>();
  const unanalysed: UnanalysedConsumer[] = unanalysedOwners(document).map((item) => ({
    item,
    extraction: false,
    invalid: false,
  }));
  const owners = new Map(
    declarations.flatMap((declaration) =>
      declaration.site === undefined ? [] : [[declaration.site.expressionPointer, declaration]],
    ),
  );

  for (const site of sites) {
    const own = owners.get(site.expressionPointer);
    const unanalysedSite = (invalid: boolean, name?: string): void => {
      unanalysed.push({
        item: site.item,
        extraction: extractionOnly(site.useCases),
        invalid,
        ...(name === undefined ? {} : { name }),
        ...(own === undefined ? {} : { own }),
      });
    };
    if (hasQueryText(site)) {
      // Its fragments are sites of their own; an unclosed one is not.
      if (scanQueryFragments(site.text).unclosedAt !== undefined) unanalysedSite(true);
      continue;
    }
    if (!hasFhirPathText(site)) {
      // CQL, another language, or content only behind a reference.
      if (site.text !== undefined || site.reference !== undefined) unanalysedSite(false);
      continue;
    }
    const found = references.get(site);
    const available = variablesAt(site);
    if (found === undefined) {
      unanalysedSite(true);
      continue;
    }
    for (const { name, complete } of found) {
      if (available === undefined) {
        unanalysedSite(false, name);
        continue;
      }
      const target = available.resolve(name)?.declaration;
      if (target === undefined || (own !== undefined && keyOf(target) === keyOf(own))) continue;
      (complete ? referenced : uncertain).add(keyOf(target));
    }
  }

  const useOf = (declaration: Declaration): DeclarationUse => {
    const key = keyOf(declaration);
    if (referenced.has(key)) return 'referenced';
    if (uncertain.has(key)) return 'unknown';
    const consumers = unanalysed.filter((consumer) => mayUse(consumer, declaration));
    if (consumers.length === 0) return 'unreferenced';
    return consumers.every(({ invalid }) => invalid) ? 'blocked' : 'unknown';
  };
  return new Map(declarations.map((declaration) => [declaration, useOf(declaration)]));
}

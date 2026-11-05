/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { isObject } from '../object.js';
import type { ExpressionSite, QuestionnaireDocument } from './expression-site.js';
import { findLinkIdReferences, hasFhirPathText, type LinkIdReferences } from './fhirpath.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const SUB_QUESTIONNAIRE = `${sdc}subQuestionnaire`;
const ASSEMBLE_CONTEXT = `${sdc}assembleContext`;
const ASSEMBLE_EXPECTATION = `${sdc}assemble-expectation`;

const extensionsOf = (node: Readonly<Record<string, unknown>>): Record<string, unknown>[] =>
  Array.isArray(node.extension) ? node.extension.filter(isObject) : [];

// Calls visit on every item of a Questionnaire, at any depth. The items of a contained resource
// are not its own.
function forEachItem(
  document: QuestionnaireDocument,
  visit: (item: Record<string, unknown>) => void,
): void {
  const walk = (node: Readonly<Record<string, unknown>>): void => {
    if (!Array.isArray(node.item)) return;
    for (const item of node.item) {
      if (!isObject(item)) continue;
      visit(item);
      walk(item);
    }
  };
  walk(document.resource);
}

// The linkIds of the items of a Questionnaire, at any depth.
export function findLinkIds(document: QuestionnaireDocument): ReadonlySet<string> {
  const linkIds = new Set<string>();
  forEachItem(document, ({ linkId }) => {
    if (typeof linkId === 'string') linkIds.add(linkId);
  });
  return linkIds;
}

// Whether $assemble can give the form items this Questionnaire does not have: it includes a
// module, or it is a module that a parent can include, so that its response and Questionnaire
// become the parent's.
function isModular(document: QuestionnaireDocument): boolean {
  const module = extensionsOf(document.resource).some(
    ({ url, valueCode }) =>
      url === ASSEMBLE_CONTEXT ||
      (url === ASSEMBLE_EXPECTATION &&
        typeof valueCode === 'string' &&
        valueCode.includes('child')),
  );
  let parent = false;
  forEachItem(document, (item) => {
    parent ||= extensionsOf(item).some(({ url }) => url === SUB_QUESTIONNAIRE);
  });
  return module || parent;
}

const noTargets = { roots: new Set<string>(), focus: false };
const rootTargets = { roots: new Set(['questionnaire', 'resource', 'context']), focus: true };
const itemTargets = { roots: new Set([...rootTargets.roots, 'qitem']), focus: true };

// The linkId references of each FHIRPath site that parses. At a catalogued site the Questionnaire,
// the response and %context, the site's input, are this form's, and so is %qitem at an item site
// (core-rules.md, slice 7). Nothing is established in a contained resource, at an uncatalogued
// site, or in a modular Questionnaire.
export function findLinkIdReferencesAt(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
): ReadonlyMap<ExpressionSite, LinkIdReferences> {
  const modular = isModular(document);
  const found = new Map<ExpressionSite, LinkIdReferences>();
  for (const site of sites) {
    if (!hasFhirPathText(site)) continue;
    const targets =
      !site.catalogued || modular ? noTargets : site.item === undefined ? rootTargets : itemTargets;
    const references = findLinkIdReferences(site.text, targets);
    if (references !== undefined) found.set(site, references);
  }
  return found;
}

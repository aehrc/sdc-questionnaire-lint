import type { ExpressionSite, QuestionnaireDocument } from 'sdc-questionnaire-lint';
// Tests only: core's site discovery is internal, so tests build real sites from its source.
import { findExpressionSites } from '../../../core/src/analysis/expression-sites.js';

export const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
export const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
export const TARGET_CONSTRAINT = 'http://hl7.org/fhir/StructureDefinition/targetConstraint';
export const CQF_EXPRESSION = 'http://hl7.org/fhir/StructureDefinition/cqf-expression';

export function questionnaire(fields: Record<string, unknown>): Record<string, unknown> {
  return { resourceType: 'Questionnaire', id: 'Q', status: 'draft', ...fields };
}

export function documentOf(resource: Record<string, unknown>): QuestionnaireDocument {
  return { file: 'Questionnaire-Q.json', resource, resourcePointer: '', localResources: [] };
}

// The document and its sites, as core finds them.
export function analyse(resource: Record<string, unknown>): {
  document: QuestionnaireDocument;
  sites: readonly ExpressionSite[];
} {
  const document = documentOf(resource);
  return { document, sites: findExpressionSites(document) };
}

export function expression(language: string, text: string, name?: string): Record<string, unknown> {
  return {
    language,
    expression: text,
    ...(name === undefined ? {} : { name }),
  };
}

// An extension holding an Expression.
export function ext(
  url: string,
  valueExpression: Record<string, unknown>,
): Record<string, unknown> {
  return { url, valueExpression };
}

// A complete targetConstraint; override or drop sub-extensions with parts.
export function targetConstraint(
  valueExpression: Record<string, unknown>,
  parts: Record<string, Record<string, unknown> | undefined> = {},
): Record<string, unknown> {
  const all: Record<string, Record<string, unknown> | undefined> = {
    key: { url: 'key', valueId: 'tc-1' },
    severity: { url: 'severity', valueCode: 'error' },
    expression: { url: 'expression', valueExpression },
    human: { url: 'human', valueString: 'Check the answer' },
    ...parts,
  };
  return {
    url: TARGET_CONSTRAINT,
    extension: Object.values(all).filter((part) => part !== undefined),
  };
}

// An answerOptionsToggleExpression with one option; override or drop sub-extensions with parts.
export function toggle(
  valueExpression: Record<string, unknown>,
  parts: Record<string, Record<string, unknown> | undefined> = {},
): Record<string, unknown> {
  const all: Record<string, Record<string, unknown> | undefined> = {
    option: { url: 'option', valueString: 'a' },
    expression: { url: 'expression', valueExpression },
    ...parts,
  };
  return {
    url: `${sdc}answerOptionsToggleExpression`,
    extension: Object.values(all).filter((part) => part !== undefined),
  };
}

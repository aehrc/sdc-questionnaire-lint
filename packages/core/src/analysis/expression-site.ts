// The expression-site model: what the analysis engine finds in a Questionnaire, and what rules
// receive. Exported from the package, so changes are public API changes.

// An SDC feature that uses an expression, as the SDC expressions table lists it: rendering the
// form, populating it, or extracting resources from its response. Use cases say which features use
// a location, not which names an expression there can reference.
export type ExpressionUseCase = 'rendering' | 'population' | 'extraction';

// The supporting types below carry what the analysis engine provides so far; they gain fields as
// it is built (core-plan §3.1).

// One Questionnaire to check, standalone or inside a Bundle.
export interface QuestionnaireDocument {
  // Display path of the input file.
  readonly file: string;
  readonly resource: Readonly<Record<string, unknown>>;
  // JSON Pointer to the resource within the file: "" for a standalone root.
  readonly resourcePointer: string;
  // Every resource in the same Bundle, as local reference targets; empty for a standalone file.
  readonly localResources: readonly LocalResource[];
}

// A resource in the same Bundle, which a local reference can target.
export interface LocalResource {
  readonly pointer: string;
  readonly resource: Readonly<Record<string, unknown>>;
}

// How a site carries its expression: an Expression object, or a {{…}} fragment embedded in the
// x-fhir-query of one. Whole-string FHIRPath and indirect references come later (core-plan §3.1).
export type ExpressionCarrier = 'expression' | 'fragment';

// Where a fragment sits in its query.
export interface QueryFragment {
  // The decoded x-fhir-query string the fragment is embedded in.
  readonly query: string;
  // Zero-based UTF-16 offsets of the fragment's text within query, excluding the braces.
  readonly startOffset: number;
  readonly endOffset: number;
}

// Identifies a catalogued location: the extension that holds the expression, plus the
// sub-extension for a complex extension such as targetConstraint.
export interface CataloguedLocation {
  readonly url: string;
  readonly subExtension?: string;
}

// The item enclosing a site.
export interface SiteItem {
  // JSON Pointer from the root of the input file.
  readonly pointer: string;
  // Absent when the item has no string linkId.
  readonly linkId?: string;
}

// One expression the linter found in a Questionnaire. Sites are read-only and listed in document
// order; report a finding with site to point at the expression text.
export interface ExpressionSite {
  // JSON Pointer from the root of the input file to the expression text, or to the Expression
  // object when it has no text (a reference-only Expression).
  readonly pointer: string;
  // JSON Pointer from the root of the input file to the Expression object.
  readonly expressionPointer: string;
  readonly carrier: ExpressionCarrier;
  // The catalogued location the site matched; absent for an uncatalogued site.
  readonly location?: CataloguedLocation;
  // Whether the site matched a catalogued location. An uncatalogued site was found by generic
  // detection of an object with a language and an expression; only its syntax and function names
  // can be checked.
  readonly catalogued: boolean;
  // For an expression in a primitive element's extension, such as _text, the element name: text.
  readonly element?: string;
  // The enclosing item; absent for a site on the Questionnaire root or in a contained resource.
  readonly item?: SiteItem;
  // Expression.language, expression, reference and name as written, when they are strings.
  readonly language?: string;
  readonly text?: string;
  readonly reference?: string;
  readonly name?: string;
  // Whether the site declares its name for other expressions to reference: true for an Expression
  // with a name at a catalogued location, such as a variable, an itemPopulationContext or a named
  // calculatedExpression. A fragment, and a name on an uncatalogued site, never declares.
  readonly declares: boolean;
  // The use cases of the site's catalogued location; empty for an uncatalogued site.
  readonly useCases: readonly ExpressionUseCase[];
  // Set only when carrier is fragment: where the site's text sits in its query.
  readonly fragment?: QueryFragment;
}

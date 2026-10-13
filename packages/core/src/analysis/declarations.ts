import { toPointer } from '../json-pointer.js';
import { isObject } from '../object.js';
import type {
  ExpressionSite,
  ExpressionUseCase,
  QuestionnaireDocument,
  SiteItem,
} from './expression-site.js';

// Declaration and DeclarationKind are public: plugin rules reach declarations through
// RuleContext's declarations (API stage B2) and the variables its variablesAt resolves (stage B).
// The finders here stay internal.

type Json = Record<string, unknown>;

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
export const LAUNCH_CONTEXT = `${sdc}launchContext`;
export const EXTRACT_ALLOCATE_ID = `${sdc}extractAllocateId`;
const ASSEMBLE_CONTEXT = `${sdc}assembleContext`;
const VARIABLE = 'http://hl7.org/fhir/StructureDefinition/variable';
const ITEM_POPULATION_CONTEXT = `${sdc}itemPopulationContext`;

// namedExpression is any other Expression with a name at a catalogued location (D9).
export type DeclarationKind =
  'variable' | 'itemPopulationContext' | 'namedExpression' | 'launchContext' | 'allocateId';

// Something in a Questionnaire that introduces a name other expressions can reference as %name.
export interface Declaration {
  readonly name: string;
  readonly kind: DeclarationKind;
  // JSON Pointer from the root of the input file: the site's pointer, or the extension's for a
  // launchContext or an extractAllocateId, which are not Expressions.
  readonly pointer: string;
  // The declaring item; absent when the Questionnaire root declares the name.
  readonly item?: SiteItem;
  readonly useCases: readonly ExpressionUseCase[];
  // The declaring Expression; absent for a launchContext or an extractAllocateId.
  readonly site?: ExpressionSite;
}

function kindOf(site: ExpressionSite): DeclarationKind {
  if (site.location?.url === VARIABLE) return 'variable';
  if (site.location?.url === ITEM_POPULATION_CONTEXT) return 'itemPopulationContext';
  return 'namedExpression';
}

// The name sub-extension's valueCoding.code, as STU3 and STU4 define it, or else its valueId, from
// the 2.7.0 ballot.
function launchContextName(extension: Json): string | undefined {
  const sub: unknown = Array.isArray(extension.extension)
    ? extension.extension.find((each: unknown) => isObject(each) && each.url === 'name')
    : undefined;
  if (!isObject(sub)) return undefined;
  const code = isObject(sub.valueCoding) ? sub.valueCoding.code : undefined;
  if (typeof code === 'string') return code;
  return typeof sub.valueId === 'string' ? sub.valueId : undefined;
}

const launchUseCases: readonly ExpressionUseCase[] = Object.freeze(['rendering', 'population']);
const extractionUseCases: readonly ExpressionUseCase[] = Object.freeze(['extraction']);

// The name a launchContext or an extractAllocateId extension declares, with its kind.
function extensionDeclaration(
  extension: Json,
  item: SiteItem | undefined,
): Pick<Declaration, 'name' | 'kind' | 'useCases'> | undefined {
  // launchContext sits on the root only; its names are not available in extraction (D12).
  if (extension.url === LAUNCH_CONTEXT && item === undefined) {
    const name = launchContextName(extension);
    if (name !== undefined) return { name, kind: 'launchContext', useCases: launchUseCases };
  }
  if (extension.url === EXTRACT_ALLOCATE_ID && typeof extension.valueString === 'string') {
    return { name: extension.valueString, kind: 'allocateId', useCases: extractionUseCases };
  }
  return undefined;
}

// Every declaration on the root of a Questionnaire and its items, in document order. sites are the
// document's expression sites; those that declare become declarations of their names. A
// launchContext on the root and an extractAllocateId on the root or an item declare too.
// sourceQueries results are host variables, not declarations (D16), and contained resources
// declare nothing.
export function findDeclarations(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
): Declaration[] {
  const declaring = sites.filter((site) => site.declares);
  const declarations: Declaration[] = [];

  function add(declaration: Declaration): void {
    declarations.push(Object.freeze(declaration));
  }

  function visitExtensions(
    extensions: unknown,
    pointer: string,
    item: SiteItem | undefined,
    onPrimitive: boolean,
  ): void {
    if (!Array.isArray(extensions)) return;
    extensions.forEach((extension: unknown, index) => {
      if (!isObject(extension)) return;
      const extensionPointer = `${pointer}/${String(index)}`;
      const declared = onPrimitive ? undefined : extensionDeclaration(extension, item);
      if (declared !== undefined) {
        add({ ...declared, pointer: extensionPointer, ...(item === undefined ? {} : { item }) });
        return;
      }
      for (const site of declaring) {
        if (!site.expressionPointer.startsWith(`${extensionPointer}/`)) continue;
        add({
          // declares implies a name.
          name: site.name ?? '',
          kind: kindOf(site),
          pointer: site.pointer,
          ...(site.item === undefined ? {} : { item: site.item }),
          useCases: site.useCases,
          site,
        });
      }
    });
  }

  // The root and its items, in the walker's key order.
  function visit(owner: Json, pointer: string, item: SiteItem | undefined): void {
    for (const [key, value] of Object.entries(owner)) {
      const at = pointer + toPointer([key]);
      if (key === 'extension' || key === 'modifierExtension') {
        visitExtensions(value, at, item, false);
      } else if (key.startsWith('_') && isObject(value)) {
        visitExtensions(value.extension, `${at}/extension`, item, true);
      } else if (key === 'item' && Array.isArray(value)) {
        value.forEach((child: unknown, index) => {
          if (!isObject(child)) return;
          const childPointer = `${at}/${String(index)}`;
          const linkId = typeof child.linkId === 'string' ? { linkId: child.linkId } : {};
          visit(child, childPointer, Object.freeze({ pointer: childPointer, ...linkId }));
        });
      }
    }
  }

  visit(document.resource, document.resourcePointer, undefined);
  return declarations;
}

// The names a module needs from the Questionnaire that includes it, listed by assembleContext on its
// root, in document order. They are not declarations: the including Questionnaire supplies them
// (core-rules.md D24).
export function findAssembleContextNames(document: QuestionnaireDocument): string[] {
  const { extension } = document.resource;
  if (!Array.isArray(extension)) return [];
  return extension.flatMap((each: unknown) =>
    isObject(each) && each.url === ASSEMBLE_CONTEXT && typeof each.valueString === 'string'
      ? [each.valueString]
      : [],
  );
}

import {
  type BuiltinDefiner,
  builtinNames,
  builtinPrefixes,
} from '../analysis/available-variables.js';
import type { CoreRule } from '../plugins/core-rule.js';

// The specification that reserves a name, or undefined when none does.
function definerOf(name: string): BuiltinDefiner | undefined {
  if (builtinPrefixes.some((prefix) => name.startsWith(prefix))) return 'FHIR';
  return builtinNames.get(name);
}

const message = (name: string, definer: BuiltinDefiner): string =>
  `The name %${name} is defined by ${definer}, so a form cannot declare it; it is unclear ` +
  'which value expressions that use it get.';

export const reservedName: CoreRule = {
  meta: {
    description: 'Reports a declaration of a name that FHIRPath, FHIR or SDC defines.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Looks at the name of every declaration: variables, other named expressions such as an ' +
        'itemPopulationContext, launchContexts and extractAllocateIds. It reports a name that ' +
        'FHIRPath defines (%context, %ucum), that FHIR defines (%resource, %rootResource, %sct, ' +
        '%loinc, %terminologies, %factory, %server, and any name that starts with vs- or ext-), ' +
        'or that SDC defines (%questionnaire, %qitem).',
      why:
        'FHIRPath, FHIR and SDC reserve these names, and SDC says a form must not redeclare ' +
        'them. An expression that uses the name may get the built-in value or the declared one, ' +
        'depending on the form filler.',
      exampleMessage: message('qitem', 'SDC'),
      fix:
        'Rename the declaration, and update the expressions that should use it. Then run SUSHI ' +
        'again.',
      limitations:
        'Contained resources and uncatalogued expressions declare nothing, so their names are not ' +
        'checked. Names a host supplies, listed in hostVariables, are not declarations.',
    },
  },
  check(ctx, { declarations }) {
    for (const declaration of declarations) {
      const definer = definerOf(declaration.name);
      if (definer === undefined) continue;
      ctx.report({
        ...(declaration.site === undefined
          ? { pointer: declaration.pointer }
          : { site: declaration.site }),
        message: message(declaration.name, definer),
        help: 'rename the declaration, and the expressions that should use it',
      });
    }
  },
};

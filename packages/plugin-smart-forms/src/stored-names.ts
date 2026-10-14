import type { Declaration, RuleContext } from 'sdc-questionnaire-lint';
import { storesVariable } from './eligibility.js';
import { type Component, components } from './facts/versions.js';
import { population } from './population.js';

// The names Smart Forms stores a value under, which is the only way it makes a declaration
// available to other expressions (docs/smart-forms-rules.md, P5 Stored names and P6 Available
// names). Each component stores its own set: population's is the population model's, and the
// renderer stores the names of the variables it evaluates, of no other declaration.

// The name a declaration stores a value under in one component, or undefined when it stores none.
function storedNameIn(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  declaration: Declaration,
  component: Component,
): string | undefined {
  if (component === 'populate') return population(ctx).bindingOf(declaration)?.name;
  const { kind, site, name } = declaration;
  return kind === 'variable' && site !== undefined && storesVariable(ctx, site, component)
    ? name
    : undefined;
}

// The name a declaration stores a value under in any of the given components, by default every
// selected one, or undefined when none of them stores one.
export function storedName(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  declaration: Declaration,
  among: readonly Component[] = components,
): string | undefined {
  for (const component of among) {
    const name = storedNameIn(ctx, declaration, component);
    if (name !== undefined) return name;
  }
  return undefined;
}

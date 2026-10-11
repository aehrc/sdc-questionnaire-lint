// The Smart Forms components the runtime facts describe. template-extract has none until P8.
export type Component = 'renderer' | 'populate';

export const components: readonly Component[] = Object.freeze(['renderer', 'populate']);

// Facts of one kind, keyed by component and verified version.
export type FactTable<T> = Readonly<Record<Component, Readonly<Record<string, T>>>>;

// The facts of a selected component version. A version compat selected with no facts is a plugin
// bug: every verified version must have them.
export function factsAt<T>(
  table: FactTable<T>,
  kind: string,
  component: Component,
  version: string,
): T {
  const facts = table[component][version];
  if (facts === undefined) {
    throw new Error(`the plugin has no ${kind} facts for Smart Forms ${component} ${version}`);
  }
  return facts;
}

/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// The Smart Forms components these runtime facts describe. template-extract's facts are keyed by
// its version alone, in extraction.ts: extraction is checked only when selected.
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

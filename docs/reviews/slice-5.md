# Slice 5 review: declaration shadowing and dependency cycles

Reviewed on 2026-10-08 with `git diff b46699a^...b46699a`.

The Standards axis found no actionable violations or code smells. The Spec axis found the two P2 follow-ups below. Both remain open; this record does not change the implementation or the intended behavior.

Validation: 150 tests passed across `rules/dependency-cycle.test.ts`, `rules/shadowed-declaration.test.ts`, `analysis/available-variables.test.ts`, `run/suppressions.test.ts` and `lint.test.ts`. Both follow-ups were reproduced through the built public `lint()` API.

## 1. Partially parsed queries still contribute cycle edges

**Status:** open. **Priority:** P2.

The intended behavior is to stop following a declaration whose expression does not parse. The rule's [documented limitations](../../packages/core/src/rules/dependency-cycle.ts) say that expressions that do not parse are not followed.

Reproduce with two root `variable` extensions on one Questionnaire, in this order:

| Name | Language | Expression |
| :- | :- | :- |
| `a` | `application/x-fhir-query` | `Observation?x={{%b}}&y={{1 +}}` |
| `b` | `text/fhirpath` | `%a` |

Each extension uses `http://hl7.org/fhir/StructureDefinition/variable`, with the name, language and expression in its `valueExpression`.

**Observed:** the report contains both `sdc/fragment-parse-error` and `sdc/dependency-cycle`. The cycle message is `Declarations %a and %b reference each other; updates may not reach a stable value.`

**Expected:** retain the fragment parse finding, but do not follow `a` to establish a cycle through the invalid query.

In [findDependencies](../../packages/core/src/analysis/dependencies.ts), a failed fragment sets `analysed = false`, while dependencies collected from other fragments remain in `on`. The cycle traversal in [dependency-cycle.ts](../../packages/core/src/rules/dependency-cycle.ts) follows those retained edges without checking `analysed`.

**Follow-up:** discard dependencies of unanalysed declarations, or stop graph traversal through them. Add a regression case with one valid and one invalid query fragment. Keep the existing behavior for valid queries and for references after a `defineVariable` with a computed name.

## 2. Unavailable analysis incorrectly makes suppressions stale

**Status:** open. **Priority:** P2.

The [CLI suppression contract](../cli.md#stale-suppressions) requires unavailable analysis to leave a suppression not assessed. The [shared completion contract](../core-rules.md#shared-analysis-and-completion-evidence) says a suppression is stale only if its own rule completed at its target.

Reproduce with `Q.json` containing one root `variable` declaration named `a`. Run each of these cases separately:

| Language | Expression |
| :- | :- |
| `text/cql` | `%a` |
| `text/fhirpath` | `%a.where(` |

Use this configuration, saved alongside `Q.json`:

```json
{
  "suppress": [
    {
      "rule": "sdc/dependency-cycle",
      "file": "Q.json",
      "extensionUrl": "http://hl7.org/fhir/StructureDefinition/variable",
      "name": "a",
      "reason": "The form filler handles this dependency."
    }
  ]
}
```

Call `lint({ cwd, paths: ['Q.json'], configPath: 'config.json' })`, where `cwd` contains the input and `config.json`.

**Observed:** both cases produce `lint/stale-suppression`, claiming that the rule checked the expression and found no problem. The suppression counts are `{ applied: 0, stale: 1, notAssessed: 0 }`. The invalid FHIRPath case also produces `sdc/parse-error`.

**Expected:** no stale-suppression finding; the suppression counts should be `{ applied: 0, stale: 0, notAssessed: 1 }`. Retain the parse finding for invalid FHIRPath.

In [completesCycleCheck](../../packages/core/src/rules/dependency-cycle.ts), `reachesOnlyKnown()` returns true for a declaration whose dependencies have `analysed = false`. This incorrectly establishes completion at the suppression's target.

**Follow-up:** require analysis of the target declaration before establishing completion. Add suppression regression cases for CQL and invalid FHIRPath. Preserve the agreed distinction: a valid declaration that references an opaque declaration can still complete its check; the opaque declaration does not make that consumer unchecked.

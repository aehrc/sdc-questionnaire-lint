# Suppression

A suppression hides one rule's findings at one expression after you have reviewed them and decided they are acceptable there. Each one lives in the config with a reason, so the decision is recorded beside the form, reviewed like any other change, and reported when it is no longer needed.

## Before you suppress

A suppression is for one reviewed site. Other tools fit other cases better:

| Situation | Use |
| :- | :- |
| The finding is right | Fix the form |
| The application running the form supplies the name, such as an `additionalContext` entry | List it in `hostVariables` |
| You never want the rule, in any form | Set the rule to `off` in `rules` |
| You want the rule reported but not failing the run | Set the rule to `warning` or `info` in `rules` |
| One finding at one expression is acceptable | A suppression |

The exception is `%questionnaire` and `%qitem`: FHIRPath and SDC define them, so `hostVariables` cannot list them. An application that supplies them itself suppresses the findings about them, with a reason that names the application.

## Add a suppression

Say a calculated expression on the `bmi` item uses a variable that a shared profile will declare in its next release:

```console
$ npx sdc-lint lint
input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %encounterHeight is not available on item "BMI" (bmi).
  %weight / %encounterHeight.power(2)
            ^~~~~~~~~~~~~~~~
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it
```

Add an entry to `suppress` in the [config](configuration.md), here `sdc-questionnaire-lint.config.json`:

```json
{
  "suppress": [
    {
      "rule": "sdc/undefined-variable",
      "file": "fsh-generated/resources/Questionnaire-intake.json",
      "linkId": "bmi",
      "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression",
      "reason": "Fixed upstream in the next release of the shared BMI profile."
    }
  ]
}
```

Lint again. The finding is gone, and the summary counts it:

```console
$ npx sdc-lint lint
0 findings in 1 questionnaire.
Inputs: full run; 1 file read, 0 skipped. Expressions: 1 analysed, 0 unchecked. Suppressed findings: 1.
Suppressions: 1 applied, 0 stale, 0 not assessed.
```

In an `.mjs` config, `suppress` takes the same entries:

```js
import { defineConfig } from 'sdc-questionnaire-lint';

export default defineConfig({
  suppress: [
    {
      rule: 'sdc/undefined-variable',
      file: 'fsh-generated/resources/Questionnaire-intake.json',
      linkId: 'bmi',
      extensionUrl:
        'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
      reason: 'Fixed upstream in the next release of the shared BMI profile.',
    },
  ],
});
```

## Entry keys

Every entry needs `rule`, `file` and `reason`. The other keys are selectors that narrow the entry down to one expression; every selector given must match.

| Key | Required | Matches |
| :- | :- | :- |
| `rule` | Yes | The rule whose findings to hide, such as `sdc/undefined-variable`, or a plugin rule such as `smart-forms/…` |
| `file` | Yes | The compiled input file, relative to the config's directory, not the FSH file |
| `reason` | Yes | Not a selector: why the findings are acceptable here. It cannot be blank |
| `linkId` | No | The linkId of the item the expression is on |
| `extensionUrl` | No | The URL of the extension that holds the expression |
| `name` | No | The expression's `name`, such as a variable's name |
| `resource` | No | `Questionnaire/<id>`, for a Bundle that holds several Questionnaires |
| `pointer` | No | The expression's JSON Pointer, such as `/item/2/extension/0/valueExpression/expression` |

Prefer `linkId`, `extensionUrl` and `name`: they survive reordering items and extensions, which a `pointer` does not. Use `pointer` for an expression with no item to select it by, such as one in a contained resource.

## Find the selectors

The selectors come from the compiled JSON, not the FSH. In an IG, the text output points at the FSH line, so ask for the JSON report, which gives each finding's compiled file, pointer and linkId:

```console
$ npx sdc-lint lint --format json | jq '.findings[] | {ruleId, jsonLocation}'
{
  "ruleId": "sdc/undefined-variable",
  "jsonLocation": {
    "file": "fsh-generated/resources/Questionnaire-intake.json",
    "pointer": "/item/2/extension/0/valueExpression/expression",
    "resource": { "resourceType": "Questionnaire", "id": "intake", "pointer": "" },
    "linkId": "bmi"
  }
}
```

Copy `file` and `linkId` into the entry. For `extensionUrl` and `name`, open the compiled file at the pointer: the pointer above ends in an extension, whose `url` is the `extensionUrl`. For linting plain JSON with no FSH, the text output's `location:` line shows the resource and pointer as well.

## What one entry covers

An entry selects exactly one expression and hides every finding its rule reports there. In the example above, if `%weight` were undeclared too, the same entry would hide its finding as well, including one that appears after the entry was written. To hide a finding of another rule at the same expression, add another entry.

A suppression of an x-fhir-query also hides the findings in the FHIRPath of its `{{…}}` fragments.

An entry whose selectors match several expressions stops the run, and the error lists them:

```console
$ npx sdc-lint lint
error: config sdc-questionnaire-lint.config.json is invalid at /suppress/0: it matches 2 expressions, at /item/0/extension/0/valueExpression/expression and /item/1/extension/0/valueExpression/expression
help: add extensionUrl, name or pointer to select one expression
```

Add selectors, such as `linkId`, until the entry matches one.

## Suppress a launchContext or extractAllocateId

A launchContext or an extractAllocateId declares a name rather than holding an expression. An entry whose `extensionUrl` is `http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext` or `http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId` selects the declared `name` on one element: the item its `linkId` selects, or the Questionnaire root when it has no `linkId`. For an item without a linkId, give the item's own pointer, such as `/item/2`, as `pointer`.

It hides the rule's findings at every declaration of that name on that element, including a variable that repeats the name. For example, for two launchContexts named `patient` on the root:

```json
{
  "rule": "sdc/duplicate-declaration",
  "file": "fsh-generated/resources/Questionnaire-intake.json",
  "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext",
  "name": "patient",
  "reason": "The host supplies one patient; the second launchContext is removed in the next release."
}
```

## Stale suppressions

Once the form is fixed, the entry hides nothing. The linter reports it as a `lint/stale-suppression` warning at the config entry, so suppressions do not pile up:

```console
$ npx sdc-lint lint
sdc-questionnaire-lint.config.json: warning lint/stale-suppression A suppression of sdc/undefined-variable hides nothing: the rule checked this expression and found no problem.
  location: /suppress/0
  help: remove this entry from suppress
```

Each entry ends a run in one of three states, counted in the summary's `Suppressions:` line:

| State | When |
| :- | :- |
| Applied | It hid at least one finding |
| Stale | The run shows it hides nothing: its file was deleted, no expression matches it any more, or its rule checked the expression and found no problem |
| Not assessed | The run cannot tell |

An entry is not assessed when:

- its file is outside a targeted run, one given explicit paths such as `sdc-lint lint questionnaires/a.json`; a full run, with no paths, assesses every entry;
- its rule is `off`, or could not complete its check of the expression;
- its rule is a plugin rule and reported nothing there: only the built-in rules record that they completed a check.

A stale suppression is a warning, so it never fails the run on its own. To stop reporting them, set `"lint/stale-suppression": "off"` in `rules`; it accepts only `warning` or `off`.

## Config errors

These mistakes stop the run with exit code 2, naming the entry's pointer in the config:

- `rule`, `file` or `reason` is missing, or `reason` is blank.
- An unknown key, or an unknown rule ID; the help suggests a rule with a similar name.
- `pointer` is not a JSON Pointer.
- The selectors match several expressions, or several declared names.
- `rule` is a `lint/` rule, such as `lint/stale-suppression`. Those findings are about the config itself and cannot be suppressed.

```console
$ npx sdc-lint lint
error: config sdc-questionnaire-lint.config.json is invalid at /suppress/0/reason: reason is blank
help: set reason to why the findings are acceptable here
```

## In reports and CI

Suppressed findings are left out of every output format and out of the error, warning and info counts, so they never affect the exit code. The JSON report counts them in `summary.suppressedFindings` and the entries in `summary.suppressions`; see the [JSON report format](report-format.md).

[Stale suppressions](cli.md#stale-suppressions) in the CLI contract has the full assessment rules, and [Suppressions and fingerprints](core/suppressions.md) explains how the linter applies them.

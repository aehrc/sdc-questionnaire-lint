# @sdc-questionnaire-lint/plugin-smart-forms

A plugin for [sdc-questionnaire-lint](https://github.com/beda-software/sdc-questionnaire-lint) that reports where [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from SDC, in the Smart Forms versions you select: an expression it ignores, evaluates in the wrong language, or that references a variable it never supplies. It also supplies the names Smart Forms gives the results of a form's sourceQueries, so `sdc/undefined-variable` accepts them.

Its rules assume the form is populated with sdc-populate, then rendered with what population supplied: the pipeline the Smart Forms app runs when population succeeds.

## Install and configure

```sh
npm install --save-dev sdc-questionnaire-lint @sdc-questionnaire-lint/plugin-smart-forms
```

List the plugin in an `.mjs` config; a JSON config cannot load a plugin.

```js
// sdc-questionnaire-lint.config.mjs
import { defineConfig } from 'sdc-questionnaire-lint';
import smartForms from '@sdc-questionnaire-lint/plugin-smart-forms';

export default defineConfig({
  plugins: [smartForms],
  compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } },
});
```

`compat` selects the Smart Forms versions the plugin checks against. It is optional: without it, the plugin checks against `"latest"`, the newest versions this release of the plugin has verified, not the newest on npm. This release verifies renderer 1.4.0, populate 4.7.1 and template-extract 1.0.15. An explicit object names `renderer` and `populate`, and `template-extract` only when template extraction should be checked. An unverified version, or an unknown or missing component, fails the run with `CONFIG_INVALID`. The report names the selected versions in `run.compat`.

## Rules

| Rule | Default | Reports |
| :- | :- | :- |
| `smart-forms/unsupported-expression-language` | error | An expression Smart Forms ignores because of its language |
| `smart-forms/expression-evaluated-as-fhirpath` | error | An expression Smart Forms evaluates as FHIRPath whatever its language |
| `smart-forms/questionnaire-variable-unavailable` | error | A reference to `%questionnaire` or `%qitem`, which Smart Forms does not supply |
| `smart-forms/unsupported-query-embedding` | error | A `{{…}}` embedding in an x-fhir-query that Smart Forms population does not fill as written |
| `smart-forms/variable-name-collision` | error | A name declared on two elements, or named like a sourceQueries result, which Smart Forms stores as one value |
| `smart-forms/repeating-group-variable` | warning | A variable on or below a repeating group whose value differs between repetitions, of which Smart Forms keeps one |

`sdc-lint explain smart-forms/<rule>` prints what a rule checks, why, an example message and the fix. The [rules library](https://github.com/beda-software/sdc-questionnaire-lint/blob/main/docs/rules/index.md) has the same documentation with example forms, and the [Smart Forms rules plan](https://github.com/beda-software/sdc-questionnaire-lint/blob/main/docs/smart-forms-rules.md) the runtime facts behind each rule.

## The names it supplies

Smart Forms population binds the result of each sourceQueries extension on the Questionnaire root to a name, and passes the names it bound to the renderer. The plugin supplies those names to core's name analysis as host variables, so expressions can reference them without a `hostVariables` entry:

- A reference to a contained resource, `#PrePopQuery`, is named `PrePopQuery`. It is supplied when the first contained resource with that id and type Bundle has an `entry` element, an empty one included.
- Any other non-empty reference, such as `Observation?code=…`, is named `sourceQuery<i>`, where `i` counts from 0 every sourceQueries extension with a `valueReference`, including display-only and empty ones. It is supplied assuming the fetch succeeds.
- Nothing is supplied when the Questionnaire's `subjectType` is non-empty and lacks `Patient`: population stops before reading sourceQueries. Item-level sourceQueries, and a sourceQueries URL with a `|version`, are not read.
- Never supplied: an empty or display-only reference, `#` alone, a reference to a contained resource that is not such a Bundle, and `#%x`, which population binds as `%x` while a host variable is written without `%`.

A name is supplied whenever the plugin is listed, even with all its rules off: listing the plugin activates its names, and rule settings control only its findings. A declaration of the same name in the form still wins.

Limits:

- In the Smart Forms app, the entries of a contained sourceQueries Bundle are never filled: population stores an entry's result only from a fetch callback that returns `{ data: resource }`, and the app's returns the resource itself. The name is bound to the Bundle, so the plugin supplies it, but `%PrePopQuery.entry.resource` is empty in the app.
- With no launch resource at run time, population also fetches a `#id` reference, which in the app is a request to the server base. The plugin does not model this.
- The names are available at extraction sites, as config `hostVariables` are, although Smart Forms template extraction receives none of them. Smart Forms evaluates no expression there that core checks, but `sdc/undefined-variable` does not report a sourceQueries name in an itemExtractionContext, which an extraction engine that evaluates it would not supply.

## Names the application supplies

The names your application passes to the renderer as `additionalContext` belong to the application, not to Smart Forms: list them in `hostVariables` in the config. Do not list the sourceQueries names the plugin supplies: listing a name the plugin does not supply asserts that the application supplies it, which for a sourceQueries name usually hides a failure instead of fixing it.

`hostVariables` cannot list a name FHIRPath, FHIR or SDC defines. Smart Forms supplies neither `%questionnaire` nor `%qitem`; an application that supplies one itself suppresses the `smart-forms/questionnaire-variable-unavailable` findings with a reason that names the application.

## Suppressions

A suppression of a plugin rule's finding is applied when it hides a finding, and stale when its file, resource, expression or declared name is gone. When its target still exists and the rule reported nothing there, it is not assessed: only built-in rules record whether they completed a check. A plugin rule never makes an expression unchecked. [Stale suppressions](https://github.com/beda-software/sdc-questionnaire-lint/blob/main/docs/cli.md#stale-suppressions) has the full rules.

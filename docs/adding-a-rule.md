# Adding a rule

How to add a rule: a core `sdc/` rule or a `smart-forms/` rule in this repository, or a rule in your own plugin package. Each step names the file or command it touches, so it can be followed one step at a time, by a person or an AI agent.

Pick your path:

| You are adding | Read | Then follow |
| :- | :- | :- |
| A core rule, `sdc/<name>`, in `packages/core` | Sections 1 to 5 | [6. Core rule checklist](#6-core-rule-checklist) |
| A Smart Forms rule, `smart-forms/<name>`, in `packages/plugin-smart-forms` | Sections 1 to 5 | [7. Smart Forms rule checklist](#7-smart-forms-rule-checklist) |
| A rule in your own plugin package | Sections 1 to 4 | [8. Plugin rule checklist](#8-plugin-rule-checklist) |

Then [9. Verify](#9-verify). [10. Not yet available](#10-not-yet-available) lists what the contract does not offer yet.

This guide says what to do. For the reasons behind it, and for how a lint run works, see:

- [linter-design-guidelines.md](linter-design-guidelines.md): precision, messages and rule metadata (§1, §3 and §5);
- [architecture.md](architecture.md): the pipeline, the rule runner (§5) and [what a plugin can import](architecture.md#what-a-plugin-can-import);
- [core-plan.md](core-plan.md) §4 and §5, with [plan-amendments.md](plan-amendments.md), which overrides it: the rule catalogue and the plugin contract;
- [GLOSSARY.md](../GLOSSARY.md): the terms used in code, messages and docs.

## 1. Should this be a rule?

A rule must meet all of these:

- **Deterministic.** The same form and the same linter version give the same findings, in the same order. A rule never evaluates an expression, reads the network or depends on the time.
- **Low false-positive rate.** A finding nobody acts on counts as a false positive ([guidelines §1](linter-design-guidelines.md#1-trust-precision-beats-coverage)). A rule that reports at `error` must have none on the [corpus](../GLOSSARY.md). Where the analysis is uncertain, report nothing, or `info`. Don't report a pattern the specification allows.
- **Satisfiable.** An author, or an agent, can make the finding go away by changing the form, without turning the rule off. A rule an agent can never satisfy gets suppressed or disabled.
- **Not a repeat.** It does not repeat an invariant the FHIR Validator already checks ([guidelines §8](linter-design-guidelines.md#8-embedded-languages-and-generated-artifacts)), and it does not overlap an existing rule. One root cause has one finding: an expression that does not parse belongs to `sdc/parse-error` and nothing else, so `sdc/unknown-function` skips it. `sdc-lint explain` lists the existing rules.

Where a rule belongs:

- **Core (`sdc/`)** checks the SDC specification, for any IG.
- **The Smart Forms plugin (`smart-forms/`)** reports where Smart Forms behaves differently from SDC, in the versions selected in `compat`. It states only a runtime consequence the evidence shows.
- **Your own plugin** checks anything else, such as a house style or another runtime.

A plugin rule stays silent where a core rule reports the same root cause. It checks the condition itself, with core's exported lookups (`languagesAllowedAt`, `definedLanguages`, `isQueryLanguage`, `ctx.declarations`, `ctx.referencesAt`, `ctx.variablesAt`), never whether the core rule ran or is enabled ([what a plugin can import](architecture.md#what-a-plugin-can-import)). For example, `smart-forms/unsupported-expression-language` skips a language outside `definedLanguages`, because `sdc/language-not-in-value-set` reports it, and it stays silent even when that core rule is off.

## 2. Anatomy of a rule

The contract is in [`packages/core/src/plugins/contract.ts`](../packages/core/src/plugins/contract.ts) and exported from the `sdc-questionnaire-lint` package.

A rule is a `LintRule`: a `meta` object and a `check(ctx)` function.

```ts
import type { LintRule } from 'sdc-questionnaire-lint';

export const myRule: LintRule = {
  meta: {
    description: 'Reports …', // one line, shown by sdc-lint explain
    defaultSeverity: 'warning', // error, warning or info
    docs: { checks: '…', why: '…', exampleMessage: '…', fix: '…', limitations: '…' },
    // docsUrl: 'https://…', // optional, an absolute URL
  },
  check(ctx) {
    for (const site of ctx.sites) {
      // Only FHIRPath with text; skip CQL, x-fhir-query and reference-only Expressions.
      if (site.language !== 'text/fhirpath' || site.text === undefined) continue;
      // … decide whether the site has the problem …
      ctx.report({ site, message: '…', help: '…' });
    }
  },
};
```

A `{{…}}` fragment of an x-fhir-query is a site of its own, with the language `text/fhirpath` and the fragment's text, so a FHIRPath check covers fragments without extra work. Its query is a separate site with a query language.

A rule has no ID of its own. Its ID is `<plugin meta.name>/<key>`, the key it is registered under in the plugin's `rules`. Keys use lowercase letters, digits and hyphens, and start with a letter.

`check` runs once per Questionnaire. Its `RuleContext` holds:

| Field | What it gives |
| :- | :- |
| `document` | The `QuestionnaireDocument`: the input `file`, the `resource`, its `resourcePointer` in the file and, for a Bundle, its `localResources` |
| `sites` | Every expression site in the Questionnaire, flat and frozen, in document order. A site has its `pointer`, `carrier` (`expression` or `fragment`), catalogued `location`, `item`, `language`, `text`, `reference`, `name`, `declares`, `useCases`, and `fragment` for a `{{…}}` fragment of an x-fhir-query ([`analysis/expression-site.ts`](../packages/core/src/analysis/expression-site.ts)) |
| `declarations` | Every declaration in the Questionnaire, flat and frozen, in document order: variables, other named expressions, launchContexts and extractAllocateIds. Each has its `name`, `kind`, `pointer`, `item`, `useCases` and, for an Expression, its `site`, one of `sites`. Compare items by `pointer`: a launchContext's or extractAllocateId's `item` is not the same object as a site's |
| `referencesAt(site)` | The `%name` references in a site's FHIRPath, fragments included; `[]` when the text parses and references nothing |
| `variablesAt(site)` | The names an expression can reference at a site, and `resolve(name)`, the variable a name resolves to |
| `compat` | The component versions the run selected for the rule's namespace, such as `{ renderer: '1.4.0', populate: '4.7.1' }`; `{}` for a plugin without `compat` |
| `options` | Always `undefined`: see [Not yet available](#10-not-yet-available) |
| `report(finding)` | Reports one finding; see [section 3](#3-findings-and-messages) |

`referencesAt` and `variablesAt` are core's name analysis. Each returns `undefined` where core cannot analyse the site: `referencesAt` for a site whose language is not `text/fhirpath`, that has no text, or whose text does not parse; `variablesAt` for an uncatalogued site. Both return `undefined` for an object that is not one of `ctx.sites`: they compare by identity, so a copy of a site is not one. A rule treats `undefined` as "cannot check" and reports nothing there, never as "no references".

Rules are pure:

- `check` is synchronous. It must not return a promise.
- It reads its input and never changes it: `document`, `sites`, `declarations` and the analysis are shared with every other rule.
- It does not access the network or the file system, or format output. Logging goes to stderr, but a rule has no reason to log.

A throw, a returned promise or an invalid finding fails the whole run with exit 2 and the failure code `RULE_CRASH`, which names the rule. Built-in and plugin rules are treated alike.

**Core rules that read the analysis.** An `sdc` rule can use core's internal `DocumentAnalysis`: declarations, dependencies, uses, linkIds and more ([architecture.md §4](architecture.md#4-expression-discovery-analysis)). Such a rule is a `CoreRule` ([`plugins/core-rule.ts`](../packages/core/src/plugins/core-rule.ts)), and its `check(ctx, analysis)` receives the analysis as a second argument. The runner passes it to `sdc` rules only. `sdc/reserved-name` ([`rules/reserved-name.ts`](../packages/core/src/rules/reserved-name.ts)) is a short example. A plugin rule has only the public `RuleContext`.

**Core helpers.** A core rule reads FHIRPath through [`analysis/fhirpath.ts`](../packages/core/src/analysis/fhirpath.ts), the only module that uses fhirpath.js: `hasFhirPathText(site)` (the language is `text/fhirpath` and the site has text), `findFhirPathSyntaxProblem(text)` (`undefined` when the text parses), `findFunctionCalls(text)` (each call's name and range; `undefined` when the text does not parse) and `findVariableReferences(text)`. Query strings go through [`analysis/x-fhir-query.ts`](../packages/core/src/analysis/x-fhir-query.ts). These helpers are internal: a plugin cannot import them.

## 3. Findings and messages

`ctx.report()` takes a `RuleFinding`:

| Field | Required | What it holds |
| :- | :- | :- |
| `message` | yes | The problem, and what it does to the form. Not the fix |
| `help` | no | The fix, as an assertion |
| `note` | no | Context, such as what the FHIRPath parser reported |
| `site` | one of `site` or `pointer` | The expression site the finding is at. Prefer it: the report then shows the expression, and the finding is mapped to its FSH line |
| `pointer` | | A JSON Pointer from the root of the input file, for something that is not an expression, such as a launchContext. Ignored when `site` is given |
| `range` | no | `{ startOffset, endOffset }` within the site's text, such as the misspelt function name. For a fragment site, offsets are within the fragment's text; the report shows them within the whole query |
| `severity` | no | Overrides the rule's effective severity for this finding only. Rarely right: it ignores the severity the user configured |
| `relatedLocations` | no | Other places relevant to the finding, each a `site` or a `pointer` with an optional `message`, such as the other declaration of a duplicated name |

With neither `site` nor `pointer`, the finding is at the Questionnaire itself.

The runner checks every finding, and fails the run with `RULE_CRASH` when:

- `message` is missing or empty, or `help` or `note` is given and empty;
- `site` is not one of `ctx.sites`, by identity;
- `pointer` is not a JSON Pointer, or lies outside the Questionnaire's resource (`document.resourcePointer`);
- `range` is given without a site that has text, or its offsets are not integers with `0 <= startOffset <= endOffset <= text.length`;
- `severity` is not `error`, `warning` or `info`;
- a related location has neither `site` nor `pointer`, or breaks the rules above for its `site`, `pointer` or `message`.

`report()` never throws. The runner keeps the first problem and fails the run once `check` returns.

**Writing the message** ([guidelines §3](linter-design-guidelines.md#3-messages)):

- Write for the form author, and state the consequence in their terms: "so this expression fails when the form runs".
- Say where the problem is in the way the reader needs. For a problem inside the expression text, the report already shows the expression and the range, so "this expression" is enough, as in `sdc/unknown-function`. For a problem about an element, such as a declaration, an item or a name available on an item, name the element by its item text and linkId, as in `%weigt is not available on item "BMI" (bmi).` Core rules use `elementName` in [`rules/describe.ts`](../packages/core/src/rules/describe.ts); the Smart Forms plugin has its own in `src/document.ts`.
- Make the first sentence stand on its own; viewers cut what follows.
- Use the [GLOSSARY.md](../GLOSSARY.md) terms, and avoid the words it lists under _Avoid_. For example, a name "is not available on this item", not "is out of scope".
- Put the fix in `help`, as an assertion an author or agent can act on: `a function with a similar name exists: first()`, not "Did you mean first()?". Suggest a fix only when you are confident. Like most existing ones, start `help` and `note` in lowercase, with no final period.
- Keep implementation terms, such as "AST" or "evaluation context", out of `message`.

For example, `sdc/unknown-function` reports `fist() is not a FHIRPath function, so this expression fails when the form runs.` with `help: a function with a similar name exists: first()` and a `range` over `fist`.

**Choosing the default severity:**

- `error`: the form demonstrably fails or misbehaves, and the rule has no false positives on the corpus. Errors fail CI (exit 1).
- `warning`: probably a mistake, but it can be deliberate, or the rule cannot prove the consequence. `sdc/dependency-cycle` and `sdc/unresolved-linkid` are warnings for this reason.
- `info`: something the author should know, such as an expression the linter could not check (`sdc/external-expression`), or a pattern the specification allows (`sdc/shadowed-declaration`). Info findings are hidden in text output unless `--show-info` is given.

## 4. `meta.docs`

`sdc-lint explain <rule-id>` prints a rule's bundled documentation, offline. `meta.docs` has five plain-text fields, which `explain` prints under these headings:

| Field | Heading | Content |
| :- | :- | :- |
| `checks` | What it checks | Which sites the rule looks at, and what it reports |
| `why` | Why it matters | What happens to the form when it runs |
| `exampleMessage` | Example message | One message exactly as the rule reports it. Build it with the same function the rule uses, so the two cannot drift apart |
| `fix` | How to fix it | What the author changes: in an IG, the FSH, followed by running SUSHI again |
| `limitations` | Known limitations | What the rule does not check, and what it leaves to other rules |

[`rules/unknown-function.ts`](../packages/core/src/rules/unknown-function.ts) is a complete example: its `exampleMessage` uses the same `consequence` text as the message in `check`, and its `limitations` say that an expression that does not parse is left to `sdc/parse-error`.

**Policy:** `meta.docs` is required for core and Smart Forms rules, with all five fields non-empty. The docs tests enforce it: [`packages/core/test/plugins/docs.test.ts`](../packages/core/test/plugins/docs.test.ts) for every built-in rule, and [`packages/plugin-smart-forms/test/docs.test.ts`](../packages/plugin-smart-forms/test/docs.test.ts) for every Smart Forms rule, which also runs `explain` for it. For a rule in another plugin, `meta.docs` is recommended. Without it, `explain` says the plugin ships no bundled documentation for the rule. When a plugin gives `meta.docs`, the config check requires all five fields.

## 5. Tests

In this repository, a rule is tested with lint cases: `packages/<package>/test/cases/<rule>/<case>.yaml` describes a minimal form, and `<case>.expected.yaml` beside it holds the findings the linter must report for it. SUSHI compiles every case, so a case also checks that each finding maps to its FSH line. [AGENTS.md § Tests](../AGENTS.md#tests) describes the format, the cache and how to write the expected files with `npx vitest run -u`; [`packages/lint-cases/src/generate-fsh.ts`](../packages/lint-cases/src/generate-fsh.ts) documents every config key.

Model the cases on [`packages/core/test/cases/unknown-function/`](../packages/core/test/cases/unknown-function/). One case per behaviour, each with a comment saying what it shows:

```yaml
# packages/core/test/cases/unknown-function/similar-name.yaml
# An unknown function, with a similar name in help and a range over the name.
items:
  - linkId: a
    type: string
    extensions:
      - url: calculatedExpression
        expression: 'a.fist()'
```

Cover:

- each kind of finding the rule reports, and each `help` text;
- the negative cases: valid forms, and the sites the rule skips, such as other languages, text that does not parse, or uncatalogued sites;
- each case where the rule stays silent because another rule reports the root cause. For a plugin rule, add a variant with that core rule set to `'off'` in the case's `rules`, to show the silence does not depend on it;
- the patterns the corpus lacks.

New cases are picked up without registration: [`packages/core/test/cases/cases.test.ts`](../packages/core/test/cases/cases.test.ts) and [`packages/plugin-smart-forms/test/cases/cases.test.ts`](../packages/plugin-smart-forms/test/cases/cases.test.ts) lint every case. `testLintCases` also fails when no case's expected findings include a rule of the plugin, so a rule cannot land without a case. Review every expected file before committing it: it is the rule's output.

**Other rules' cases.** Every case runs every rule, so a new rule can add findings to existing cases, and `npx vitest run -u` rewrites their expected files too. Review each one that changed:

- A true finding in a case about another rule can stay; it shows the rules side by side.
- When the case's comment says it reports nothing, such as `demo/valid.yaml`, or the finding hides what the case is about, change the form so the new rule has nothing to report, or set the rule off in that case with a `rules` key, as the plugin's silence cases do:

  ```yaml
  rules:
    sdc/<rule-name>: 'off'
  ```
- A finding you did not expect is a false positive to fix in the rule, not an expected file to accept.

Other tests that assert an exact list of findings, such as those in `packages/core/test/cli/`, can pick up the new rule's findings too. Run the whole suite, `npm test`, not only the cases.

**A plugin outside this repository** cannot use lint cases: `@sdc-questionnaire-lint/lint-cases` is private, and there is no published rule-testing framework. Test the rule through `lint()` from the `sdc-questionnaire-lint` package instead: write a temporary directory with a Questionnaire JSON file and an `.mjs` config that lists your plugin, call `lint({ cwd })`, and assert on `report.findings`. [`packages/plugin-smart-forms/test/support/lint.ts`](../packages/plugin-smart-forms/test/support/lint.ts) is a working example of this pattern.

## 6. Core rule checklist

For an `sdc/` rule in `packages/core`. Before you start, read the plan for the rule in [core-rules.md](core-rules.md), with [how to work on a slice](core-rules.md#how-to-work-on-a-slice) and the decisions (Dn) the slice cites.

A rule that no plan describes yet gets a slice first, agreed with the maintainers before it is built: the next slice number in the [slice table](core-rules.md#slices-at-a-glance), with the rule ID, default severity, dependencies and status `todo`, and a section in the style of the existing slices that says what the rule reports, which decisions it relies on and what its tests cover.

1. **The rule file:** `packages/core/src/rules/<rule-name>.ts`, exporting the rule as a `LintRule`, or as a `CoreRule` when it reads the analysis.
2. **Registration** in [`packages/core/src/plugins/builtin.ts`](../packages/core/src/plugins/builtin.ts). There are four places; the first two are needed for every rule:
   1. `sdcPlugin.rules`: add `'<rule-name>': <rule>`. Keep the keys in alphabetical order. A `CoreRule` is listed `as unknown as LintRule`, like `reservedName`.
   2. `completesCheck`: add `'sdc/<rule-name>'` with a predicate `(site, analysis) => boolean` that is true exactly where the rule completes its check at a site, so that no finding there means the site passed. Match what `check` skips: `sdc/parse-error` checks every FHIRPath site with text, so its predicate is `hasFhirPathText`; `sdc/unknown-function` skips text that does not parse, so its predicate is `hasFhirPathText(site) && findFhirPathSyntaxProblem(site.text) === undefined`. Without an entry, a suppression of the rule is never assessed as stale (`cli.md` [§ Stale suppressions](cli.md#stale-suppressions)).
   3. `leavesUnchecked`, only when the rule applies to a site but cannot complete its check there, such as `sdc/undefined-variable` at a reference after a `defineVariable` with a computed name. Such a site counts as unchecked in the report's expression coverage. A syntax error that prevents the check is not one of these.
   4. `completesDeclarationCheck`, only when the rule checks launchContext and extractAllocateId declarations, which have no expression site, and completes its check at every one.
3. **Tests:**
   1. Lint cases in `packages/core/test/cases/<rule-name>/`, and a review of the other cases' expected files, as in [section 5](#5-tests).
   2. Two tests list every built-in rule, and fail until the new one is added: the `explain` listing in [`packages/core/test/cli/explain.test.ts`](../packages/core/test/cli/explain.test.ts), with its description and default severity, and the three rule lists in [`packages/core/test/plugins/rule-set.test.ts`](../packages/core/test/plugins/rule-set.test.ts).
4. **The plan:** set the rule's status in the slice table of `docs/core-rules.md` to `done`, and complete the [checklist for every slice PR](core-rules.md#checklist-for-every-slice-pr), which includes the corpus run. Core-plan §4.1 is the original catalogue and is not kept current: record a new rule, or a change to a rule it lists such as a different default severity, in [plan-amendments.md](plan-amendments.md), as `sdc/reserved-name` was.
5. **The README:** append the rule to the list in the **Status** line of [README.md](../README.md), and update the number of built-in rules before it, which is spelled out ("fifteen built-in rules").
6. **architecture.md**, when the rule changes the pipeline or the analysis, or adds to what `leavesUnchecked` lists in [§8](architecture.md#8-report-report).
7. **The rules library:** add the rule to `examples` in [`docs/.vitepress/rules.ts`](.vitepress/rules.ts) with the lint case its page shows as the example, `<rule-name>/<case>`: a short case whose expected findings include the rule, ideally the one whose message is the rule's `exampleMessage`. The documentation site generates the rule's page from its `meta.docs`, that case and its other lint cases; `npm run docs:build` fails until the entry exists.

## 7. Smart Forms rule checklist

For a `smart-forms/` rule in `packages/plugin-smart-forms`. Before you start, read the slice for the rule in [smart-forms-rules.md](smart-forms-rules.md) and [how to work on a slice](smart-forms-rules.md#how-to-work-on-a-slice), and re-check each runtime fact it relies on against the pinned Smart Forms source. A rule that no slice describes yet gets one first, agreed with the maintainers, as for a core rule.

1. **The rule file:** `packages/plugin-smart-forms/src/rules/<rule-name>.ts`, exporting a `LintRule` that imports its types from `sdc-questionnaire-lint`. A rule that reports at an expression site reports only where `readBy(ctx, site)` ([`src/eligibility.ts`](../packages/plugin-smart-forms/src/eligibility.ts)) returns a component that reads it. [`rules/unsupported-expression-language.ts`](../packages/plugin-smart-forms/src/rules/unsupported-expression-language.ts) is an example.
2. **Registration:** add the rule to `rules` in [`packages/plugin-smart-forms/src/index.ts`](../packages/plugin-smart-forms/src/index.ts).
3. **Runtime facts:** each fact the rule relies on goes in `packages/plugin-smart-forms/src/facts/`, per component and verified version, with its evidence ([`facts/evidence.ts`](../packages/plugin-smart-forms/src/facts/evidence.ts)): a reproduction test against the pinned package in `packages/plugin-smart-forms/test/reproduction/` where a harness exists (`reproduced`), otherwise `source-only` with a permalink into the Smart Forms source at the release commit (`source`). A message claims only what that evidence shows.
4. **Tests:** lint cases in `packages/plugin-smart-forms/test/cases/<rule-name>/`, as in [section 5](#5-tests), including a case for each silence with the core rule `off`. The docs test runs `explain` for the rule.
5. **The plan:** the rule's status in the [slice table](smart-forms-rules.md#slices-at-a-glance) of `docs/smart-forms-rules.md`, and its [checklist for every slice PR](smart-forms-rules.md#checklist-for-every-slice-pr), which includes the corpus run with the plugin.
6. **The README:** add a row to the Smart Forms rule table under [The Smart Forms plugin](../README.md#the-smart-forms-plugin), and add the rule to the **Status** line.
7. **The rules library:** add the rule's example lint case to `examples` in [`docs/.vitepress/rules.ts`](.vitepress/rules.ts), as for a [core rule](#6-core-rule-checklist).

## 8. Plugin rule checklist

For rules in your own npm package. The Smart Forms plugin in [`packages/plugin-smart-forms`](../packages/plugin-smart-forms) is the worked example, and the README's [Writing a plugin](../README.md#writing-a-plugin) section shows a minimal one.

1. **The plugin object:** the package's default export is a `LintPlugin`: `meta: { name, version }` and `rules`, keyed by rule name.
   - `meta.name` is the rule namespace: the plugin `my-plugin` with the rule key `no-today` gives `my-plugin/no-today`. It uses lowercase letters, digits and hyphens. `sdc` and `lint` are reserved, and two listed plugins cannot share a name.
   - `meta.version` is the plugin's version; the report lists it in `run.plugins`.
   - Import types and lookups from `sdc-questionnaire-lint` only. Everything under its `src` that the package does not export is internal ([what a plugin can import](architecture.md#what-a-plugin-can-import)).
2. **`peerDependencies`** on the versions of `sdc-questionnaire-lint` the plugin supports. The Smart Forms plugin uses `"sdc-questionnaire-lint": "^0.1.0"`.
3. **`compat`**, only for a plugin that checks forms against versions of a runtime: `compat: { verified, required }`. `verified` lists each component's verified versions, oldest to newest, such as `{ renderer: ['1.4.0'], populate: ['4.7.1'] }`; `required` lists the components a user's explicit `compat` object must name. A rule reads the selected versions from `ctx.compat`. Core treats versions as opaque strings.
4. **Enabling it:** a user lists the plugin in `plugins` in an `.mjs` config, `sdc-questionnaire-lint.config.mjs`; a JSON config cannot load a plugin. Installing it is not enough. Listing it enables its rules at their default severities, which `rules` can override:

   ```js
   import { defineConfig } from 'sdc-questionnaire-lint';
   import myPlugin from 'my-sdc-lint-plugin';

   export default defineConfig({
     plugins: [myPlugin],
     rules: { 'my-plugin/no-today': 'error' },
   });
   ```

   A plugin with `compat` is checked against `"latest"`, the last verified version of each component, unless the config names versions: `compat: { 'my-plugin': { renderer: '1.4.0', populate: '4.7.1' } }`. An invalid plugin or `compat` fails `lint` and `explain` with `CONFIG_INVALID`, pointing at the problem.
5. **Tests:** through `lint()`, as in [section 5](#5-tests).

Two things core does not do for plugin rules:

- **Stale suppressions:** a suppression of a plugin rule's finding is applied when it hides a finding, and stale when its file or target is gone. When the target exists and the rule reported nothing there, it is not assessed, because core cannot tell whether a plugin rule completed its check.
- **Coverage:** a plugin rule never makes a site unchecked in the report's expression coverage.

## 9. Verify

1. `npm run check`: type-check, lint, format check, build, tests and package checks. It must pass.
2. `npx sdc-lint explain <rule-id>` prints the rule's documentation; `npx sdc-lint explain` lists it with its default severity. Both use the built CLI, so run `npm run build` first. For a Smart Forms rule, list the plugin with a config: `npx sdc-lint explain smart-forms/<rule-name> --config packages/plugin-smart-forms/scripts/corpus.config.mjs`.
3. `npm run corpus` lints the local corpus with the built-in rules and prints the findings added or removed since its snapshot; `npm run corpus -- --smart-forms` does the same with the Smart Forms plugin. Review every added finding: an `error` rule merges only with zero false positives. The corpus is local and never committed; slice 0 of [core-rules.md](core-rules.md#0-corpus) lists its forms, and the PR description reports the changes in findings by rule ID, count and JSON Pointer. Without a `corpus/` directory the command exits with a message. Copy in the public forms slice 0 lists, or say in the PR description that the corpus was not run, so that a reviewer who has it can run it before the PR merges.
4. `npm run docs:build` builds the documentation site, with the rule's page in the [rules library](rules/index.md). `npm run docs:dev` serves it, to read the page.
5. `npm run demo -- <config.yaml>` generates a SUSHI project from one lint case config into `demo/<instance>`, then compiles and lints it with the built-in rules, to try a form by hand. Without an argument it uses `packages/core/test/cases/demo/invalid-demo.yaml`. Add `--smart-forms` to lint with the Smart Forms plugin as well.

For a plugin outside this repository, run your own tests, then list the plugin in an `.mjs` config in an IG and run `sdc-lint explain <rule-id>` and `sdc-lint lint` there.

## 10. Not yet available

The contract does not offer these yet. Don't build on them; each will be documented here when it lands.

- **Rule options.** `ctx.options` exists in the contract but is always `undefined`: a config cannot pass options to a rule.
- **Stability.** There is no `stability` field (`preview` or `stable`) in `meta`; every rule runs as it is.
- **Suggested edits.** `RuleFinding` has no field for a suggested edit, although the report format has `suggestions`. Put the fix in `help`.

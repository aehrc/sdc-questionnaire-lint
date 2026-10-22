# Add your own rule

Your own rules check what the built-in ones don't, such as a house style or the behaviour of the application that runs your forms. A rule lives in a plugin: a JavaScript object you list in the config. It can be a file in your project or an npm package.

## 1. Write the plugin

Save this as `my-rules.mjs` next to your config. It adds one rule, `my-rules/no-today`, which reports expressions that call `today()`:

```js
// my-rules.mjs
/** @type {import('@aehrc/sdc-questionnaire-lint').LintPlugin} */
export default {
  meta: { name: 'my-rules', version: '1.0.0' },
  rules: {
    'no-today': {
      meta: {
        description: 'Reports FHIRPath expressions that call today().',
        defaultSeverity: 'warning',
        // Optional: printed by sdc-lint explain my-rules/no-today. Give all five fields.
        docs: {
          checks: 'Every FHIRPath expression and x-fhir-query fragment that calls today().',
          why: 'The value depends on the day the form is opened, so the same answers give different results.',
          exampleMessage: 'This expression calls today(), so its value depends on the day the form is opened.',
          fix: 'Read the date from an answer or a host variable instead.',
          limitations: 'Matches the text today(); a call written with spaces is not reported.',
        },
      },
      check(ctx) {
        for (const site of ctx.sites) {
          if (site.language !== 'text/fhirpath' || site.text === undefined) continue;
          const start = site.text.indexOf('today()');
          if (start === -1) continue;
          ctx.report({
            site,
            message: 'This expression calls today(), so its value depends on the day the form is opened.',
            help: 'read the date from an answer or a host variable instead',
            range: { startOffset: start, endOffset: start + 'today'.length },
          });
        }
      },
    },
  },
};
```

A rule's ID is `<plugin name>/<rule key>`. Names and keys use lowercase letters, digits and hyphens; `sdc` and `lint` are reserved.

## 2. Enable it

List the plugin in `sdc-questionnaire-lint.config.mjs`. Only an `.mjs` config can load a plugin; a JSON config cannot. `rules` can change a rule's severity to `error`, `warning` or `info`, or turn it `off`:

```js
// sdc-questionnaire-lint.config.mjs
import { defineConfig } from '@aehrc/sdc-questionnaire-lint';
import myRules from './my-rules.mjs';

export default defineConfig({
  plugins: [myRules],
  rules: { 'my-rules/no-today': 'error' },
});
```

## 3. Run it

```console
$ npx sdc-lint lint "questionnaires/*.json"
questionnaires/age.json: error my-rules/no-today This expression calls today(), so its value depends on the day the form is opened.
  %resource.item.where(linkId = 'dob').answer.value <= today() - 18 years
                                                       ^~~~~
  help: read the date from an answer or a host variable instead

1 finding (1 error, 0 warnings, 0 info) in 1 questionnaire.
```

Your rule's findings are reported, suppressed and counted like the built-in ones, in every output format. `npx sdc-lint explain` lists your rule with the others.

## What a rule can use

`check(ctx)` runs once per Questionnaire. `ctx` gives:

| Field | What it gives |
| :- | :- |
| `ctx.sites` | Every expression in the Questionnaire, in document order. A site has its `language`, `text`, `name`, `item` and JSON `pointer`. Each `{{…}}` fragment of an x-fhir-query is a site of its own, with the language `text/fhirpath` |
| `ctx.declarations` | Every declared name: variables, other named expressions, launchContexts and extractAllocateIds |
| `ctx.referencesAt(site)` | The `%name` references in a site's FHIRPath |
| `ctx.variablesAt(site)` | The names an expression can reference at a site, and `resolve(name)`, the variable a name resolves to |
| `ctx.document` | The input file and the Questionnaire resource |
| `ctx.report(finding)` | Reports a finding |

`referencesAt` and `variablesAt` return `undefined` where the linter cannot analyse the site, such as an expression that does not parse. Report nothing there: the built-in rules already report the parse error.

A finding needs a `message`, and is placed at a `site` or, for something that is not an expression, at a JSON `pointer`. It can add `help` (the fix), `note` (context), `range` (the part of the expression to underline) and `relatedLocations` (other places involved, such as a second declaration of the same name).

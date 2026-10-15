# Local CLI

Run the linter on your machine while you write a form, before you push. It reports the same findings, with the same rule IDs and locations, as CI does.

## Add a script

In an IG, the linter reads the JSON SUSHI compiles, so compile first. Add a script to the IG's `package.json`:

```json
{
  "scripts": {
    "lint": "sushi . && sdc-lint lint"
  },
  "devDependencies": {
    "fsh-sushi": "3.20.1",
    "sdc-questionnaire-lint": "0.1.0"
  }
}
```

`npm run lint` then always lints freshly compiled JSON. Install both as development dependencies rather than globally, so everyone on the project, and CI, runs the same versions. The JSON report records the SUSHI version only when it is installed in the project.

## The edit loop

```console
$ npm run lint
input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
  %weight / %hieght.power(2)
            ^~~~~~~
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it
```

1. Open the FSH file at the line and column the finding names. Most terminals and editors open it on click.
2. Fix the FSH, not the generated JSON: SUSHI overwrites `fsh-generated/` on the next build.
3. Run `npm run lint` again.

A finding that has no FSH line shows the compiled file instead, with a `location:` line giving the resource and JSON Pointer, and a `note:` saying why it is not mapped. Use them to find the expression, then fix it in FSH.

The exit code is 0 when no errors remain, 1 when there are errors, and 2 when the run did not complete, such as a bad config or no Questionnaires found.

## Lint one form

Give paths to lint only some files. Quote a glob so the linter expands it, not the shell:

```sh
npx sdc-lint lint fsh-generated/resources/Questionnaire-intake.json
npx sdc-lint lint "fsh-generated/resources/Questionnaire-*.json"
```

Paths replace the config's `files` for that run. It is a *targeted run*: suppressions for other files are not assessed, so it never reports them as stale. Run `npm run lint` with no paths before you push to check everything.

The linter also lints Questionnaire or Bundle JSON that does not come from SUSHI. Findings then point at the JSON file and pointer.

## See info findings

Text output hides `info` findings, such as an expression the linter could not check. The summary says how many it hid. Show them with:

```sh
npx sdc-lint lint --show-info
```

## Look up a rule

```sh
npx sdc-lint explain                         # every rule, with its default and effective severity
npx sdc-lint explain sdc/undefined-variable  # what it checks, why, an example and how to fix it
```

`explain` works offline and includes the rules of the plugins your config lists. The [rules library](../rules/index.md) has the same pages with example forms.

## Query the findings

For scripts, or to hand the findings to an AI agent, ask for the JSON report:

```sh
npx sdc-lint lint --format json > lint-report.json
jq '.findings[] | {ruleId, severity, message}' lint-report.json
```

Keep SUSHI's log out of the report: compile in a separate command, or send its output to stderr. [JSON report format](../report-format.md) describes every field.

## Next

- [Configuration](../configuration.md): change severities, list host variables and add plugins.
- [Suppression](../suppression.md): hide a finding you have reviewed.
- [VS Code](vscode.md): see the findings in the Problems panel.

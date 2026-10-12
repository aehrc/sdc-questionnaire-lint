import type { Command } from './args.js';

const topLevel = `sdc-lint checks FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires.

usage: sdc-lint <lint|explain> [options]

commands:
  lint [paths...]      check Questionnaires and report findings
  explain [rule-id]    explain a rule, or list the registered rules

options:
  --config <path>      use this config file instead of discovery
  --help               print help and exit
  --version            print the linter version and exit

run sdc-lint <command> --help for the command's options and examples
`;

const lint = `usage: sdc-lint lint [paths...] [options]

Check Questionnaires and report findings. Paths are files, directories or quoted
globs. With no paths, lint the config's files, otherwise fsh-generated/resources.
The linter reads compiled JSON: run sushi . after editing FSH.

options:
  --config <path>      use this config file; by default sdc-questionnaire-lint.config.json
                       or .mjs is read from the current directory, if present
  --format <format>    output format on stdout: text (default), json, github for
                       GitHub Actions annotations and job summary, or sarif
  --show-info          include info findings in text output
  --help               print help and exit
  --version            print the linter version and exit

examples:
  sdc-lint lint
  sdc-lint lint fsh-generated/resources/Questionnaire-intake.json
  sdc-lint lint "fsh-generated/resources/Questionnaire-*.json"
  sdc-lint lint --config ig/sdc-questionnaire-lint.config.json
  sdc-lint lint --format json > report.json
  sdc-lint lint --format sarif > lint.sarif

exit codes:
  0  analysis completed with no unsuppressed errors; warnings and info may remain
  1  analysis completed with one or more unsuppressed errors
  2  the run did not complete: bad config, unreadable input, no Questionnaires
     found, a rule crash, or wrong usage
`;

const explain = `usage: sdc-lint explain [rule-id] [options]

Print a rule's documentation. With no rule ID, list every registered rule with its
default and effective severity. Plugin rules are registered only when the plugin
is listed in the selected .mjs config.

options:
  --config <path>      use this config file instead of discovery
  --help               print help and exit
  --version            print the linter version and exit

examples:
  sdc-lint explain
  sdc-lint explain sdc/undefined-variable
  sdc-lint explain smart-forms/repeating-group-variable --config ig/sdc-questionnaire-lint.config.mjs
`;

export function helpText(command?: Command): string {
  switch (command) {
    case undefined:
      return topLevel;
    case 'lint':
      return lint;
    case 'explain':
      return explain;
  }
}

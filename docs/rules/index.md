<script setup>
import { data } from './rules.data.ts';
import RuleTable from './RuleTable.vue';
</script>

# Rules library

Every rule the linter ships, with a page each. A page says what the rule checks, why it matters, how to fix what it reports and what it cannot see, as `sdc-lint explain <rule-id>` prints it. It adds an example form in FSH with the Questionnaire SUSHI compiles from it and the findings the rule reports on it, the lint cases that test the rule, and the rule's source.

The examples and the test cases are the rule's lint cases: each is a minimal form in YAML beside the findings the linter must report for it, compiled by SUSHI. [Testing rules with lint cases](../lint-cases/index.md) explains how they are written and checked.

## Core rules

The `sdc` rules check the expressions of a Questionnaire against the SDC specification and the FHIRPath engine. They run by default, at the severity shown, which a config can change ([Configuration](../../README.md#configuration)). `lint/stale-suppression` checks the suppressions in the config.

<RuleTable :rules="data.core" />

## Smart Forms rules

The `smart-forms` rules report where [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from SDC, in the versions selected in `compat`. They run only when the plugin is listed in an `.mjs` config ([The Smart Forms plugin](../../README.md#the-smart-forms-plugin)).

<RuleTable :rules="data['smart-forms']" />

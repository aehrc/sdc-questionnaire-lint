<script setup>
import { data } from './rules.data.ts';
import RuleTable from './RuleTable.vue';
</script>

# Lint rules

Every rule the linter ships, with a page each. A page says what the rule checks and shows an example message and an example form in FSH, with the lines the rule reports highlighted. `sdc-lint explain <rule-id>` prints the full documentation: why the rule matters, how to fix what it reports and what it cannot see.

Each example is one of the rule's lint cases: a minimal form in YAML, compiled by SUSHI. [Testing rules with lint cases](../lint-cases/index.md) explains how they are written and checked.

## Core rules

The `sdc` rules check the expressions of a Questionnaire against the SDC specification and the FHIRPath engine. They run by default, at the severity shown, which a config can change ([Configuration](../../README.md#configuration)). `lint/stale-suppression` checks the suppressions in the config.

<RuleTable :rules="data.core" />

## Smart Forms rules

The `smart-forms` rules report where [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from SDC, in the versions selected in `compat`. They run only when the plugin is listed in an `.mjs` config ([The Smart Forms plugin](../../README.md#the-smart-forms-plugin)).

<RuleTable :rules="data['smart-forms']" />

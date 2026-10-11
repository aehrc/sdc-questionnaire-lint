---
name: add-rule
description: Add a lint rule by working through docs/adding-a-rule.md section by section, ending on a passing `npm run check` and `sdc-lint explain`. Use when asked to add, write or create a rule, whether a core `sdc/` rule, a `smart-forms/` rule or a rule in a plugin package.
---

# Add a rule

`docs/adding-a-rule.md`, the guide, is the single source of truth for what to do. This skill gives the order and the check that ends each step. At each step, read the guide sections it names, then do what they say. Paths are from the repository root, and § means a section of the guide.

Every step ends on a **Done when**. Move on only when it holds.

## 1. Pick the path

Read the guide's opening table and choose one path:

- **core**: `sdc/<rule-name>` in `packages/core`, finished with §6;
- **smart-forms**: `smart-forms/<rule-name>` in `packages/plugin-smart-forms`, finished with §7;
- **plugin**: `<plugin name>/<rule-name>` in a plugin package, finished with §8.

**Done when** you have the path, the rule ID and the checklist section you will finish with.

## 2. Decide it should be a rule

Read §1. Run `npm run build`, then `npx sdc-lint explain` to list the existing rules and check for overlap.

For core or smart-forms, read the "Before you start" paragraph of §6 or §7, then the rule's slice in `docs/core-rules.md` or `docs/smart-forms-rules.md` and the decisions it cites. When no slice describes the rule, draft one as that paragraph says, then stop and give it to the user to agree with the maintainers.

**Done when** you can state in one line each how the rule is deterministic, has a low false-positive rate, is satisfiable and repeats nothing; you have named where it belongs and the root causes other rules already report; and, for core or smart-forms, you have read the slice. When a criterion fails, stop and tell the user which one.

## 3. Write the rule

Read §2, §3, §4 and §10. Write the rule file at the path step 1 of your checklist names, modelled on the example rules the guide links.

**Done when**:

- `check` is synchronous and pure, as §2 lists;
- the rule reports nothing where its analysis returns `undefined`;
- every finding meets §3's validity list, and its `message` and `help` follow §3's message bullets;
- the default severity matches §3's definition of it;
- `meta.docs` has all five §4 fields, with `exampleMessage` built by the same function as the message in `check`;
- nothing from §10 is used.

## 4. Register the rule

Follow your checklist's registration steps: §6 step 2 for core, §7 steps 2 and 3 for smart-forms, §8 steps 1 to 4 for a plugin.

**Done when** each item of those steps is either done or does not apply, and you can give the reason for each one that does not apply. For core, the `completesCheck` predicate matches exactly what `check` skips.

## 5. Test the rule

Read §5 and your checklist's test step.

In this repository, write lint cases, then run `npx vitest run -u packages/<package>/test/cases` and `git diff --stat` to see every expected file that changed. Outside it, write `lint()` tests as §5 describes.

**Done when**:

- a case covers each kind of finding, each `help` text, each skipped site and each silence §5 lists;
- you have read every changed expected file, including other rules' cases, and handled each new finding as §5 says;
- for core, the rule lists that §6 step 3 names include the rule;
- `npm test` passes.

## 6. Update the docs and the plan

Follow the rest of your checklist: §6 steps 4 to 7 for core, §7 steps 5 to 7 for smart-forms. A plugin outside this repository documents the rule in its own package.

**Done when** each of those steps is done or does not apply.

## 7. Verify

Read §9 and run its steps for your path.

**Done when**:

- `npm run check` passes. When it fails, fix the cause and run it again;
- after `npm run build`, `npx sdc-lint explain <rule-id>` prints the rule's five `meta.docs` sections, and `npx sdc-lint explain` lists the rule with its default severity. For smart-forms, pass the `--config` that §9 gives;
- `npm run docs:build` passes, so the rule has its page in the rules library;
- you have run the corpus as §9 says and reviewed every added finding, or you know it was not run.

Then report to the user: the rule ID and default severity, the files changed, the corpus findings by rule ID, count and JSON Pointer, or that the corpus was not run, and any step you stopped at for their decision.

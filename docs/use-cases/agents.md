# AI agents

Give a coding agent, such as Claude Code, Codex, Cursor or Copilot, the same linter you run. It checks the agent's FSH edits the moment they are made, and tells it what to change. There is no separate agent mode: an agent runs the same command, gets the same findings and the same exit code as you and CI.

## Why lint in an agent's loop

Agents writing SDC forms make the mistakes the linter is built for: a variable name that is close but wrong, a FHIRPath function that does not exist, a linkId from another form, a `{{…}}` fragment that does not parse. FHIRPath returns an empty collection for a path that does not exist, so none of these fails when the form loads. The field just stays empty.

The linter catches them without running the form, and each finding gives an agent what it needs to act: the FSH file and line, the rule ID, a message that says what goes wrong in the form, and a `help:` line that names the change.

```text
input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
  %weight / %hieght.power(2)
            ^~~~~~~
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it
```

## Tell the agent

Add the linter to the instructions your agent reads. Most agents, including Codex, Cursor and Copilot, read `AGENTS.md` at the repository root; for Claude Code, import it from `CLAUDE.md` with a line that says `@AGENTS.md`. Paste this into the IG's `AGENTS.md`:

```markdown
## Linting forms

- After changing FSH, run `npm run lint`. It compiles the IG with SUSHI, then runs sdc-lint on the
  compiled Questionnaires. Do not finish with lint errors.
- Fix findings in the FSH under `input/fsh/`. Never edit `fsh-generated/`: SUSHI overwrites it.
- To understand a finding, run `npx sdc-lint explain <rule-id>`: it says what the rule checks, why
  it matters and how to fix it.
- Never add or widen a `suppress` entry, set a rule to `off` or lower its severity, or add a name to
  `hostVariables` to make a finding go away. If you think a finding is wrong, stop and ask.
```

The last rule matters most. An agent that cannot fix a finding may look for the quickest way to make it disappear, and the config offers several. `hostVariables` is a change of meaning, not a fix: it says the application running the form supplies the name, which the agent cannot know.

The script `npm run lint` is the one [Local CLI](local.md#add-a-script) sets up: `sushi . && sdc-lint lint`.

## Lint every edit with a Claude Code hook

Instructions ask; a hook enforces. A Claude Code `PostToolUse` hook runs after every edit Claude makes. This one compiles the IG and lints it whenever Claude edits an FSH file or the linter config, and hands any errors straight back to Claude, which fixes them before it moves on.

Save the script as `.claude/hooks/sdc-lint.sh` in the IG and make it executable with `chmod +x`:

```sh
#!/bin/sh
# Claude Code PostToolUse hook: after an edit to an FSH file or the linter config, compile the IG
# with SUSHI and lint it. Exit 2 hands the output to Claude; exit 0 lets it carry on.

file=$(node -e '
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => console.log(JSON.parse(input).tool_input?.file_path ?? ""));
')

case "$file" in
  *.fsh | */sdc-questionnaire-lint.config.json | */sdc-questionnaire-lint.config.mjs) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0

if ! build=$(npx --no-install sushi . 2>&1); then
  echo "SUSHI could not compile the FSH, so the forms were not linted:" >&2
  printf '%s\n' "$build" | tail -n 30 >&2
  exit 2
fi

if lint=$(npx --no-install sdc-lint lint 2>&1); then
  exit 0
fi
printf '%s\n' "$lint" >&2
exit 2
```

Register it in `.claude/settings.json`, which you commit so the whole team gets it:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/sdc-lint.sh",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

How the script maps the outcome to the hook:

| Outcome | Hook exit | Claude sees |
| :- | :- | :- |
| The edited file is not FSH or the linter config | 0 | Nothing |
| SUSHI fails | 2 | The end of SUSHI's log, which names the FSH error |
| The linter exits 0: no errors, warnings allowed | 0 | Nothing |
| The linter exits 1 (errors) or 2 (the run did not complete) | 2 | The linter's output: every finding and the summary |

- Only errors stop Claude, because only errors fail the run. Warnings would make it loop on findings that may be acceptable. To make Claude fix a rule's findings every time, set that rule to `error` in [`rules`](../configuration.md#rules); CI then fails on it too.
- The hook reads the edited path from the JSON Claude Code sends on stdin. It uses Node, which the IG already needs, to parse it.
- `npx --no-install` runs the project's own SUSHI and linter, and fails rather than download them.
- If the IG is in a subdirectory, change the `cd` to `cd "$CLAUDE_PROJECT_DIR/ig"`.
- Each run compiles the whole IG, which takes a few seconds. Raise `timeout`, in seconds, for a large IG.

Other agents have their own hook mechanisms; the same script works wherever the agent can run a command after an edit and read its output.

## Which output to give an agent

| Need | Use |
| :- | :- |
| The findings to fix | The default text output. It is short, and each finding has its FSH line and a `help:` line |
| Why a rule matters and how to fix it | `npx sdc-lint explain <rule-id>` |
| Findings to process with code | `--format json`. Check `status` first: `"failed"` means the run did not complete, and has no findings |
| A quick check of the file being edited | `npx sdc-lint lint fsh-generated/resources/Questionnaire-<id>.json` |

`explain` is the agent's documentation, and works offline:

```console
$ npx sdc-lint explain sdc/unresolved-linkid
sdc/unresolved-linkid
Reports a literal linkId that no item in the Questionnaire has.

Default severity: warning. Effective severity: warning.

What it checks
  …

Why it matters
  A linkId that no item has selects nothing, so the expression silently works on an empty value. …

Example message
  No item in this Questionnaire has linkId 'smokr'.

How to fix it
  Correct the linkId in the FSH rule that sets the expression, or add the item, then run SUSHI again. …

Known limitations
  …
```

Linting one file is faster, but it is a *targeted run*: it does not check stale suppressions for other files. Have the agent finish with a full `npm run lint`.

Keep SUSHI's log out of a JSON report: compile in a separate command, as `npm run lint` does, or send SUSHI's output to stderr.

# VS Code

Show the linter's findings in VS Code's Problems panel and as squiggles in your FSH files, without an extension. A VS Code task runs the linter, and a problem matcher reads its text output.

## Add the task

Create `.vscode/tasks.json` in the IG:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "sdc-lint",
      "type": "shell",
      "command": "npx sushi . && npx sdc-lint lint --show-info",
      "options": {
        "env": { "NO_COLOR": "1" }
      },
      "group": "test",
      "presentation": { "reveal": "silent", "clear": true },
      "problemMatcher": [
        {
          "owner": "sdc-lint",
          "source": "sdc-lint",
          "fileLocation": ["relative", "${workspaceFolder}"],
          "pattern": {
            "regexp": "^([^\\s:][^:]*):(\\d+):(\\d+): (error|warning|info) (\\S+) (.*)$",
            "file": 1,
            "line": 2,
            "column": 3,
            "severity": 4,
            "code": 5,
            "message": 6
          }
        },
        {
          "owner": "sdc-lint",
          "source": "sdc-lint",
          "fileLocation": ["relative", "${workspaceFolder}"],
          "pattern": {
            "kind": "file",
            "regexp": "^([^\\s:][^:]*): (error|warning|info) (\\S+) (.*)$",
            "file": 1,
            "severity": 2,
            "code": 3,
            "message": 4
          }
        }
      ]
    }
  ]
}
```

Run it with **Terminal › Run Task… › sdc-lint**. The findings appear in the Problems panel (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>), each with its rule ID, and clicking one opens the FSH file at the expression. The next run replaces them, so a fixed finding disappears.

## How it works

Every finding in text output starts with one line in a fixed format, made for problem matchers:

```text
input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
fsh-generated/resources/Questionnaire-intake.json: info sdc/external-expression This expression has no text, only the reference http://example.org/Library/demo, so it was not checked.
sdc-questionnaire-lint.config.json: warning lint/stale-suppression A suppression of sdc/undefined-variable hides nothing: the rule checked this expression and found no problem.
```

- The first matcher reads findings mapped to an FSH line: file, line, column, severity, rule ID and message.
- The second reads findings with no position: a finding the linter could not map to FSH, which names the compiled JSON file, and a finding about the config. VS Code shows them on the file as a whole.
- The lines below each finding, its excerpt and its `location:`, `note:` and `help:` lines, start with spaces, so neither matcher reads them. Read them in the task's terminal.

The task's settings each have a reason:

| Setting | Why |
| :- | :- |
| `npx sushi . &&` | The linter reads the compiled JSON, so compile the FSH first. Use `npm run lint` instead if your project has that script |
| `--show-info` | Text output hides `info` findings without it, so they would never reach the Problems panel |
| `NO_COLOR` | The task runs in a terminal, where the linter colours its output; colour codes would stop the matchers from matching |
| `fileLocation` | The linter prints paths relative to the directory it runs in, here the workspace folder |

## An IG in a subdirectory

If the IG is not the workspace folder, run the task in the IG and resolve paths against it. Set `cwd` and change both matchers' `fileLocation`:

```json
"options": {
  "cwd": "${workspaceFolder}/ig",
  "env": { "NO_COLOR": "1" }
},
```

```json
"fileLocation": ["relative", "${workspaceFolder}/ig"],
```

## Run it with a key

Bind the task to a key in your `keybindings.json` (**Preferences: Open Keyboard Shortcuts (JSON)**):

```json
{
  "key": "ctrl+alt+l",
  "command": "workbench.action.tasks.runTask",
  "args": "sdc-lint"
}
```

## Open a SARIF log instead

To browse a run's findings with their full detail, write a SARIF log and open it in a SARIF viewer extension, such as Microsoft's [SARIF Viewer](https://marketplace.visualstudio.com/items?itemName=MS-SarifVSCode.sarif-viewer):

```sh
npx sdc-lint lint --format sarif > lint.sarif
```

Run it from the workspace folder: file paths in the log are relative to the directory the linter ran in. Unlike the task, a SARIF log is a snapshot, and it does not update when you fix a finding.

## Next

- [Local CLI](local.md): the edit loop, linting one form and looking up a rule.
- [CI integration](ci.md): the same findings on every pull request.

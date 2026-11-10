# Verifying a new Smart Forms release

The Smart Forms plugin checks forms against the Smart Forms versions it has verified, listed in `compat.verified`, using [runtime facts](facts.md) recorded for each version. When Smart Forms publishes a renderer, populate or template-extract version the plugin hasn't verified, the weekly [Smart Forms versions workflow](../../.github/workflows/smart-forms-versions.yml) opens an issue that links here.

**Why it matters.** Projects that use the default `compat` are checked against the newest verified versions, not the versions they run. If the release changed a behaviour a rule relies on, the plugin can miss a real problem or report one that no longer exists. A project can't select the new versions either: naming an unverified version in `compat` fails with `CONFIG_INVALID`.

**The outcome** is a plugin release whose `compat.verified` lists the new versions, with facts that are true for them. Older versions stay verified, with their facts, so projects pinned to them keep working. The reproduction tests run against the newest pinned version only.

Most releases change nothing the facts describe. Then the work is steps 1 to 4, all in one pull request.

## 1. Check what changed

npm records the aehrc/smart-forms commit each version was published from (`npm view @aehrc/<package>@<version> gitHead`); the issue links the comparison between the newest verified version's commit and the new one. The question is whether the release changed a behaviour the facts describe:

- **populate and template-extract:** the reproduction tests answer it, in step 2.
- **renderer:** it has no reproduction tests yet; its facts cite source lines. List the files the facts cite, then see which changed between the two release commits, in a clone of aehrc/smart-forms:

```sh
# In this repository: the source files the facts cite.
grep -rhoE '(rendererSource|populateSource|inAppPopulateSource)\}[A-Za-z0-9/._-]+' packages/plugin-smart-forms/src/facts \
  | sed -e 's#^rendererSource}#packages/smart-forms-renderer/src/#' \
        -e 's#^populateSource}#packages/sdc-populate/src/SDCPopulateQuestionnaireOperation/utils/#' \
        -e 's#^inAppPopulateSource}#packages/sdc-populate/src/inAppPopulation/utils/#' \
  | sort -u > ../cited-files.txt

# In the Smart Forms clone: which of them changed.
xargs git diff --stat <verified gitHead> <new gitHead> -- < ../cited-files.txt
```

A changed file is not yet a changed behaviour. Open its diff and look at the lines each fact cites: the `#L<from>-L<to>` of its permalink, at the verified release commit. Code above them shifts their line numbers. For example, between renderer 1.4.0 and 1.5.0 `utils/manageForm.ts` changed, but not the line the `stale-forward-read` fact cites.

## 2. Run the reproduction tests against the new versions

1. In `packages/plugin-smart-forms/package.json`, set the dev dependencies `@aehrc/sdc-populate` and `@aehrc/sdc-template-extract` to the new versions.
2. For a new populate, rename the key in the root `package.json` `overrides` from `@aehrc/sdc-populate@<old>` to `@aehrc/sdc-populate@<new>`. The override replaces `fhirclient`, which populate declares but never imports, with an empty stub; the real one pulls in about 500 packages and an install script.
3. Run `npm install`. Don't use `npm install <package>@<version>`: it installs the real `fhirclient` even with the override renamed. `grep -c 'sdc-populate/node_modules/fhirclient' package-lock.json` must print 0, and the lockfile diff should be a few dozen lines.
4. Run `npm test -- packages/plugin-smart-forms/test/reproduction`.

If they all pass, nothing they cover changed. If one fails, a behaviour changed: see [When a behaviour changed](#when-a-behaviour-changed).

## 3. Record the new versions

When the reproduction tests pass and no cited renderer lines changed:

1. In `src/index.ts`, add each new version to the end of its list in `compat.verified`.
2. Give each new version the facts of the version before it. In each table in `src/facts/` (`embeddings`, `languages`, `names`, `prerequisites`, `source-queries`, `variables`), add the new version beside the previous one, with the same facts:

   ```ts
   renderer: Object.freeze({ '1.4.0': renderer140, '1.5.0': renderer140 }),
   populate: Object.freeze({ '4.7.1': populate471, '4.7.2': populate471 }),
   ```

   In `src/facts/extraction.ts`, add the template-extract version to `extractionFacts` the same way. `test/facts.test.ts` fails if a table misses a verified version. The permalinks keep citing the older release commit, which is right while the cited lines are unchanged.
3. Rename the version in the reproduction test titles and in the evidence that names them, so they name the version they run, for example `populate 4.7.1` to `populate 4.7.2`:

   ```sh
   grep -rlE 'populate 4\.7\.1' packages/plugin-smart-forms/src packages/plugin-smart-forms/test \
     | xargs sed -i '' 's/populate 4\.7\.1/populate 4.7.2/g'   # sed -i without '' on Linux
   ```

   Do the same for `template-extract <version>`.
4. In `test/index.test.ts`, the tests of `"latest"` expect the newest versions, and the unverified-version test lists the verified ones.
5. Update the version lists in the docs: the "verifies …" sentence in `README.md` and `packages/plugin-smart-forms/README.md`, the table in [Entry and compat](entry-and-compat.md), and the harness table in [Evidence and reproduction](evidence.md). Examples that name an older version stay as they are: it's still verified.
6. Run `npm run check`. With a local corpus, `npm run corpus -- --smart-forms` should show no changed findings.

## 4. Release

Merge the pull request with `Closes #<issue>`, then release the plugin as `AGENTS.md` describes: bump its `version` and publish a GitHub release tagged `sdc-questionnaire-lint-plugin-smart-forms@<version>`.

If a version won't be verified, close the issue and say why. The workflow never reopens a closed issue, and doesn't open another for the same versions.

## When a behaviour changed

A reproduction test fails, or a line a renderer fact cites changed. Then the new version needs its own facts, not a copy:

- In each affected table, give the new version a copy of the previous facts and change the ones that differ, each with evidence: a reproduction test, or a permalink at the new release commit (S11 in [smart-forms-rules.md](../smart-forms-rules.md)). A fact whose upstream bug the release fixes is left out for it ([Runtime facts](facts.md)).
- Update the rules that read those facts, with lint cases ([Adding a rule](../adding-a-rule.md)).
- The reproduction tests run only the newest pinned version, so a test changed to the new behaviour no longer reproduces the older version's fact. No release has needed this yet. Agree in the issue how the older version's evidence is kept, for example by pinning both versions under npm aliases, before changing the tests.

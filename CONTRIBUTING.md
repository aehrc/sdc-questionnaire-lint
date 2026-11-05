# Contributing to sdc-questionnaire-lint

Thank you for your interest in contributing to sdc-questionnaire-lint! This document
provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report
unacceptable behaviour to leonie.dickson@csiro.au.

## How to contribute

### Reporting bugs

Before creating a bug report, please check existing issues to avoid duplicates.
When creating a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behaviour vs actual behaviour
- Environment details (OS, Node version, linter version, and plugin versions)
- Any relevant logs or error messages

Do not attach restricted forms or excerpts of their expressions. Reduce the problem
to a minimal synthetic Questionnaire instead.

### Suggesting enhancements

Enhancement suggestions are welcome. When suggesting an enhancement:

- Use a clear, descriptive title
- Provide a detailed description of the proposed functionality
- Explain why this enhancement would be useful
- Consider any potential drawbacks or alternatives

### Pull requests

1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure `npm run check` passes.
4. Make sure your code follows the existing style conventions.
5. Write clear, descriptive commit messages.
6. Include relevant issue numbers in your PR description.

## Development setup

Requires Node 22.12 or later and npm 11.21.0, the version in `packageManager`:

```sh
nvm install && nvm use
npm install --global npm@11.21.0
npm ci
```

The [Development](README.md#development) section of the README describes the
packages and the development commands, and [AGENTS.md](AGENTS.md) lists the rest.

## Coding standards

- ESLint and Prettier enforce the code style; `npm run format` applies Prettier.
- Use the terms defined in [GLOSSARY.md](GLOSSARY.md) in code, messages and docs.
- Follow [docs/linter-design-guidelines.md](docs/linter-design-guidelines.md) when
  writing a rule, a message, a reporter or an output schema.
- Follow [docs/adding-a-rule.md](docs/adding-a-rule.md) when adding or changing a rule.

## Testing

```sh
npm run check            # type-check, lint, format check, build, test and package checks
npm test -- <pattern>    # run matching tests
```

A rule is tested with lint cases: `packages/<package>/test/cases/<rule>/<case>.yaml`
describes a minimal synthetic form, and `<case>.expected.yaml` beside it lists the
findings the linter must report. `npx vitest run -u packages/<package>/test/cases`
writes the expected files; review every change to them before committing.

## Licence

By contributing to sdc-questionnaire-lint, you agree that your contributions will be
licensed under the Apache License 2.0.

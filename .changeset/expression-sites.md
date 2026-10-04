---
'sdc-questionnaire-lint': minor
---

Discover the expressions in each Questionnaire and check their FHIRPath syntax.

- The walker finds every Expression object at the registered SDC locations (variable, calculatedExpression, enableWhenExpression, initialExpression, candidateExpression, answerExpression, contextExpression, itemPopulationContext, itemExtractionContext, answerOptionsToggleExpression, targetConstraint and cqf-expression on `_title`, `_text`, `_prefix` and `_answerValueSet`), on the root and on items at any depth. Any other object with a `language` and an `expression`, including in contained resources, is found as an unregistered site.
- New rule `sdc/parse-error` (error): a `text/fhirpath` expression that does not parse, with a caret at the position the parser stopped.
- New rule `sdc/unregistered-expression` (info): an expression in a place the linter does not recognise.
- The summary's `expressions.analysed` and `expressions.unchecked` counts are now real.
- `ExpressionSite` now carries `expressionPointer`, `carrier`, `location`, `registered`, `element`, `item`, `language`, `text`, `reference`, `name`, `declares` and `useCases`, and `RuleContext.sites` lists every site in the document. `ExpressionCarrier`, `RegisteredLocation` and `SiteItem` are exported.

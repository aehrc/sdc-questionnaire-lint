/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { LanguageRegistration } from 'shiki';

// A minimal FSH grammar for ```fsh blocks, which Shiki does not ship: comments, keywords, strings,
// codes, numbers and the * of a rule.
export const fsh: LanguageRegistration = {
  name: 'fsh',
  scopeName: 'source.fsh',
  repository: {},
  patterns: [
    { name: 'comment.line.double-slash.fsh', match: '//.*$' },
    { name: 'comment.block.fsh', begin: '/\\*', end: '\\*/' },
    {
      name: 'string.quoted.double.fsh',
      begin: '"',
      end: '"',
      patterns: [{ name: 'constant.character.escape.fsh', match: '\\\\.' }],
    },
    {
      name: 'keyword.other.fsh',
      match:
        '^(Alias|Profile|Extension|Logical|Resource|Instance|InstanceOf|Invariant|ValueSet|' +
        'CodeSystem|RuleSet|Mapping|Parent|Id|Title|Description|Usage|Source|Target|Severity|' +
        'Expression|XPath)(?=:)',
    },
    { name: 'keyword.operator.fsh', match: '^\\s*\\*' },
    { name: 'constant.other.code.fsh', match: '#[^\\s"]+' },
    { name: 'constant.language.fsh', match: '\\b(true|false)\\b' },
    { name: 'constant.numeric.fsh', match: '\\b\\d+(\\.\\d+)?\\b' },
  ],
};

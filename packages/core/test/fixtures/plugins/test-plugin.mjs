// A test plugin. finding-per-questionnaire reports once per Questionnaire, at its first item when
// it has one; second-rule reports the first expression of the first item, with a range.
export function testPlugin({ name = 'test', severity = 'warning' } = {}) {
  return {
    meta: { name, version: '1.0.0' },
    rules: {
      'finding-per-questionnaire': {
        meta: { description: 'Reports one finding per Questionnaire.', defaultSeverity: severity },
        check(ctx) {
          const { resource, resourcePointer } = ctx.document;
          const hasItem = Array.isArray(resource.item) && resource.item.length > 0;
          ctx.report({
            message: `Questionnaire ${resource.id ?? 'without id'} checked.`,
            help: 'this finding comes from the test plugin',
            pointer: hasItem ? `${resourcePointer}/item/0` : resourcePointer,
          });
        },
      },
      'second-rule': {
        meta: { description: 'Reports the first expression of the first item.', defaultSeverity: 'info' },
        check(ctx) {
          const { resource, resourcePointer } = ctx.document;
          const expression = resource.item?.[0]?.extension?.[0]?.valueExpression?.expression;
          if (typeof expression !== 'string') return;
          ctx.report({
            message: 'First expression found.',
            pointer: `${resourcePointer}/item/0/extension/0/valueExpression/expression`,
            range: { startOffset: 0, endOffset: 8 },
          });
        },
      },
    },
  };
}

export default testPlugin();

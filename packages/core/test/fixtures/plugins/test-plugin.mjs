// A test plugin: one rule that reports one finding per Questionnaire.
export function testPlugin({ name = 'test', severity = 'warning' } = {}) {
  return {
    meta: { name, version: '1.0.0' },
    rules: {
      'finding-per-questionnaire': {
        meta: { description: 'Reports one finding per Questionnaire.', defaultSeverity: severity },
        check(ctx) {
          ctx.report({ message: 'Questionnaire checked.', pointer: ctx.document.resourcePointer });
        },
      },
      'second-rule': {
        meta: { description: 'Reports nothing.', defaultSeverity: 'info' },
        check() {},
      },
    },
  };
}

export default testPlugin();

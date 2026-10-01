// A plugin whose rule throws, to test RULE_CRASH.
export default {
  meta: { name: 'crash', version: '1.0.0' },
  rules: {
    boom: {
      meta: { description: 'Throws on every Questionnaire.', defaultSeverity: 'error' },
      check() {
        throw new Error('boom');
      },
    },
  },
};

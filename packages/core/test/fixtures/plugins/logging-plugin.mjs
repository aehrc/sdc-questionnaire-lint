/* global console, process */
// A plugin that logs to stdout at import and inside its rule, which must not reach the report.
console.log('logging plugin imported');

export default {
  meta: { name: 'logging', version: '1.0.0' },
  rules: {
    chatty: {
      meta: { description: 'Logs while checking.', defaultSeverity: 'warning' },
      check(ctx) {
        console.log('checking %s', ctx.document.resource.id);
        process.stdout.write('direct write from a rule\n');
      },
    },
  },
};

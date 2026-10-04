// A test plugin whose one rule reports each expression site it receives, at that site, with the
// site's fields other than pointer as the JSON message.
export default {
  meta: { name: 'sites', version: '1.0.0' },
  rules: {
    record: {
      meta: { description: 'Reports every expression site.', defaultSeverity: 'info' },
      check(ctx) {
        for (const site of ctx.sites) {
          const fields = { ...site };
          delete fields.pointer;
          ctx.report({ message: JSON.stringify(fields), site });
        }
      },
    },
  },
};

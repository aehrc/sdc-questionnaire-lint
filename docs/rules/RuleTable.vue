<script setup lang="ts">
import { withBase } from 'vitepress';
import type { RuleSummary } from '../.vitepress/rules.js';

defineProps<{ rules: RuleSummary[] }>();
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Rule</th>
        <th>Default</th>
        <th>Reports</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="rule in rules" :key="rule.id">
        <td>
          <a :href="withBase(rule.link)"><code>{{ rule.id }}</code></a>
        </td>
        <td>{{ rule.severity }}</td>
        <td>{{ rule.description }}</td>
      </tr>
    </tbody>
  </table>
</template>

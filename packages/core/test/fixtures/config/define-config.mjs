// Resolves the package through the workspace link, as a user's config resolves the installed one.
import { defineConfig } from 'sdc-questionnaire-lint';

export default defineConfig({ files: ['fsh-generated/resources'] });

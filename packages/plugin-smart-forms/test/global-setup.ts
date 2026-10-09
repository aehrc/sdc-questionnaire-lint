import { build } from '../../../test/build.js';

// Plugin tests lint with the built plugin, which imports the built core. Core is built here too,
// so these tests also run alone from a clean checkout.
export default function setup(): void {
  build('sdc-questionnaire-lint');
  build('@sdc-questionnaire-lint/plugin-smart-forms');
}

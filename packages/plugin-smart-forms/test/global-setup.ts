import { build } from '../../../test/build.js';

// Plugin tests lint with the built plugin, which imports the built core. Core is built here too,
// so these tests also run alone from a clean checkout.
export default function setup(): void {
  build('@aehrc/sdc-questionnaire-lint');
  build('@aehrc/sdc-questionnaire-lint-plugin-smart-forms');
}

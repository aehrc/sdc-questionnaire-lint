import { build } from '../../../test/build.js';

// CLI tests run the built executable, so build core once before any test.
export default function setup(): void {
  build('sdc-questionnaire-lint');
}

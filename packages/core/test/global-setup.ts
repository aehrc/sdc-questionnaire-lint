import { execSync } from 'node:child_process';

// CLI tests run the built executable, so build core once before any test. Through a shell,
// because npm is npm.cmd on Windows and cannot be spawned directly.
export default function setup(): void {
  execSync('npm run build --workspace sdc-questionnaire-lint', { stdio: 'inherit' });
}

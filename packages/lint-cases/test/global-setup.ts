import { execSync } from 'node:child_process';

// The cases are linted by the built core, as a plugin's are, so build it once before any test.
// Through a shell, because npm is npm.cmd on Windows and cannot be spawned directly.
export default function setup(): void {
  execSync('npm run build --workspace sdc-questionnaire-lint', { stdio: 'inherit' });
}

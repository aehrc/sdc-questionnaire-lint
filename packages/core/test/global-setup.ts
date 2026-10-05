import { execFileSync } from 'node:child_process';

// CLI tests run the built executable, so build core once before any test.
export default function setup(): void {
  execFileSync('npm', ['run', 'build', '--workspace', 'sdc-questionnaire-lint'], {
    stdio: 'inherit',
  });
}

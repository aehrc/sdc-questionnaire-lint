import { execSync } from 'node:child_process';

// The workspaces built in this Vitest process. Kept on globalThis, because each project loads its
// global setup separately, but all of them run in the one main process.
const built = ((globalThis as { sdcLintBuilt?: Set<string> }).sdcLintBuilt ??= new Set());

// Builds a workspace package once per test run: CLI and plugin tests run the built dist. Through
// a shell, because npm is npm.cmd on Windows and cannot be spawned directly.
export function build(workspace: string): void {
  if (built.has(workspace)) return;
  execSync(`npm run build --workspace ${workspace}`, { stdio: 'inherit' });
  built.add(workspace);
}

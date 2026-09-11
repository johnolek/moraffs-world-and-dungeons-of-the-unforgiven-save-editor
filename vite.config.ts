import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The commit this build was made from, which every run log names: a replay has to run the engine
 * that produced the run.
 *
 * Where git cannot be asked, the commit comes from the `SOURCE_COMMIT` environment variable
 * instead: an image is built from a copy of the files with no repository beside them, and Coolify
 * passes the commit it checked out as that build argument. A build with neither says `unknown`
 * rather than failing.
 *
 * A tree with changes in it says `-dirty`, because the commit alone does not describe what was
 * built: somebody handed a run log cannot check it out and get this engine back, and the verdict
 * on such a run should carry the note that says so.
 */
export function engineCommit(): string {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const changes = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
    return changes === '' ? commit : `${commit}-dirty`;
  } catch {
    return process.env.SOURCE_COMMIT?.trim() || 'unknown';
  }
}

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.pic'],
  define: { __ENGINE_COMMIT__: JSON.stringify(engineCommit()) },
  plugins: [svelte(), viteSingleFile()],
  test: {
    // A server test starts a PGlite of its own, which takes about a second alone and several
    // under a full run of every file at once, so the default five seconds is not enough.
    testTimeout: 20000,
    // Each file gets a worker of its own by default, and spawning one is a tenth of a second
    // against test files that mostly take less than that. They share a worker instead, which is
    // safe here because no test file imports another one.
    isolate: false,
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', '*.test.ts'],
  },
});

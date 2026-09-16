import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The site bundles `server/boards.ts`, the one server module it may import a value from
 * (CLAUDE.md), so everything that module reaches by value is bundled for the browser too. A
 * `node:` module there is not an error at build time -- Vite leaves it out and the production
 * build happens to shake it away -- but the dev page fails to load it and comes up blank. This
 * walks the value imports out of `boards.ts` and fails on the first one that names a Node module.
 */

/** Node's own modules by their bare names, which older code imports without the `node:` prefix. */
const NODE_MODULES = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'net', 'os',
  'path', 'stream', 'url', 'util', 'zlib',
]);

/** Packages that only run on the server, which the site must not reach either. */
const SERVER_PACKAGES = new Set(['pg', '@electric-sql/pglite']);

const IMPORT = /^import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT = /^import\s+['"]([^'"]+)['"]/gm;

/** Every specifier a file imports for its values: `import type` lines are erased by the compiler
 *  and bring nothing along. */
function valueImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[1] === undefined) found.push(match[2]);
  }
  for (const match of source.matchAll(BARE_IMPORT)) found.push(match[1]);
  return found;
}

function isNodeModule(specifier: string): boolean {
  return specifier.startsWith('node:') || NODE_MODULES.has(specifier) || SERVER_PACKAGES.has(specifier);
}

/** The relative import resolved to a file, or null for one that is not a TypeScript source here. */
function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (candidate.endsWith('.ts') && existsSync(candidate)) return candidate;
  }
  return null;
}

/** The Node modules reachable by value from a file, each with the path that reached it. */
function nodeModulesReachedFrom(entry: string): string[] {
  const seen = new Set<string>();
  const reached: string[] = [];
  const walk = (file: string, path: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of valueImports(file)) {
      if (isNodeModule(specifier)) reached.push([...path, file, specifier].join(' -> '));
      const local = resolveLocal(file, specifier);
      if (local !== null) walk(local, [...path, file]);
    }
  };
  walk(entry, []);
  return reached;
}

describe('what the site imports from the server', () => {
  it('reaches no Node module by value from server/boards.ts', () => {
    expect(nodeModulesReachedFrom(resolve(__dirname, 'boards.ts'))).toEqual([]);
  });

  it('would catch server/worlds.ts, which draws a world with node:crypto', () => {
    expect(nodeModulesReachedFrom(resolve(__dirname, 'worlds.ts'))).toHaveLength(1);
  });
});

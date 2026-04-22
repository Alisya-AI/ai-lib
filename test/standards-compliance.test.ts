import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scanRoots = ['src', 'tools', 'test'];
const explicitAnyPattern = /(?:\bas\s+any\b|:\s*any\b|<\s*any\s*>|Record<[^>\n]*,\s*any\s*>)/u;

async function collectTypeScriptFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function findExplicitAnyLines(source: string): Array<{ line: number; text: string }> {
  const lines = source.split('\n');
  const matches: Array<{ line: number; text: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (explicitAnyPattern.test(lines[index])) {
      matches.push({ line: index + 1, text: lines[index].trim() });
    }
  }
  return matches;
}

test('no explicit any typing in src/tools/test TypeScript files', async () => {
  const violations: string[] = [];
  for (const relRoot of scanRoots) {
    const absRoot = path.join(packageRoot, relRoot);
    const files = await collectTypeScriptFiles(absRoot);
    for (const filePath of files) {
      const source = await fs.readFile(filePath, 'utf8');
      const fileMatches = findExplicitAnyLines(source);
      for (const match of fileMatches) {
        const relPath = path.relative(packageRoot, filePath);
        violations.push(`${relPath}:${match.line} ${match.text}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Explicit 'any' typing is not allowed:\n- ${violations.join('\n- ')}`
  );
});

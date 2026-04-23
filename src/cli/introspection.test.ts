import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { modulesCommand, slotsCommand } from './introspection.ts';
import type { CliFlags, Registry } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-introspection-'));
}

async function withRegistry(registry: Registry) {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return root;
}

async function captureStdout(fn: () => Promise<void>) {
  const chunks: string[] = [];
  const mutableStdout = process.stdout as unknown as { write: typeof process.stdout.write };
  const originalWrite = mutableStdout.write.bind(process.stdout);
  mutableStdout.write = ((chunk, encoding, callback) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
    return chunks.join('');
  } finally {
    mutableStdout.write = originalWrite;
  }
}

const registry: Registry = {
  version: 'test',
  slots: ['linter'],
  slot_defs: { linter: { kind: 'exclusive', description: 'Formatting and linting' } },
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' }
      }
    }
  },
  targets: { cursor: { output: '.cursor/rules/ai.md' } }
};

test('slotsCommand prints slot definitions', async () => {
  const packageRoot = await withRegistry(registry);
  const output = await captureStdout(() => slotsCommand({ packageRoot, flags: { _: ['list'] } as CliFlags }));
  assert.match(output, /slots:/);
  assert.match(output, /linter \(exclusive\)/);
});

test('modulesCommand list and explain produce expected output', async () => {
  const packageRoot = await withRegistry(registry);
  const listOutput = await captureStdout(() =>
    modulesCommand({ packageRoot, flags: { _: ['list'], language: 'typescript' } as CliFlags })
  );
  assert.match(listOutput, /modules \(typescript\):/);
  assert.match(listOutput, /eslint \(slot: linter\)/);

  const explainOutput = await captureStdout(() =>
    modulesCommand({ packageRoot, flags: { _: ['explain', 'eslint'], language: 'typescript' } as CliFlags })
  );
  assert.match(explainOutput, /module: eslint/);
  assert.match(explainOutput, /doc: languages\/typescript\/modules\/eslint\.md/);
});

test('modulesCommand explain throws for unknown module', async () => {
  const packageRoot = await withRegistry(registry);
  await assert.rejects(
    modulesCommand({ packageRoot, flags: { _: ['explain', 'missing'], language: 'typescript' } as CliFlags }),
    /Unknown module for typescript: missing/
  );
});

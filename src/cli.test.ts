import test from 'node:test';
import assert from 'node:assert/strict';

import { run } from './cli.ts';

function captureStdoutSync(fn: () => void): string {
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
    fn();
    return chunks.join('');
  } finally {
    mutableStdout.write = originalWrite;
  }
}

test('run prints help for --help flag', async () => {
  const output = captureStdoutSync(() => {
    run(['--help'], { cwd: process.cwd(), packageRoot: process.cwd() });
  });
  assert.match(output, /ailib commands:/);
});

test('run rejects unknown command', async () => {
  await assert.rejects(
    async () => run(['unknown-command'], { cwd: process.cwd(), packageRoot: process.cwd() }),
    /Unknown command: unknown-command/
  );
});

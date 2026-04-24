import test from 'node:test';
import assert from 'node:assert/strict';

import { printHelp } from './help.ts';

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

test('printHelp renders expected command listing', () => {
  const output = captureStdoutSync(() => {
    printHelp();
  });

  assert.match(output, /ailib commands:/);
  assert.match(output, /ailib init/);
  assert.match(output, /ailib modules explain <module>/);
  assert.match(output, /ailib skills init <skill-id>/);
  assert.match(output, /ailib skills validate/);
});

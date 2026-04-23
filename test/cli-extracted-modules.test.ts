import test from 'node:test';
import assert from 'node:assert/strict';

import { getStringFlag, parseFlags } from '../src/cli/flags.ts';
import { printHelp } from '../src/cli/help.ts';

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

test('parseFlags parses positional and typed boolean values', () => {
  const flags = parseFlags(['init', '--language=typescript', '--dry-run=true', '--cache=false', '--verbose']);

  assert.deepEqual(flags._, ['init']);
  assert.equal(getStringFlag(flags, 'language'), 'typescript');
  assert.equal(flags['dry-run'], true);
  assert.equal(flags.cache, false);
  assert.equal(flags.verbose, true);
});

test('getStringFlag returns undefined for non-string values', () => {
  const flags = parseFlags(['--enabled=true', '--count=3']);
  assert.equal(getStringFlag(flags, 'enabled'), undefined);
  assert.equal(getStringFlag(flags, 'missing'), undefined);
  assert.equal(getStringFlag(flags, 'count'), '3');
});

test('printHelp renders expected command listing', () => {
  const output = captureStdoutSync(() => {
    printHelp();
  });

  assert.match(output, /ailib commands:/);
  assert.match(output, /ailib init/);
  assert.match(output, /ailib modules explain <module>/);
});

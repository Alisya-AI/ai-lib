import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { run } from './cli.ts';

async function captureStdout(fn: () => Promise<void>): Promise<string> {
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

test('run prints help for --help flag', async () => {
  const output = await captureStdout(async () => {
    await run(['--help'], { cwd: process.cwd(), packageRoot: process.cwd() });
  });
  assert.match(output, /ailib commands:/);
});

test('run rejects unknown command', async () => {
  await assert.rejects(
    async () => run(['unknown-command'], { cwd: process.cwd(), packageRoot: process.cwd() }),
    /Unknown command: unknown-command/
  );
});

test('run prints package version for version aliases', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8')) as { version: string };
  const expected = `${pkg.version}\n`;

  const longFlagOutput = await captureStdout(async () => {
    await run(['--version'], { cwd: process.cwd(), packageRoot: process.cwd() });
  });
  assert.equal(longFlagOutput, expected);

  const shortFlagOutput = await captureStdout(async () => {
    await run(['-v'], { cwd: process.cwd(), packageRoot: process.cwd() });
  });
  assert.equal(shortFlagOutput, expected);

  const commandOutput = await captureStdout(async () => {
    await run(['version'], { cwd: process.cwd(), packageRoot: process.cwd() });
  });
  assert.equal(commandOutput, expected);
});

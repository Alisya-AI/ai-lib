#!/usr/bin/env bun
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function resolveRun() {
  try {
    return (await import('../dist/runtime/cli.js')).run;
  } catch {
    return (await import('../src/cli.ts')).run;
  }
}

const run = await resolveRun();
run(process.argv.slice(2), { packageRoot }).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

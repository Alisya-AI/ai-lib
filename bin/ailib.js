#!/usr/bin/env bun
import { run } from '../src/cli.ts';

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

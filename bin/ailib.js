#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { getStringFlag, parseFlags } from './flags.ts';

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

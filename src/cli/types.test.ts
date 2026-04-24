import test from 'node:test';
import assert from 'node:assert/strict';

import type { CliFlags, CommandContext, RunOptions, WorkspaceConfig } from './types.ts';

test('types module supports expected shape usage', () => {
  const runOptions: RunOptions = { cwd: '/tmp/project', packageRoot: '/tmp/pkg' };
  const flags: CliFlags = { _: ['init'], language: 'typescript', dryRun: true };
  const config: WorkspaceConfig = {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code'],
    skills: ['task-driven-gh-flow']
  };
  const context: CommandContext = { cwd: '/tmp/project', packageRoot: '/tmp/pkg', flags };

  assert.equal(runOptions.cwd, '/tmp/project');
  assert.equal(context.flags._[0], 'init');
  assert.equal(config.modules?.[0], 'eslint');
  assert.equal(config.skills?.[0], 'task-driven-gh-flow');
});

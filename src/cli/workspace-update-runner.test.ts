import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceUpdateRunner } from './workspace-update-runner.ts';

test('createWorkspaceUpdateRunner forwards args and config to core runner', async () => {
  const calls: unknown[] = [];
  const canonicalSlot = () => null;
  const runner = createWorkspaceUpdateRunner({
    configFile: 'ailib.config.json',
    localOverrideFile: 'ailib.local.json',
    canonicalSlot,
    coreRunner: async (args) => {
      calls.push(args);
    }
  });

  await runner({
    packageRoot: '/pkg',
    rootDir: '/root',
    workspaceOverride: 'apps/web',
    forceOnConflict: 'overwrite'
  });

  assert.equal(calls.length, 1);
  const first = calls[0] as {
    packageRoot: string;
    rootDir: string;
    workspaceOverride?: string;
    forceOnConflict?: string;
    configFile: string;
    localOverrideFile: string;
    canonicalSlot: typeof canonicalSlot;
  };
  assert.equal(first.packageRoot, '/pkg');
  assert.equal(first.rootDir, '/root');
  assert.equal(first.workspaceOverride, 'apps/web');
  assert.equal(first.forceOnConflict, 'overwrite');
  assert.equal(first.configFile, 'ailib.config.json');
  assert.equal(first.localOverrideFile, 'ailib.local.json');
  assert.equal(first.canonicalSlot, canonicalSlot);
  assert.deepEqual(
    {
      packageRoot: first.packageRoot,
      rootDir: first.rootDir,
      workspaceOverride: first.workspaceOverride,
      forceOnConflict: first.forceOnConflict,
      configFile: first.configFile,
      localOverrideFile: first.localOverrideFile
    },
    {
      packageRoot: '/pkg',
      rootDir: '/root',
      workspaceOverride: 'apps/web',
      forceOnConflict: 'overwrite',
      configFile: 'ailib.config.json',
      localOverrideFile: 'ailib.local.json'
    }
  );
});

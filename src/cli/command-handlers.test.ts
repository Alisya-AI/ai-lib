import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandHandlers } from './command-handlers.ts';
import type { CommandContext, Registry } from './types.ts';

function noopUpdate() {
  return Promise.resolve();
}

const registryResolver = (_registry: Registry, slot: string | undefined) => slot || null;

test('createCommandHandlers wires calls to provided runners', async () => {
  const calls: string[] = [];
  const context: CommandContext = { cwd: '/tmp', packageRoot: '/tmp/pkg', flags: { _: [] } };
  const runners = {
    initCommand: async () => void calls.push('init'),
    updateCommand: async () => void calls.push('update'),
    addCommand: async () => void calls.push('add'),
    removeCommand: async () => void calls.push('remove'),
    doctorCommand: async () => void calls.push('doctor'),
    uninstallCommand: async () => void calls.push('uninstall'),
    slotsCommand: async () => void calls.push('slots'),
    modulesCommand: async () => void calls.push('modules')
  };

  const handlers = createCommandHandlers({
    configFile: 'ailib.config.json',
    localOverrideFile: 'ailib.local.json',
    lockFile: 'ailib.lock',
    resolveCanonicalSlot: registryResolver,
    applyWorkspaceUpdate: noopUpdate,
    runners
  });

  await handlers.init(context);
  await handlers.update(context);
  await handlers.add(context);
  await handlers.remove(context);
  await handlers.doctor(context);
  await handlers.uninstall(context);
  await handlers.slots(context);
  await handlers.modules(context);

  assert.deepEqual(calls, ['init', 'update', 'add', 'remove', 'doctor', 'uninstall', 'slots', 'modules']);
});

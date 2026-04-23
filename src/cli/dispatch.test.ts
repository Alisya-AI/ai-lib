import test from 'node:test';
import assert from 'node:assert/strict';

import { executeCommand, type CommandHandlers } from './dispatch.ts';
import { parseFlags } from './flags.ts';
import type { CommandContext } from './types.ts';

function createContext(args: string[]): CommandContext {
  return {
    cwd: '/tmp/workspace',
    packageRoot: '/tmp/package',
    flags: parseFlags(args)
  };
}

test('executeCommand prints help when command is empty', async () => {
  let printHelpCalls = 0;
  const handlers: CommandHandlers = {};

  await executeCommand({
    command: undefined,
    context: createContext([]),
    handlers,
    printHelp: () => {
      printHelpCalls += 1;
    }
  });

  assert.equal(printHelpCalls, 1);
});

test('executeCommand prints help for help aliases', async () => {
  let printHelpCalls = 0;
  const handlers: CommandHandlers = {};

  await executeCommand({
    command: '--help',
    context: createContext([]),
    handlers,
    printHelp: () => {
      printHelpCalls += 1;
    }
  });

  await executeCommand({
    command: '-h',
    context: createContext([]),
    handlers,
    printHelp: () => {
      printHelpCalls += 1;
    }
  });

  assert.equal(printHelpCalls, 2);
});

test('executeCommand dispatches to registered handler', async () => {
  const calls: string[] = [];
  const handlers: CommandHandlers = {
    update: async (context) => {
      calls.push(context.cwd);
      calls.push(context.packageRoot);
      calls.push(context.flags._[0] || '');
    }
  };

  await executeCommand({
    command: 'update',
    context: createContext(['service-a']),
    handlers,
    printHelp: () => {}
  });

  assert.deepEqual(calls, ['/tmp/workspace', '/tmp/package', 'service-a']);
});

test('executeCommand rejects unknown commands', async () => {
  await assert.rejects(
    executeCommand({
      command: 'unknown',
      context: createContext([]),
      handlers: {},
      printHelp: () => {}
    }),
    /Unknown command: unknown/
  );
});

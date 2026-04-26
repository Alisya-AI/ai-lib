import type { CommandContext } from './types.ts';

export type CommandHandler = (context: CommandContext) => Promise<void>;
export type CommandHandlers = Record<string, CommandHandler>;

export async function executeCommand({
  command,
  context,
  handlers,
  printHelp,
  printVersion
}: {
  command: string | undefined;
  context: CommandContext;
  handlers: CommandHandlers;
  printHelp: () => void;
  printVersion: () => void;
}): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    printVersion();
    return;
  }

  const handler = handlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  await handler(context);
}

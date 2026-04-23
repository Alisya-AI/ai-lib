import type { CommandContext } from './types.ts';

export type CommandHandler = (context: CommandContext) => Promise<void>;
export type CommandHandlers = Record<string, CommandHandler>;

export async function executeCommand({
  command,
  context,
  handlers,
  printHelp
}: {
  command: string | undefined;
  context: CommandContext;
  handlers: CommandHandlers;
  printHelp: () => void;
}): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const handler = handlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  await handler(context);
}

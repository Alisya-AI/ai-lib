import type { CliFlags } from './types.ts';

export function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { _: [] };
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const eqIndex = arg.indexOf('=');
    if (eqIndex < 0) {
      flags[arg.slice(2)] = true;
      continue;
    }
    const key = arg.slice(2, eqIndex);
    const raw = arg.slice(eqIndex + 1);
    if (raw === 'true') flags[key] = true;
    else if (raw === 'false') flags[key] = false;
    else flags[key] = raw;
  }
  return flags;
}

export function getStringFlag(flags: CliFlags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Registry } from './types.ts';

export function sanitizeForFilename(input: string) {
  return toPosix(input).replaceAll('/', '__').replaceAll(':', '_');
}

export function toPosix(value: string) {
  return value.split(path.sep).join('/');
}

export async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function rmIfExists(filePath: string) {
  if (!(await exists(filePath))) return;
  await fs.rm(filePath, { recursive: true, force: true });
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

export function splitCsv(value: string | boolean | string[] | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function uniqueList(items: string[]) {
  return [...new Set(items)];
}

export function resolveCanonicalSlotAlias({
  registry,
  slot,
  warnedSlotAliases,
  writeWarning
}: {
  registry: Registry;
  slot: string | undefined;
  warnedSlotAliases: Set<string>;
  writeWarning?: (line: string) => void;
}) {
  if (!slot) return null;
  const aliases = registry.slot_aliases || {};
  const resolved = aliases[slot] || slot;
  if (resolved !== slot && !warnedSlotAliases.has(slot)) {
    const aliasMeta = registry.slot_alias_meta?.[slot];
    const removeIn = aliasMeta?.remove_in ? ` and is planned for removal in ${aliasMeta.remove_in}` : '';
    (writeWarning || ((line: string) => process.stderr.write(line)))(
      `warning: slot alias '${slot}' is deprecated; use '${resolved}'${removeIn}\n`
    );
    warnedSlotAliases.add(slot);
  }
  return resolved;
}

export const canonicalSlot = resolveCanonicalSlotAlias;

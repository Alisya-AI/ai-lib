import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

const AILIB_BLOCK_START = '<!-- ailib:start -->';
const AILIB_BLOCK_END = '<!-- ailib:end -->';

export async function writeManagedFile({
  outPath,
  rendered,
  onConflict
}: {
  outPath: string;
  rendered: string;
  onConflict: string;
}) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const backupPath = `${outPath}.bak`;
  let wroteBackup = false;

  if (await exists(outPath)) {
    if (onConflict === 'skip') return;
    if (onConflict === 'abort') {
      throw new Error(`Conflict detected for ${outPath}; rerun with --on-conflict=overwrite|merge|skip`);
    }
    if (onConflict === 'merge') {
      const existing = await fs.readFile(outPath, 'utf8');
      const withoutOld = existing.includes(AILIB_BLOCK_START)
        ? `${existing.slice(0, existing.indexOf(AILIB_BLOCK_START)).trimEnd()}\n`
        : `${existing.trimEnd()}\n`;
      const merged = `${withoutOld}\n${AILIB_BLOCK_START}\n${rendered.trim()}\n${AILIB_BLOCK_END}\n`;
      await fs.copyFile(outPath, backupPath);
      wroteBackup = true;
      await fs.writeFile(outPath, merged, 'utf8');
      return;
    }
    await fs.copyFile(outPath, backupPath);
    wroteBackup = true;
  }

  await fs.writeFile(outPath, `${rendered.trim()}\n`, 'utf8');
  if (!wroteBackup && !(await exists(backupPath))) {
    await fs.copyFile(outPath, backupPath);
  }
}

export async function copySourceFile({
  packageRoot,
  sourceRel,
  target
}: {
  packageRoot: string;
  sourceRel: string;
  target: string;
}) {
  const source = path.join(packageRoot, sourceRel);
  ensure(await exists(source), `Missing module source: ${sourceRel}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

export function parseFrontmatter(markdown: string): Record<string, string | string[]> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const fields: Record<string, string | string[]> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value: string | string[] = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    fields[key] = value;
  }
  return fields;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

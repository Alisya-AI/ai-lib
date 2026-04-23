import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './file-helpers.ts';
import { exists } from './utils.ts';

export async function auditWorkspaceRequiredFiles({
  workspaceDir,
  workspaceLabel,
  requiredFiles
}: {
  workspaceDir: string;
  workspaceLabel: string;
  requiredFiles: string[];
}) {
  const errors: string[] = [];

  for (const rel of requiredFiles) {
    if (!(await exists(path.join(workspaceDir, rel)))) {
      errors.push(`[${workspaceLabel}] Missing pointer file: ${rel}`);
    }
  }

  for (const rel of requiredFiles) {
    const full = path.join(workspaceDir, rel);
    if (!(await exists(full))) continue;
    const text = await fs.readFile(full, 'utf8');
    const frontmatter = parseFrontmatter(text);
    if (!frontmatter) {
      errors.push(`[${workspaceLabel}] Missing frontmatter: ${rel}`);
      continue;
    }
    for (const key of ['id', 'version', 'updated']) {
      if (!(key in frontmatter)) {
        errors.push(`[${workspaceLabel}] Frontmatter missing '${key}': ${rel}`);
      }
    }
    if (!('language' in frontmatter) && !('core' in frontmatter)) {
      errors.push(`[${workspaceLabel}] Frontmatter missing 'language' or 'core': ${rel}`);
    }
    if (rel.includes('/modules/') && !('slot' in frontmatter)) {
      errors.push(`[${workspaceLabel}] Frontmatter missing 'slot': ${rel}`);
    }
  }

  return errors;
}

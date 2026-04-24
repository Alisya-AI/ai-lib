import fs from 'node:fs/promises';
import path from 'node:path';
import { ensure } from './assertions.ts';
import { resolveContext, resolveDefaultWorkspaceForMutation } from './context-resolution.ts';
import { getStringFlag } from './flags.ts';
import { parseFrontmatter } from './file-helpers.ts';
import type { CliFlags } from './types.ts';

const REQUIRED_SECTIONS = ['Purpose', 'Workflow'] as const;
const COMPATIBILITY_KEYS = [
  'compatible_languages',
  'compatible_modules',
  'compatible_targets',
  'compatible_llms'
] as const;

export async function skillsValidateCommand({ cwd, flags }: { cwd: string; flags: CliFlags }) {
  const context = await resolveContext(cwd);
  const workspaceFlag = getStringFlag(flags, 'workspace');
  const targetWorkspace = resolveDefaultWorkspaceForMutation(context, workspaceFlag);
  const pathFlag = getStringFlag(flags, 'path');
  const targetPath = pathFlag
    ? path.isAbsolute(pathFlag)
      ? path.resolve(pathFlag)
      : path.resolve(targetWorkspace, pathFlag)
    : path.join(targetWorkspace, '.cursor/skills');

  const files = await collectSkillFiles(targetPath);
  ensure(files.length > 0, `No skill files found at: ${targetPath}`);

  const issues: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    issues.push(...validateSkillFile({ file, content }));
  }

  if (issues.length > 0) {
    throw new Error(`skills validate failed:\n- ${issues.join('\n- ')}`);
  }

  process.stdout.write(`skills validate ok (${files.length} file${files.length === 1 ? '' : 's'})\n`);
}

export function validateSkillFile({ file, content }: { file: string; content: string }) {
  const issues: string[] = [];
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    return [`${file}: missing frontmatter`];
  }

  const name = frontmatter.name;
  if (typeof name !== 'string' || !name.trim()) {
    issues.push(`${file}: frontmatter 'name' must be a non-empty string`);
  }

  const description = frontmatter.description;
  if (typeof description !== 'string' || !description.trim()) {
    issues.push(`${file}: frontmatter 'description' must be a non-empty string`);
  }

  for (const heading of REQUIRED_SECTIONS) {
    if (!new RegExp(`^## ${heading}\\s*$`, 'm').test(content)) {
      issues.push(`${file}: missing required section '## ${heading}'`);
    }
  }

  for (const key of COMPATIBILITY_KEYS) {
    const value = frontmatter[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      issues.push(`${file}: frontmatter '${key}' must be a list like [a,b]`);
      continue;
    }
    if (value.length === 0 || value.some((entry) => !entry.trim())) {
      issues.push(`${file}: frontmatter '${key}' must include at least one value`);
    }
  }

  return issues;
}

async function collectSkillFiles(targetPath: string): Promise<string[]> {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) return path.basename(targetPath).toLowerCase() === 'skill.md' ? [targetPath] : [];
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const files: string[] = [];
  await walkDir(targetPath, files);
  return files.filter((file) => path.basename(file).toLowerCase() === 'skill.md').sort((a, b) => a.localeCompare(b));
}

async function walkDir(dir: string, files: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, files);
      continue;
    }
    if (entry.isFile()) files.push(full);
  }
}

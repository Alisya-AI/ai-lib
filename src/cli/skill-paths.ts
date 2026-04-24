import { toPosix } from './utils.ts';

export const LOCAL_CUSTOM_SKILLS_ROOT = '.cursor/skills';
export const LOCAL_CUSTOM_SKILL_ENTRY = 'SKILL.md';

export function normalizeRelativeSkillPath(pathValue: string) {
  const normalized = toPosix(pathValue).replaceAll('\\', '/').trim();
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

export function localCustomSkillPath(skillId: string) {
  return `${LOCAL_CUSTOM_SKILLS_ROOT}/${skillId}/${LOCAL_CUSTOM_SKILL_ENTRY}`;
}

export function isUnderLocalCustomSkillsRoot(pathValue: string) {
  const normalized = normalizeRelativeSkillPath(pathValue);
  return normalized === LOCAL_CUSTOM_SKILLS_ROOT || normalized.startsWith(`${LOCAL_CUSTOM_SKILLS_ROOT}/`);
}

export function isLocalCustomSkillPath(skillId: string, pathValue: string) {
  return normalizeRelativeSkillPath(pathValue) === localCustomSkillPath(skillId);
}

import type { Registry } from './types.ts';

export function validateSkillSelection({ registry, skills }: { registry: Registry; skills: string[] }) {
  const selected = uniqueList(skills || []);
  const selectedSet = new Set(selected);
  const registrySkills = registry.skills || {};

  for (const skillId of selected) {
    const skillDef = registrySkills[skillId];
    if (!skillDef) {
      throw new Error(`Unsupported skill: ${skillId}`);
    }

    for (const dependency of skillDef.requires || []) {
      if (!selectedSet.has(dependency)) {
        throw new Error(`Skill dependency missing: ${skillId} requires ${dependency}`);
      }
    }
  }

  for (const skillId of selected) {
    const conflicts = new Set(registrySkills[skillId]?.conflicts_with || []);
    for (const other of selected) {
      if (other !== skillId && conflicts.has(other)) {
        throw new Error(`Skill conflict: ${skillId} conflicts with ${other}`);
      }
    }
  }
}

function uniqueList(items: string[]) {
  return [...new Set(items)];
}

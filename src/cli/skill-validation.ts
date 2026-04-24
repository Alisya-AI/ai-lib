import {
  isLocalCustomSkillPath,
  isUnderLocalCustomSkillsRoot,
  localCustomSkillPath,
  normalizeRelativeSkillPath
} from './skill-paths.ts';
import type { Registry } from './types.ts';

export function validateSkillSelection({
  registry,
  skills,
  language,
  modules,
  targets
}: {
  registry: Registry;
  skills: string[];
  language: string;
  modules: string[];
  targets: string[];
}) {
  const selected = uniqueList(skills || []);
  const selectedSet = new Set(selected);
  const registrySkills = registry.skills || {};

  for (const skillId of selected) {
    const skillDef = registrySkills[skillId];
    if (!skillDef) {
      throw new Error(`Unsupported skill: ${skillId}`);
    }
    if (isUnderLocalCustomSkillsRoot(skillDef.path) && !isLocalCustomSkillPath(skillId, skillDef.path)) {
      throw new Error(
        `Skill path convention mismatch: ${skillId} must use ${localCustomSkillPath(skillId)}, got ${normalizeRelativeSkillPath(skillDef.path)}`
      );
    }

    for (const dependency of skillDef.requires || []) {
      if (!selectedSet.has(dependency)) {
        throw new Error(`Skill dependency missing: ${skillId} requires ${dependency}`);
      }
    }

    const compatible = skillDef.compatible;
    if (compatible?.languages?.length && !compatible.languages.includes(language)) {
      throw new Error(
        `Skill compatibility mismatch: ${skillId} supports languages [${compatible.languages.join(', ')}], got ${language}`
      );
    }

    if (compatible?.targets?.length) {
      const compatibleTargets = new Set(compatible.targets);
      const targetMatch = uniqueList(targets).some((targetId) => compatibleTargets.has(targetId));
      if (!targetMatch) {
        throw new Error(
          `Skill compatibility mismatch: ${skillId} supports targets [${compatible.targets.join(', ')}], got [${uniqueList(targets).join(', ')}]`
        );
      }
    }

    if (compatible?.modules?.length) {
      const compatibleModules = new Set(compatible.modules);
      const moduleMatch = uniqueList(modules).some((moduleId) => compatibleModules.has(moduleId));
      if (!moduleMatch) {
        throw new Error(
          `Skill compatibility mismatch: ${skillId} supports modules [${compatible.modules.join(', ')}], got [${uniqueList(modules).join(', ')}]`
        );
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

export const DEFAULT_SKILL_DESCRIPTION = 'TODO: describe this skill';

export function renderSkillTemplate({ skillId, description }: { skillId: string; description?: string }) {
  const resolvedDescription = description || DEFAULT_SKILL_DESCRIPTION;
  return [
    '---',
    `name: ${skillId}`,
    `description: ${resolvedDescription}`,
    '---',
    '',
    `# ${skillId}`,
    '',
    '## Purpose',
    '- TODO: describe when to use this skill',
    '',
    '## Workflow',
    '- TODO: add concrete implementation steps',
    ''
  ].join('\n');
}

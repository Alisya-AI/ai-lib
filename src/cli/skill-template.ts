export const DEFAULT_SKILL_DESCRIPTION = 'TODO: describe this skill';
export type SkillTemplateFormat = 'cursor' | 'claude-code';

export function renderSkillTemplate({
  skillId,
  description,
  format = 'cursor'
}: {
  skillId: string;
  description?: string;
  format?: SkillTemplateFormat;
}) {
  const resolvedDescription = description || DEFAULT_SKILL_DESCRIPTION;
  if (format === 'claude-code') {
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

  return [
    '---',
    `name: ${skillId}`,
    `description: ${resolvedDescription}`,
    '---',
    '',
    `# ${skillId}`,
    '',
    'Detailed instructions for the agent.',
    '',
    '## When to Use',
    '- Use this skill when...',
    '- This skill is helpful for...',
    '',
    '## Instructions',
    '- Step-by-step guidance for the agent',
    '- Domain-specific conventions',
    '- Best practices and patterns',
    '- Use the ask questions tool if you need to clarify requirements with the user',
    ''
  ].join('\n');
}

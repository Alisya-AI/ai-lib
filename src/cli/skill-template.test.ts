import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SKILL_DESCRIPTION, renderSkillTemplate } from './skill-template.ts';

test('renderSkillTemplate builds expected default cursor scaffold', () => {
  const rendered = renderSkillTemplate({ skillId: 'task-driven-gh-flow' });
  assert.equal(
    rendered,
    [
      '---',
      'name: task-driven-gh-flow',
      `description: ${DEFAULT_SKILL_DESCRIPTION}`,
      '---',
      '',
      '# task-driven-gh-flow',
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
    ].join('\n')
  );
});

test('renderSkillTemplate uses explicit description when provided', () => {
  const rendered = renderSkillTemplate({
    skillId: 'release-manager',
    description: 'Automate release checklists'
  });
  assert.match(rendered, /name: release-manager/);
  assert.match(rendered, /description: Automate release checklists/);
});

test('renderSkillTemplate supports claude-code profile', () => {
  const rendered = renderSkillTemplate({
    skillId: 'release-manager',
    description: 'Automate release checklists',
    format: 'claude-code'
  });
  assert.match(rendered, /## Purpose/);
  assert.match(rendered, /## Workflow/);
  assert.doesNotMatch(rendered, /## When to Use/);
});

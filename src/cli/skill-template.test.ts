import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SKILL_DESCRIPTION, renderSkillTemplate } from './skill-template.ts';

test('renderSkillTemplate builds expected default scaffold', () => {
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
      '## Purpose',
      '- TODO: describe when to use this skill',
      '',
      '## Workflow',
      '- TODO: add concrete implementation steps',
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

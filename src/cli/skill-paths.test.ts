import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocalCustomSkillPath,
  isUnderLocalCustomSkillsRoot,
  localCustomSkillPath,
  normalizeRelativeSkillPath
} from './skill-paths.ts';

test('localCustomSkillPath builds canonical skill source path', () => {
  assert.equal(localCustomSkillPath('task-driven-gh-flow'), '.cursor/skills/task-driven-gh-flow/SKILL.md');
});

test('normalizeRelativeSkillPath normalizes slashes and leading dot slash', () => {
  assert.equal(normalizeRelativeSkillPath('./.cursor/skills/review/SKILL.md'), '.cursor/skills/review/SKILL.md');
  assert.equal(normalizeRelativeSkillPath('.cursor/skills\\review\\SKILL.md'), '.cursor/skills/review/SKILL.md');
});

test('isUnderLocalCustomSkillsRoot detects paths under local skills root', () => {
  assert.equal(isUnderLocalCustomSkillsRoot('.cursor/skills/review/SKILL.md'), true);
  assert.equal(isUnderLocalCustomSkillsRoot('skills/review/SKILL.md'), false);
});

test('isLocalCustomSkillPath validates skill-id specific location', () => {
  assert.equal(isLocalCustomSkillPath('review', '.cursor/skills/review/SKILL.md'), true);
  assert.equal(isLocalCustomSkillPath('review', '.cursor/skills/other/SKILL.md'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { skillsValidateCommand, validateSkillFile } from './skills-validate.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-skills-validate-'));
}

test('validateSkillFile accepts valid skill markdown', () => {
  const issues = validateSkillFile({
    file: '/tmp/SKILL.md',
    content: [
      '---',
      'name: code-review',
      'description: Validate pull request quality',
      'compatible_languages: [typescript,python]',
      '---',
      '',
      '# code-review',
      '',
      '## Purpose',
      '- Review risky changes',
      '',
      '## Workflow',
      '- Check tests and edge cases',
      ''
    ].join('\n')
  });
  assert.deepEqual(issues, []);
});

test('validateSkillFile returns actionable errors for malformed content', () => {
  const issues = validateSkillFile({
    file: '/tmp/SKILL.md',
    content: ['---', 'name: ', 'description: ', 'compatible_targets: cursor', '---', '', '# broken skill'].join('\n')
  });
  assert.match(issues.join('\n'), /frontmatter 'name' must be a non-empty string/);
  assert.match(issues.join('\n'), /frontmatter 'description' must be a non-empty string/);
  assert.match(issues.join('\n'), /missing required section '## Purpose'/);
  assert.match(issues.join('\n'), /missing required section '## Workflow'/);
  assert.match(issues.join('\n'), /frontmatter 'compatible_targets' must be a list like \[a,b\]/);
});

test('skillsValidateCommand validates all workspace skill files', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const skillDir = path.join(root, '.cursor/skills/release-manager');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: release-manager',
      'description: Manage release flow',
      '---',
      '',
      '# release-manager',
      '',
      '## Purpose',
      '- Keep releases stable',
      '',
      '## Workflow',
      '- Prepare checklist',
      ''
    ].join('\n'),
    'utf8'
  );

  await skillsValidateCommand({
    cwd: root,
    flags: { _: ['validate'] }
  });
});

test('skillsValidateCommand fails when no skill files are present', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  await assert.rejects(
    skillsValidateCommand({
      cwd: root,
      flags: { _: ['validate'] }
    }),
    /No skill files found/
  );
});

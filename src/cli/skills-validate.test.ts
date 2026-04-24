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

test('validateSkillFile rejects missing frontmatter and empty compatibility lists', () => {
  const noFrontmatter = validateSkillFile({
    file: '/tmp/SKILL.md',
    content: '# no frontmatter'
  });
  assert.match(noFrontmatter.join('\n'), /missing frontmatter/);

  const malformedCompatibility = validateSkillFile({
    file: '/tmp/SKILL.md',
    content: [
      '---',
      'name: compatibility-check',
      'description: Verify compatibility declarations',
      'compatible_modules: []',
      'compatible_targets: []',
      '---',
      '',
      '# compatibility-check',
      '',
      '## Purpose',
      '- Validate compatibility declarations',
      '',
      '## Workflow',
      '- Run checks',
      ''
    ].join('\n')
  });
  assert.match(malformedCompatibility.join('\n'), /frontmatter 'compatible_modules' must include at least one value/);
  assert.match(malformedCompatibility.join('\n'), /frontmatter 'compatible_targets' must include at least one value/);
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

test('skillsValidateCommand supports validating a single SKILL.md path', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  const target = path.join(root, '.cursor/skills/code-review/SKILL.md');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    [
      '---',
      'name: code-review',
      'description: Validate PR quality',
      '---',
      '',
      '# code-review',
      '',
      '## Purpose',
      '- Review risks',
      '',
      '## Workflow',
      '- Report findings',
      ''
    ].join('\n'),
    'utf8'
  );

  await skillsValidateCommand({
    cwd: root,
    flags: { _: ['validate'], path: target }
  });
});

test('skillsValidateCommand aggregates malformed skill diagnostics', async () => {
  const root = await tempDir();
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  const first = path.join(root, '.cursor/skills/broken-a/SKILL.md');
  const second = path.join(root, '.cursor/skills/broken-b/SKILL.md');
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.writeFile(first, ['---', 'name: broken-a', '---', '', '# broken-a'].join('\n'), 'utf8');
  await fs.writeFile(second, '# no frontmatter', 'utf8');

  await assert.rejects(
    skillsValidateCommand({
      cwd: root,
      flags: { _: ['validate'] }
    }),
    /skills validate failed:\n- .*broken-a.*frontmatter 'description' must be a non-empty string[\s\S]*broken-b.*missing frontmatter/
  );
});

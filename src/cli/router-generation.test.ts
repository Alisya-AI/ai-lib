import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateWorkspaceRouters, renderRouterDoc } from './router-generation.ts';
import type { Registry, WorkspaceState } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-router-generation-'));
}

function state(
  targets: string[],
  inheritedModules: string[] = [],
  localModules: string[] = [],
  inheritedSkills: string[] = [],
  localSkills: string[] = []
): WorkspaceState {
  return {
    effective: {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      registry_ref: 'test-registry',
      on_conflict: 'merge',
      language: 'typescript',
      modules: [...inheritedModules, ...localModules],
      targets,
      skills: [...inheritedSkills, ...localSkills],
      docs_path: 'docs/',
      inheritedModules,
      localModules,
      inheritedSkills,
      localSkills,
      warnings: []
    },
    inheritedModules,
    localModules,
    inheritedSkills,
    localSkills,
    requiredFiles: [],
    warnings: []
  };
}

const registry: Registry = {
  version: 'test-registry',
  languages: { typescript: { modules: {} } },
  targets: {
    cursor: {
      output: '.cursor/rules/ai.md',
      root_output: '.cursor/rules/root.md',
      display: 'Cursor',
      frontmatter: { root: '---\nroot: true\n---\n', workspace: '---\nworkspace: true\n---\n' }
    },
    copilot: {
      output: '.github/copilot-instructions.md',
      display: 'GitHub Copilot',
      mode: 'copilot'
    }
  }
};

test('renderRouterDoc renders root and service docs with correct references', () => {
  const rootDir = '/repo';
  const rootDoc = renderRouterDoc({
    label: 'Cursor',
    workspaceDir: rootDir,
    rootDir,
    state: state(['cursor'], ['eslint'], ['pytest'], [], ['task-driven-gh-flow'])
  });
  assert.match(rootDoc, /Act as the AI Agent defined in @\.ailib\/behavior\.md/);
  assert.match(rootDoc, /- @\.ailib\/modules\/pytest\.md/);
  assert.match(rootDoc, /# SKILLS/);
  assert.match(rootDoc, /- @\.ailib\/skills\/task-driven-gh-flow\.md/);

  const serviceDoc = renderRouterDoc({
    label: 'Cursor',
    workspaceDir: '/repo/apps/api',
    rootDir,
    state: state(['cursor'], ['eslint'], ['pytest'], ['task-driven-gh-flow'], ['local-skill'])
  });
  assert.match(serviceDoc, /@\.\.\/\.\.\/\.ailib\/behavior\.md/);
  assert.match(serviceDoc, /consult @\.\.\/\.\.\/docs\//);
  assert.match(serviceDoc, /- @\.\.\/\.\.\/\.ailib\/skills\/task-driven-gh-flow\.md/);
  assert.match(serviceDoc, /- @\.ailib\/skills\/local-skill\.md/);
});

test('renderRouterDoc snapshot includes skill pointer layout', () => {
  const rootDir = '/repo';
  const rootDoc = renderRouterDoc({
    label: 'Cursor',
    workspaceDir: rootDir,
    rootDir,
    state: state(['cursor'], ['eslint'], ['pytest'], [], ['task-driven-gh-flow'])
  });
  const expectedRootDoc = [
    '# ailib Router (Cursor)',
    '',
    '# AILIB SYSTEM PROMPT',
    'Act as the AI Agent defined in @.ailib/behavior.md.',
    'Adhere to the coding standards in @.ailib/standards.md.',
    'Apply development workflow rules in @.ailib/development-standards.md.',
    'Apply test and coverage rules in @.ailib/test-standards.md.',
    '',
    '# MODULES & EXTENSIONS',
    '- @.ailib/modules/eslint.md',
    '- @.ailib/modules/pytest.md',
    '',
    '# SKILLS',
    '- @.ailib/skills/task-driven-gh-flow.md',
    '',
    '# PROJECT-SPECIFIC CONTEXT',
    'Prioritize project context in @./docs/.',
    ''
  ].join('\n');
  assert.equal(rootDoc, expectedRootDoc);

  const serviceDoc = renderRouterDoc({
    label: 'Cursor',
    workspaceDir: '/repo/apps/api',
    rootDir,
    state: state(['cursor'], ['eslint'], ['pytest'], ['task-driven-gh-flow'], ['local-skill'])
  });
  const expectedServiceDoc = [
    '# ailib Router (Cursor)',
    '',
    '# AILIB SYSTEM PROMPT',
    'Act as the AI Agent defined in @../../.ailib/behavior.md.',
    'Adhere to the coding standards in @.ailib/standards.md.',
    'Apply development workflow rules in @.ailib/development-standards.md.',
    'Apply test and coverage rules in @.ailib/test-standards.md.',
    '',
    '# MODULES & EXTENSIONS',
    '- @../../.ailib/modules/eslint.md',
    '- @.ailib/modules/pytest.md',
    '',
    '# SKILLS',
    '- @../../.ailib/skills/task-driven-gh-flow.md',
    '- @.ailib/skills/local-skill.md',
    '',
    '# PROJECT-SPECIFIC CONTEXT',
    'Prioritize service-local business logic in @./docs/.',
    'For cross-service context, consult @../../docs/.',
    'If guidance conflicts, service-local docs win for service-scoped work.',
    ''
  ].join('\n');
  assert.equal(serviceDoc, expectedServiceDoc);
});

test('generateWorkspaceRouters writes target outputs and copilot bundle', async () => {
  const rootDir = await tempDir();
  const appDir = path.join(rootDir, 'apps', 'api');
  await fs.mkdir(appDir, { recursive: true });

  const rootState = state(['cursor', 'copilot'], ['eslint'], ['pytest']);
  const appState = state(['copilot'], ['eslint'], ['pytest']);
  const allStates = new Map<string, WorkspaceState>([
    [rootDir, rootState],
    [appDir, appState]
  ]);

  await generateWorkspaceRouters({
    workspaceDir: rootDir,
    rootDir,
    state: rootState,
    onConflict: 'overwrite',
    allStates,
    registry
  });

  const cursorOutput = await fs.readFile(path.join(rootDir, '.cursor/rules/ai.md'), 'utf8');
  assert.match(cursorOutput, /^---\nroot: true\n---\n/s);
  const rootOutput = await fs.readFile(path.join(rootDir, '.cursor/rules/root.md'), 'utf8');
  assert.match(rootOutput, /# ailib Router \(Cursor\)/);

  const copilotOutput = await fs.readFile(path.join(rootDir, '.github/copilot-instructions.md'), 'utf8');
  assert.match(copilotOutput, /## Workspace: \./);
  assert.match(copilotOutput, /## Workspace: apps\/api/);

  const rootInstructions = await fs.readFile(path.join(rootDir, '.github/instructions/root.instructions.md'), 'utf8');
  assert.match(rootInstructions, /applyTo: "\*\*"/);
  const appInstructions = await fs.readFile(
    path.join(rootDir, '.github/instructions/apps__api.instructions.md'),
    'utf8'
  );
  assert.match(appInstructions, /applyTo: "apps\/api\/\*\*"/);
});

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
  localSkills: string[] = [],
  targetOutputMode: 'native' | 'compat' | 'strict' = 'native'
): WorkspaceState {
  return {
    effective: {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      registry_ref: 'test-registry',
      on_conflict: 'merge',
      target_output_mode: targetOutputMode,
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
    },
    openai: {
      output: 'AGENTS.md',
      display: 'OpenAI Codex'
    },
    'claude-code': {
      output: 'CLAUDE.md',
      display: 'Claude Code'
    }
  }
};

test('renderRouterDoc renders root and service docs with correct references', () => {
  const rootDoc = renderRouterDoc({
    label: 'Cursor',
    targetId: 'cursor'
  });
  assert.match(rootDoc, /ailib:router-metadata/);
  assert.match(rootDoc, /# ailib Router \(Cursor\)/);
  assert.match(rootDoc, /- @\.ailib\/context\/common\.md/);
  assert.match(rootDoc, /- @\.ailib\/context\/modules\.md/);
  assert.match(rootDoc, /- @\.ailib\/context\/skills\/cursor\.md/);
});

test('renderRouterDoc snapshot renders thin wrapper', () => {
  const rootDoc = renderRouterDoc({
    label: 'Cursor',
    targetId: 'cursor'
  });
  const expectedRootDoc = [
    '<!-- ailib:router-metadata',
    '- role: native',
    '- target_output_mode: native',
    '- primary_target: cursor',
    '-->',
    '# ailib Router (Cursor)',
    '',
    'Load the following context files:',
    '- @.ailib/context/common.md',
    '- @.ailib/context/modules.md',
    '- @.ailib/context/skills/cursor.md',
    ''
  ].join('\n');
  assert.equal(rootDoc, expectedRootDoc);
});

test('generateWorkspaceRouters writes target outputs and copilot bundle', async () => {
  const rootDir = await tempDir();
  const appDir = path.join(rootDir, 'apps', 'api');
  await fs.mkdir(appDir, { recursive: true });

  const rootState = state(['cursor', 'copilot'], ['eslint'], ['pytest']);
  const appState = state(['copilot'], ['eslint'], ['pytest'], ['task-driven-gh-flow'], ['local-skill']);
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
  await generateWorkspaceRouters({
    workspaceDir: appDir,
    rootDir,
    state: appState,
    onConflict: 'overwrite',
    allStates,
    registry
  });

  const cursorOutput = await fs.readFile(path.join(rootDir, '.cursor/rules/ai.md'), 'utf8');
  assert.match(cursorOutput, /^---\nroot: true\n---\n/s);
  assert.match(cursorOutput, /Load the following context files/);
  assert.match(cursorOutput, /@\.ailib\/context\/skills\/cursor\.md/);
  const rootOutput = await fs.readFile(path.join(rootDir, '.cursor/rules/root.md'), 'utf8');
  assert.match(rootOutput, /@\.ailib\/context\/common\.md/);

  const rootCommonContext = await fs.readFile(path.join(rootDir, '.ailib/context/common.md'), 'utf8');
  assert.match(rootCommonContext, /# AILIB SYSTEM PROMPT/);
  const rootModulesContext = await fs.readFile(path.join(rootDir, '.ailib/context/modules.md'), 'utf8');
  assert.match(rootModulesContext, /@\.ailib\/modules\/eslint\.md/);
  const appCommonContext = await fs.readFile(path.join(appDir, '.ailib/context/common.md'), 'utf8');
  assert.match(appCommonContext, /@\.\.\/\.\.\/\.ailib\/behavior\.md/);
  const appSkillsContext = await fs.readFile(path.join(appDir, '.ailib/context/skills/copilot.md'), 'utf8');
  assert.match(appSkillsContext, /@\.\.\/\.\.\/\.ailib\/skills\/copilot\/task-driven-gh-flow\.md/);
  assert.match(appSkillsContext, /@\.ailib\/skills\/copilot\/local-skill\.md/);

  const copilotOutput = await fs.readFile(path.join(rootDir, '.github/copilot-instructions.md'), 'utf8');
  assert.match(copilotOutput, /## Workspace: \./);
  assert.match(copilotOutput, /## Workspace: apps\/api/);
  assert.match(copilotOutput, /@apps\/api\/\.ailib\/context\/common\.md/);

  const rootInstructions = await fs.readFile(path.join(rootDir, '.github/instructions/root.instructions.md'), 'utf8');
  assert.match(rootInstructions, /applyTo: "\*\*"/);
  assert.match(rootInstructions, /@\.ailib\/context\/skills\/copilot\.md/);
  const appInstructions = await fs.readFile(
    path.join(rootDir, '.github/instructions/apps__api.instructions.md'),
    'utf8'
  );
  assert.match(appInstructions, /applyTo: "apps\/api\/\*\*"/);
  assert.match(appInstructions, /@apps\/api\/\.ailib\/context\/modules\.md/);
});

test('generateWorkspaceRouters emits compatibility wrappers only in compat mode', async () => {
  const workspaceDir = await tempDir();
  const stateCompat = state(['cursor'], [], [], [], [], 'compat');
  const stateNative = state(['cursor'], [], [], [], [], 'native');
  const allStates = new Map<string, WorkspaceState>([[workspaceDir, stateCompat]]);

  await generateWorkspaceRouters({
    workspaceDir,
    rootDir: workspaceDir,
    state: stateCompat,
    onConflict: 'overwrite',
    allStates,
    registry
  });
  const compatAgents = await fs.readFile(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
  assert.match(compatAgents, /- role: compatibility/);
  assert.match(compatAgents, /- primary_target: cursor/);
  assert.match(compatAgents, /@\.ailib\/context\/skills\/cursor\.md/);

  const nativeDir = await tempDir();
  await generateWorkspaceRouters({
    workspaceDir: nativeDir,
    rootDir: nativeDir,
    state: stateNative,
    onConflict: 'overwrite',
    allStates: new Map<string, WorkspaceState>([[nativeDir, stateNative]]),
    registry
  });
  await assert.rejects(fs.readFile(path.join(nativeDir, 'AGENTS.md'), 'utf8'));

  const strictState = state(['cursor'], [], [], [], [], 'strict');
  const strictDir = await tempDir();
  await generateWorkspaceRouters({
    workspaceDir: strictDir,
    rootDir: strictDir,
    state: strictState,
    onConflict: 'overwrite',
    allStates: new Map<string, WorkspaceState>([[strictDir, strictState]]),
    registry
  });
  await assert.rejects(fs.readFile(path.join(strictDir, 'AGENTS.md'), 'utf8'));
});

test('generateWorkspaceRouters emits CLAUDE compatibility wrapper for openai in compat mode', async () => {
  const workspaceDir = await tempDir();
  const openAiCompat = state(['openai'], [], [], [], [], 'compat');
  await generateWorkspaceRouters({
    workspaceDir,
    rootDir: workspaceDir,
    state: openAiCompat,
    onConflict: 'overwrite',
    allStates: new Map<string, WorkspaceState>([[workspaceDir, openAiCompat]]),
    registry
  });

  const agents = await fs.readFile(path.join(workspaceDir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# ailib Router \(OpenAI Codex\)/);
  const claudeCompat = await fs.readFile(path.join(workspaceDir, 'CLAUDE.md'), 'utf8');
  assert.match(claudeCompat, /- role: compatibility/);
  assert.match(claudeCompat, /- primary_target: openai/);
  assert.match(claudeCompat, /@\.ailib\/context\/skills\/openai\.md/);
});

test('generateWorkspaceRouters prunes stale target skill context files', async () => {
  const workspaceDir = await tempDir();
  await fs.mkdir(path.join(workspaceDir, '.ailib/context/skills'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, '.ailib/context/skills/stale.md'), 'stale', 'utf8');
  const currentState = state(['cursor'], [], [], [], [], 'native');

  await generateWorkspaceRouters({
    workspaceDir,
    rootDir: workspaceDir,
    state: currentState,
    onConflict: 'overwrite',
    allStates: new Map<string, WorkspaceState>([[workspaceDir, currentState]]),
    registry
  });

  await assert.rejects(fs.readFile(path.join(workspaceDir, '.ailib/context/skills/stale.md'), 'utf8'));
});

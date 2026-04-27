import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../src/cli.ts';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-test-'));
  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  return dir;
}

async function makeMonorepo() {
  const root = await makeProject();
  await fs.mkdir(path.join(root, 'apps', 'web'), { recursive: true });
  await fs.mkdir(path.join(root, 'services', 'ml'), { recursive: true });
  return root;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function captureStdout(fn: () => Promise<void>) {
  const writes: string[] = [];
  const mutableStdout = process.stdout as unknown as { write: typeof process.stdout.write };
  const originalWrite = mutableStdout.write.bind(process.stdout);
  mutableStdout.write = ((chunk, encoding, callback) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  }) as typeof process.stdout.write;

  try {
    await fn();
    return writes.join('');
  } finally {
    mutableStdout.write = originalWrite;
  }
}

async function captureStderr(fn: () => Promise<void>) {
  const writes: string[] = [];
  const mutableStderr = process.stderr as unknown as { write: typeof process.stderr.write };
  const originalWrite = mutableStderr.write.bind(process.stderr);
  mutableStderr.write = ((chunk, encoding, callback) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
    return writes.join('');
  } finally {
    mutableStderr.write = originalWrite;
  }
}

async function runDoctorAndCapture(root: string) {
  process.exitCode = 0;
  const output = await captureStdout(async () => {
    await run(['doctor'], { cwd: root, packageRoot });
  });
  const exitCode = process.exitCode ?? 0;
  process.exitCode = 0;
  return { output, exitCode };
}

test('run prints help for empty argv and --help', async () => {
  const outputEmpty = await captureStdout(async () => {
    await run([], { packageRoot });
  });
  assert.match(outputEmpty, /ailib commands:/);

  const outputHelp = await captureStdout(async () => {
    await run(['--help'], { packageRoot });
  });
  assert.match(outputHelp, /ailib init/);
});

test('run throws for unknown command', async () => {
  await assert.rejects(run(['unknown-command'], { packageRoot }), /Unknown command: unknown-command/);
});

test('slots list prints canonical slots with metadata', async () => {
  const output = await captureStdout(async () => {
    await run(['slots', 'list'], { packageRoot });
  });
  assert.match(output, /slots:/);
  assert.match(output, /- backend_framework \(exclusive\)/);
  assert.match(output, /- frontend_framework \(exclusive\)/);
});

test('modules list prints modules for selected language', async () => {
  const output = await captureStdout(async () => {
    await run(['modules', 'list', '--language=typescript'], { packageRoot });
  });
  assert.match(output, /modules \(typescript\):/);
  assert.match(output, /- eslint \(slot: linter\)/);
  assert.match(output, /- nestjs \(slot: backend_framework\)/);
});

test('modules explain prints module details', async () => {
  const output = await captureStdout(async () => {
    await run(['modules', 'explain', 'nextjs'], { packageRoot });
  });
  assert.match(output, /module: nextjs/);
  assert.match(output, /slot: frontend_framework/);
  assert.match(output, /requires: react/);
  assert.match(output, /doc: languages\/typescript\/modules\/nextjs\.md/);
});

test('modules explain rejects unsupported language flag', async () => {
  await assert.rejects(
    run(['modules', 'explain', 'nextjs', '--language=not-a-language'], { packageRoot }),
    /Unsupported language: not-a-language/
  );
});

test('modules explain rejects unknown module', async () => {
  await assert.rejects(run(['modules', 'explain', 'not-a-module'], { packageRoot }), /Unknown module: not-a-module/);
});

test('modules explain rejects unknown module in requested language', async () => {
  await assert.rejects(
    run(['modules', 'explain', 'pytest', '--language=typescript'], { packageRoot }),
    /Unknown module for typescript: pytest/
  );
});

test('skills list and explain include built-in architecture skills', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /skills:/);
  assert.match(listOutput, /- architecture-decision-flow - Architecture decision flow/);
  assert.match(listOutput, /- rfc-authoring - RFC authoring/);

  const explainArchitecture = await captureStdout(async () => {
    await run(['skills', 'explain', 'architecture-decision-flow'], { packageRoot });
  });
  assert.match(explainArchitecture, /skill: architecture-decision-flow/);
  assert.match(explainArchitecture, /path: skills\/architecture-decision-flow\.md/);
  assert.match(explainArchitecture, /compatible.targets: .*claude-code/);

  const explainRfc = await captureStdout(async () => {
    await run(['skills', 'explain', 'rfc-authoring'], { packageRoot });
  });
  assert.match(explainRfc, /skill: rfc-authoring/);
  assert.match(explainRfc, /requires: architecture-decision-flow/);
});

test('skills list and explain include review and refactor skills', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- clean-code-refactoring - Clean code refactoring/);
  assert.match(listOutput, /- code-review-rigor - Code review rigor/);

  const explainRefactor = await captureStdout(async () => {
    await run(['skills', 'explain', 'clean-code-refactoring'], { packageRoot });
  });
  assert.match(explainRefactor, /skill: clean-code-refactoring/);
  assert.match(explainRefactor, /path: skills\/clean-code-refactoring\.md/);

  const explainReview = await captureStdout(async () => {
    await run(['skills', 'explain', 'code-review-rigor'], { packageRoot });
  });
  assert.match(explainReview, /skill: code-review-rigor/);
  assert.match(explainReview, /path: skills\/code-review-rigor\.md/);
});

test('skills list and explain include reliability skills', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- release-readiness - Release readiness/);
  assert.match(listOutput, /- observability-design - Observability design/);
  assert.match(listOutput, /- incident-review - Incident review/);
  assert.match(listOutput, /- migration-planning - Migration planning/);

  const explainRelease = await captureStdout(async () => {
    await run(['skills', 'explain', 'release-readiness'], { packageRoot });
  });
  assert.match(explainRelease, /skill: release-readiness/);
  assert.match(explainRelease, /path: skills\/release-readiness\.md/);

  const explainMigration = await captureStdout(async () => {
    await run(['skills', 'explain', 'migration-planning'], { packageRoot });
  });
  assert.match(explainMigration, /skill: migration-planning/);
  assert.match(explainMigration, /path: skills\/migration-planning\.md/);
});

test('skills list and explain include Jira delivery skill metadata', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- jira-delivery-practices - Jira delivery practices/);

  const explainJira = await captureStdout(async () => {
    await run(['skills', 'explain', 'jira-delivery-practices'], { packageRoot });
  });
  assert.match(explainJira, /skill: jira-delivery-practices/);
  assert.match(explainJira, /path: skills\/jira-delivery-practices\.md/);
  assert.match(explainJira, /description: Apply Jira workflow best practices/);
  assert.match(explainJira, /compatible.languages: .*typescript/);
  assert.match(explainJira, /compatible.targets: .*claude-code/);
});

test('skills list and explain include Notion delivery skill metadata', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- notion-delivery-practices - Notion delivery practices/);

  const explainNotion = await captureStdout(async () => {
    await run(['skills', 'explain', 'notion-delivery-practices'], { packageRoot });
  });
  assert.match(explainNotion, /skill: notion-delivery-practices/);
  assert.match(explainNotion, /path: skills\/notion-delivery-practices\.md/);
  assert.match(explainNotion, /description: Apply Notion documentation best practices/);
  assert.match(explainNotion, /compatible.languages: .*typescript/);
  assert.match(explainNotion, /compatible.targets: .*claude-code/);
});

test('skills list and explain include task-driven GH flow metadata', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- task-driven-gh-flow - Task-driven GH flow/);

  const explainTaskDriven = await captureStdout(async () => {
    await run(['skills', 'explain', 'task-driven-gh-flow'], { packageRoot });
  });
  assert.match(explainTaskDriven, /skill: task-driven-gh-flow/);
  assert.match(explainTaskDriven, /path: skills\/task-driven-gh-flow\.md/);
  assert.match(explainTaskDriven, /description: Execute roadmap work through GitHub tasks with strict traceability/);
  assert.match(explainTaskDriven, /compatible.languages: .*typescript/);
  assert.match(explainTaskDriven, /compatible.targets: .*claude-code/);
});

test('skills list and explain include tdd workflow skill metadata', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- tdd-cycle-workflow - TDD cycle workflow/);

  const explainTdd = await captureStdout(async () => {
    await run(['skills', 'explain', 'tdd-cycle-workflow'], { packageRoot });
  });
  assert.match(explainTdd, /skill: tdd-cycle-workflow/);
  assert.match(explainTdd, /path: skills\/tdd-cycle-workflow\.md/);
  assert.match(explainTdd, /description: Drive implementation with red-green-refactor loops/);
  assert.match(explainTdd, /compatible.languages: .*typescript/);
  assert.match(explainTdd, /compatible.targets: .*claude-code/);
});

test('skills list and explain include solid principles skill metadata', async () => {
  const listOutput = await captureStdout(async () => {
    await run(['skills', 'list'], { packageRoot });
  });
  assert.match(listOutput, /- solid-principles-application - SOLID principles application/);

  const explainSolid = await captureStdout(async () => {
    await run(['skills', 'explain', 'solid-principles-application'], { packageRoot });
  });
  assert.match(explainSolid, /skill: solid-principles-application/);
  assert.match(explainSolid, /path: skills\/solid-principles-application\.md/);
  assert.match(explainSolid, /description: Apply SRP, OCP, LSP, ISP, and DIP with practical design checks/);
  assert.match(explainSolid, /compatible.languages: .*typescript/);
  assert.match(explainSolid, /compatible.targets: .*claude-code/);
});

test('skills explain rejects unknown skill id', async () => {
  await assert.rejects(run(['skills', 'explain', 'missing-skill'], { packageRoot }), /Unknown skill: missing-skill/);
});

test('modules command rejects invalid subcommand usage', async () => {
  await assert.rejects(run(['modules', 'invalid-subcommand'], { packageRoot }), /Usage: ailib modules list/);
});

test('slots command rejects invalid subcommand usage', async () => {
  await assert.rejects(run(['slots', 'invalid-subcommand'], { packageRoot }), /Usage: ailib slots list/);
});

test('init creates root config, root lock, and routers with new layout', async () => {
  const cwd = await makeProject();
  await run(
    [
      'init',
      '--language=typescript',
      '--modules=eslint,vitest',
      '--targets=claude-code,copilot',
      '--on-conflict=overwrite',
      '--bare'
    ],
    { cwd, packageRoot }
  );

  assert.equal(await exists(path.join(cwd, 'ailib.config.json')), true);
  assert.equal(await exists(path.join(cwd, 'ailib.lock')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/behavior.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/development-standards.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/test-standards.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/standards.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/modules/eslint.md')), true);
  assert.equal(await exists(path.join(cwd, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(cwd, '.github/copilot-instructions.md')), true);
});

test('init supports generic target outputs including openai and gemini', async () => {
  const cwd = await makeProject();
  await run(
    [
      'init',
      '--language=typescript',
      '--modules=eslint',
      '--targets=claude-code,cursor,windsurf,openai,gemini',
      '--on-conflict=overwrite',
      '--bare'
    ],
    { cwd, packageRoot }
  );

  assert.equal(await exists(path.join(cwd, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(cwd, '.cursor/rules/ailib.mdc')), true);
  assert.equal(await exists(path.join(cwd, '.windsurf/rules/ailib.md')), true);
  assert.equal(await exists(path.join(cwd, '.windsurfrules')), true);
  assert.equal(await exists(path.join(cwd, 'AGENTS.md')), true);
  assert.equal(await exists(path.join(cwd, 'GEMINI.md')), true);
});

test('monorepo update inherits root and supports service override modules', async () => {
  const root = await makeMonorepo();
  await run(
    [
      'init',
      '--language=typescript',
      '--modules=eslint',
      '--targets=claude-code,cursor,copilot',
      '--on-conflict=overwrite'
    ],
    { cwd: root, packageRoot }
  );

  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code,cursor,copilot'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });
  await run(['init', '--language=python', '--modules=ruff,pytest,fastapi', '--targets=claude-code,copilot'], {
    cwd: path.join(root, 'services', 'ml'),
    packageRoot
  });

  await run(['update'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib/behavior.md')), true);
  assert.equal(await exists(path.join(root, '.ailib/development-standards.md')), true);
  assert.equal(await exists(path.join(root, '.ailib/test-standards.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/biome.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/eslint.md')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/standards.md')), true);
  assert.equal(await exists(path.join(root, '.github/instructions', 'apps__web.instructions.md')), true);

  const copilot = await fs.readFile(path.join(root, '.github/copilot-instructions.md'), 'utf8');
  assert.match(copilot, /## Workspace: \./);
  assert.match(copilot, /## Workspace: apps\/web/);
  assert.match(copilot, /## Workspace: services\/ml/);
});

test('local overrides are merged into effective workspace config', async () => {
  const root = await makeMonorepo();
  await run(
    ['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'],
    { cwd: root, packageRoot }
  );
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  const localOverride = {
    version: '1.0.0',
    default_override: {
      targets: { add: ['openai'] }
    },
    workspace_overrides: {
      'apps/web': {
        slots: {
          linter: { set: 'biome' }
        }
      }
    }
  };
  await fs.writeFile(path.join(root, 'ailib.local.json'), `${JSON.stringify(localOverride, null, 2)}\n`, 'utf8');

  await run(['update'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, 'AGENTS.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/biome.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/eslint.md')), false);
});

test('add/remove can target workspace in monorepo', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code'], {
    cwd: path.join(root, 'services', 'ml'),
    packageRoot
  });

  await run(['add', 'pytest', '--workspace=services/ml'], { cwd: root, packageRoot });
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/modules/pytest.md')), true);

  await run(['remove', 'pytest', '--workspace=services/ml'], { cwd: root, packageRoot });
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/modules/pytest.md')), false);
});

test('add and remove enforce module argument', async () => {
  const root = await makeProject();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  await assert.rejects(run(['add'], { cwd: root, packageRoot }), /Usage: ailib add <module>/);
  await assert.rejects(run(['remove'], { cwd: root, packageRoot }), /Usage: ailib remove <module>/);
});

test('skills add scaffolds skill file in target workspace', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  await run(
    ['skills', 'add', 'release-manager', '--workspace=apps/web', '--description=Release orchestration workflow'],
    {
      cwd: root,
      packageRoot
    }
  );

  const skillPath = path.join(root, 'apps', 'web', '.cursor', 'skills', 'release-manager', 'SKILL.md');
  assert.equal(await exists(skillPath), true);
  const content = await fs.readFile(skillPath, 'utf8');
  assert.match(content, /name: release-manager/);
  assert.match(content, /description: Release orchestration workflow/);
});

test('skills add seeds built-in skill details when id matches catalog', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  await run(['skills', 'add', 'solid-principles-application', '--workspace=apps/web'], {
    cwd: root,
    packageRoot
  });

  const skillPath = path.join(root, 'apps', 'web', '.cursor', 'skills', 'solid-principles-application', 'SKILL.md');
  assert.equal(await exists(skillPath), true);
  const content = await fs.readFile(skillPath, 'utf8');
  assert.match(content, /name: solid-principles-application/);
  assert.match(content, /description: Apply SRP, OCP, LSP, ISP, and DIP/);
  assert.match(content, /Apply SRP by splitting modules/);
  assert.doesNotMatch(content, /TODO: add concrete implementation steps/);
});

test('skills init remains an alias of skills add', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  await run(['skills', 'init', 'release-manager', '--description=Alias path'], { cwd: root, packageRoot });

  const skillPath = path.join(root, '.cursor', 'skills', 'release-manager', 'SKILL.md');
  assert.equal(await exists(skillPath), true);
  assert.match(await fs.readFile(skillPath, 'utf8'), /description: Alias path/);
});

test('skills remove deletes local skill files', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  await run(['skills', 'add', 'release-manager', '--description=To remove'], { cwd: root, packageRoot });
  const skillPath = path.join(root, '.cursor', 'skills', 'release-manager', 'SKILL.md');
  assert.equal(await exists(skillPath), true);

  await run(['skills', 'remove', 'release-manager'], { cwd: root, packageRoot });
  assert.equal(await exists(skillPath), false);

  await assert.rejects(
    run(['skills', 'remove', 'release-manager'], { cwd: root, packageRoot }),
    /Skill file does not exist:/
  );
});

test('skills validate reports workspace skill quality issues', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });
  await run(['skills', 'add', 'release-manager', '--workspace=apps/web'], { cwd: root, packageRoot });

  await run(['skills', 'validate', '--workspace=apps/web'], { cwd: root, packageRoot });

  const invalid = path.join(root, 'apps', 'web', '.cursor', 'skills', 'broken', 'SKILL.md');
  await fs.mkdir(path.dirname(invalid), { recursive: true });
  await fs.writeFile(invalid, '---\nname: broken\n---\n# broken\n', 'utf8');

  await assert.rejects(
    run(['skills', 'validate', '--workspace=apps/web'], { cwd: root, packageRoot }),
    /skills validate failed:/
  );
});

test('doctor validates all workspaces and keeps healthy status', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  process.exitCode = 0;
  await run(['doctor'], { cwd: root, packageRoot });
  assert.equal(process.exitCode ?? 0, 0);
});

test('doctor fails when required pointer files are missing', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  await fs.rm(path.join(root, 'apps', 'web', '.ailib', 'standards.md'));

  const { output, exitCode } = await runDoctorAndCapture(root);

  assert.match(output, /doctor failed:/);
  assert.match(output, /Missing pointer file: \.ailib\/standards\.md/);
  assert.equal(exitCode, 1);
});

test('update fails fast for invalid local override references', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  const localOverride = {
    version: '1.0.0',
    default_override: {
      targets: {
        add: ['not-a-target']
      }
    }
  };
  await fs.writeFile(path.join(root, 'ailib.local.json'), `${JSON.stringify(localOverride, null, 2)}\n`, 'utf8');

  await assert.rejects(run(['update'], { cwd: root, packageRoot }), /Invalid ailib\.local\.json/);
});

test('doctor reports invalid local override configuration', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  const localOverride = {
    version: '1.0.0',
    workspace_overrides: {
      'apps/missing': {
        modules: {
          set: ['eslint']
        }
      }
    }
  };
  await fs.writeFile(path.join(root, 'ailib.local.json'), `${JSON.stringify(localOverride, null, 2)}\n`, 'utf8');

  const { output, exitCode } = await runDoctorAndCapture(root);
  assert.match(output, /doctor failed:/);
  assert.match(output, /Invalid ailib\.local\.json/);
  assert.match(output, /unknown workspace override key 'apps\/missing'/);
  assert.equal(exitCode, 1);
});

test('update fails fast for malformed local override json', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  await fs.writeFile(path.join(root, 'ailib.local.json'), '{ invalid json }\n', 'utf8');

  await assert.rejects(run(['update'], { cwd: root, packageRoot }), /Invalid ailib\.local\.json: invalid JSON/);
});

test('update fails fast for override schema-level validation errors', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });

  const localOverride = {
    unknown_key: true,
    workspace_overrides: [] as unknown
  };
  await fs.writeFile(path.join(root, 'ailib.local.json'), `${JSON.stringify(localOverride, null, 2)}\n`, 'utf8');

  await assert.rejects(
    run(['update'], { cwd: root, packageRoot }),
    /missing required string 'version'|unexpected root key 'unknown_key'|'workspace_overrides' must be an object/
  );
});

test('doctor reports missing frontmatter fields for module pointers', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  const modulePath = path.join(root, 'apps', 'web', '.ailib', 'modules', 'biome.md');
  const original = await fs.readFile(modulePath, 'utf8');
  const fieldPatterns = [/^updated:.*\n/mu, /^slot:.*\n/mu];
  const mutated = fieldPatterns.reduce((text, pattern) => text.replace(pattern, ''), original);
  await fs.writeFile(modulePath, mutated, 'utf8');

  const { output, exitCode } = await runDoctorAndCapture(root);

  assert.match(output, /doctor failed:/);
  assert.match(output, /Frontmatter missing 'updated': \.ailib\/modules\/biome\.md/);
  assert.match(output, /Frontmatter missing 'slot': \.ailib\/modules\/biome\.md/);
  assert.equal(exitCode, 1);
});

test('doctor fails for explicit workspace without config', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await fs.mkdir(path.join(root, 'apps', 'missing'), { recursive: true });

  await assert.rejects(
    run(['doctor', '--workspace=apps/missing'], { cwd: root, packageRoot }),
    /Workspace has no ailib\.config\.json: .*apps\/missing/
  );
});

test('add/remove fail for explicit workspace without config', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await fs.mkdir(path.join(root, 'apps', 'missing'), { recursive: true });

  await assert.rejects(
    run(['add', 'prettier', '--workspace=apps/missing'], { cwd: root, packageRoot }),
    /Missing ailib\.config\.json in workspace: .*apps\/missing/
  );
  await assert.rejects(
    run(['remove', 'prettier', '--workspace=apps/missing'], { cwd: root, packageRoot }),
    /Missing ailib\.config\.json in workspace: .*apps\/missing/
  );
});

test('uninstall at monorepo root without --all removes root workspace artifacts but keeps lock', async () => {
  const root = await makeMonorepo();
  const serviceDir = path.join(root, 'services', 'ml');

  await run(
    ['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'],
    { cwd: root, packageRoot }
  );
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], {
    cwd: serviceDir,
    packageRoot
  });

  await run(['uninstall'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib')), false);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), false);
  const lockPath = path.join(root, 'ailib.lock');
  assert.equal(await exists(lockPath), true);
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  assert.ok(lock.workspaces['services/ml']);
  assert.equal(await exists(path.join(serviceDir, '.ailib')), true);
  assert.equal(await exists(path.join(serviceDir, 'ailib.config.json')), true);
});

test('uninstall in service workspace removes service and keeps root managed', async () => {
  const root = await makeMonorepo();
  const serviceDir = path.join(root, 'services', 'ml');
  await run(
    ['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'],
    { cwd: root, packageRoot }
  );
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], {
    cwd: serviceDir,
    packageRoot
  });

  await run(['uninstall'], { cwd: serviceDir, packageRoot });

  assert.equal(await exists(path.join(serviceDir, '.ailib')), false);
  assert.equal(await exists(path.join(serviceDir, 'ailib.config.json')), false);
  assert.equal(await exists(path.join(root, '.ailib')), true);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), true);
  assert.equal(await exists(path.join(root, 'ailib.lock')), true);
});

test('uninstall --all at root removes root and service outputs', async () => {
  const root = await makeMonorepo();
  await run(
    ['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'],
    { cwd: root, packageRoot }
  );
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], {
    cwd: path.join(root, 'services', 'ml'),
    packageRoot
  });

  await run(['uninstall', '--all'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib')), false);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), false);
  assert.equal(await exists(path.join(root, 'ailib.lock')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', 'ailib.config.json')), false);
});

test('auto-discovery honors wildcard .gitignore directory patterns', async () => {
  const root = await makeProject();
  await run(
    ['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite', '--bare'],
    {
      cwd: root,
      packageRoot
    }
  );

  const keepDir = path.join(root, 'service-keep');
  const ignoreDir = path.join(root, 'service-ignore');
  await fs.mkdir(keepDir, { recursive: true });
  await fs.mkdir(ignoreDir, { recursive: true });

  const workspaceConfig = (modules: string[]) =>
    JSON.stringify(
      {
        $schema: 'https://ailib.dev/schema/config.schema.json',
        language: 'typescript',
        modules,
        targets: ['claude-code'],
        docs_path: './docs/'
      },
      null,
      2
    ) + '\n';

  await fs.writeFile(path.join(keepDir, 'ailib.config.json'), workspaceConfig(['biome']), 'utf8');
  await fs.writeFile(path.join(ignoreDir, 'ailib.config.json'), workspaceConfig(['prettier']), 'utf8');

  await fs.writeFile(path.join(root, '.gitignore'), 'service-ign*\n', 'utf8');
  await run(['update'], { cwd: root, packageRoot });

  assert.equal(
    await exists(path.join(keepDir, '.ailib', 'standards.md')),
    true,
    'non-ignored service should be discovered'
  );
  assert.equal(
    await exists(path.join(ignoreDir, '.ailib', 'standards.md')),
    false,
    'ignored wildcard service should be excluded'
  );
});

test('doctor reports missing frontmatter block in required pointer files', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  const pointerPath = path.join(root, 'apps', 'web', '.ailib', 'standards.md');
  await fs.writeFile(pointerPath, '# not frontmatter\n', 'utf8');

  const { output, exitCode } = await runDoctorAndCapture(root);
  assert.match(output, /doctor failed:/);
  assert.match(output, /Missing frontmatter: \.ailib\/standards\.md/);
  assert.equal(exitCode, 1);
});

test('update warns when local override uses deprecated slot alias', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], {
    cwd: root,
    packageRoot
  });
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code'], {
    cwd: path.join(root, 'apps', 'web'),
    packageRoot
  });

  const localOverride = {
    version: '1.0.0',
    workspace_overrides: {
      'apps/web': {
        slots: {
          framework: { set: 'nextjs' }
        }
      }
    }
  };
  await fs.writeFile(path.join(root, 'ailib.local.json'), `${JSON.stringify(localOverride, null, 2)}\n`, 'utf8');

  const stderr = await captureStderr(async () => {
    await run(['update'], { cwd: root, packageRoot });
  });
  assert.match(stderr, /slot alias 'framework' is deprecated; use 'frontend_framework'/);
});

test('update fails when project root cannot be detected', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-no-root-'));
  await assert.rejects(run(['update'], { cwd, packageRoot }), /Could not detect project root/);
});

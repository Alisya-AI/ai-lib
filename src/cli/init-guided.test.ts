import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveGuidedInitSelections } from './init-guided.ts';
import type { Registry } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-init-guided-'));
}

const registry: Registry = {
  version: 'test',
  slots: ['linter'],
  languages: {
    typescript: { modules: { biome: { slot: 'linter' }, eslint: { slot: 'linter' } } },
    python: { modules: { black: { slot: 'linter' }, ruff: { slot: 'linter' } } }
  },
  targets: {
    cursor: { output: '.cursor/rules/ailib.mdc' },
    'claude-code': { output: 'CLAUDE.md' }
  },
  skills: {
    'architecture-decision-flow': {
      display: 'Architecture decision flow',
      path: 'skills/architecture-decision-flow.md',
      skill_type: 'architecture',
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    },
    'release-readiness': {
      display: 'Release readiness',
      path: 'skills/release-readiness.md',
      skill_type: 'reliability',
      requires: ['architecture-decision-flow'],
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    },
    'incident-review': {
      display: 'Incident review',
      path: 'skills/incident-review.md',
      skill_type: 'reliability',
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    }
  }
};

test('resolveGuidedInitSelections falls back to defaults when not interactive', async () => {
  const rootDir = await tempDir();
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['cursor'],
      skills: ['architecture-decision-flow']
    },
    promptIO: { interactive: false }
  });

  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.modules, ['eslint']);
  assert.deepEqual(result.targets, ['cursor']);
  assert.deepEqual(result.skills, ['architecture-decision-flow']);
  assert.deepEqual(result.workspaceLanguageOverrides, {});
});

test('resolveGuidedInitSelections retries invalid input and auto-adds required skills', async () => {
  const rootDir = await tempDir();
  await fs.mkdir(path.join(rootDir, 'apps', 'web'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'services', 'ml'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'apps', 'web', 'ailib.config.json'), '{"language":"typescript"}\n', 'utf8');

  const answers = [
    '9', // invalid target answer
    '1,2', // valid targets
    '2', // typescript
    '', // modules -> defaults (none)
    '3', // release-readiness (auto-add architecture dependency)
    'maybe', // invalid yes/no answer
    'y', // confirm workspace overrides
    '1' // services/ml language = python
  ];
  const writes: string[] = [];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: false,
    workspacePatterns: ['apps/*', 'services/*'],
    defaults: {
      language: 'typescript',
      modules: [],
      targets: ['cursor', 'claude-code'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.deepEqual(result.targets, ['claude-code', 'cursor']);
  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.modules, []);
  assert.deepEqual(result.skills, ['release-readiness', 'architecture-decision-flow']);
  assert.deepEqual(result.workspaceLanguageOverrides, { 'services/ml': 'python' });
  assert.match(writes.join(''), /Invalid selection/);
  assert.match(writes.join(''), /Please answer yes or no/);
  assert.match(writes.join(''), /Auto-selected required skills/);
  assert.match(writes.join(''), /already has ailib\.config\.json/);
});

test('resolveGuidedInitSelections requires ask handler in interactive mode', async () => {
  const rootDir = await tempDir();
  await assert.rejects(
    resolveGuidedInitSelections({
      registry,
      rootDir,
      configFile: 'ailib.config.json',
      bare: true,
      workspacePatterns: [],
      defaults: {
        language: 'typescript',
        modules: [],
        targets: ['cursor'],
        skills: []
      },
      promptIO: {
        interactive: true
      }
    }),
    /Interactive guided init requires prompt ask handler/
  );
});

test('resolveGuidedInitSelections validates empty language choices and invalid single selections', async () => {
  const rootDir = await tempDir();
  const missingLanguagesRegistry: Registry = {
    ...registry,
    languages: {}
  };
  await assert.rejects(
    resolveGuidedInitSelections({
      registry: missingLanguagesRegistry,
      rootDir,
      configFile: 'ailib.config.json',
      bare: true,
      workspacePatterns: [],
      defaults: {
        language: 'typescript',
        modules: [],
        targets: ['cursor'],
        skills: []
      },
      promptIO: {
        interactive: true,
        ask: async () => '',
        write: () => {}
      }
    }),
    /No available choices for Default language/
  );
});

test('resolveGuidedInitSelections supports id tokens and retries invalid multi-select syntax', async () => {
  const rootDir = await tempDir();
  const answers = [
    ',', // invalid empty token set for required targets multi-select
    'cursor', // id token (non-numeric) for targets
    'invalid-language', // invalid single choice token
    'typescript', // id token (non-numeric) for language
    'eslint', // id token for modules
    'none' // explicit empty skills
  ];
  const writes: string[] = [];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: [],
      targets: ['cursor'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.deepEqual(result.targets, ['cursor']);
  assert.deepEqual(result.modules, ['eslint']);
  assert.deepEqual(result.skills, []);
  const output = writes.join('');
  assert.match(output, /At least one selection is required/);
  assert.match(output, /Invalid selection 'invalid-language'/);
});

test('resolveGuidedInitSelections handles empty module and skill groups gracefully', async () => {
  const rootDir = await tempDir();
  const goOnlyRegistry: Registry = {
    ...registry,
    languages: {
      go: { modules: {} }
    }
  };
  const writes: string[] = [];
  const result = await resolveGuidedInitSelections({
    registry: goOnlyRegistry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'go',
      modules: [],
      targets: ['cursor'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.equal(result.language, 'go');
  assert.deepEqual(result.modules, []);
  assert.deepEqual(result.skills, []);
  const output = writes.join('');
  assert.match(output, /Modules \(go\): no compatible options/);
  assert.match(output, /Skills: no compatible options/);
  assert.match(output, /\(none\)/);
});

test('resolveGuidedInitSelections accepts comma-only input for optional multi-select', async () => {
  const rootDir = await tempDir();
  const answers = [
    '1', // target
    '2', // typescript
    ',', // modules (allowEmpty=true, empty token set)
    '' // skills defaults
  ];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: [],
      targets: ['cursor'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: () => {}
    }
  });

  assert.deepEqual(result.modules, []);
});

test('resolveGuidedInitSelections traverses double-star patterns and ignores missing paths', async () => {
  const rootDir = await tempDir();
  await fs.mkdir(path.join(rootDir, 'apps', 'api'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'services', 'worker'), { recursive: true });

  const answers = [
    '1', // target
    '2', // typescript
    '', // modules
    '', // skills
    'n' // skip workspace language override configuration
  ];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: false,
    workspacePatterns: ['**', 'missing/path'],
    defaults: {
      language: 'typescript',
      modules: [],
      targets: ['cursor'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: () => {}
    }
  });

  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.workspaceLanguageOverrides, {});
});

test('resolveGuidedInitSelections supports default writer when prompt write is omitted', async () => {
  const rootDir = await tempDir();
  const answers = [
    '', // targets defaults
    '', // language default
    '', // modules default
    '' // skills default
  ];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['cursor'],
      skills: ['architecture-decision-flow']
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || ''
    }
  });

  assert.deepEqual(result.modules, ['eslint']);
  assert.deepEqual(result.targets, ['cursor']);
});

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
    '1', // services/ml language = python
    'y' // apply summary
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
    'none', // explicit empty skills
    'y' // apply summary
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
  const answers = [
    '', // targets defaults
    '', // language default
    '', // modules default
    '', // skills default
    'y' // apply summary
  ];
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
      ask: async () => answers.shift() || '',
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

test('resolveGuidedInitSelections evaluates module compatibility filters', async () => {
  const rootDir = await tempDir();
  const moduleCompatibleRegistry: Registry = {
    ...registry,
    skills: {
      ...(registry.skills || {}),
      'module-aware-skill': {
        display: 'Module aware skill',
        path: 'skills/module-aware-skill.md',
        skill_type: 'reliability',
        compatible: {
          languages: ['typescript'],
          modules: ['eslint'],
          targets: ['cursor']
        }
      }
    }
  };

  const answers = [
    'cursor', // target
    'typescript', // language
    'eslint', // module
    'none', // skills
    'y' // apply summary
  ];

  const result = await resolveGuidedInitSelections({
    registry: moduleCompatibleRegistry,
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

  assert.deepEqual(result.targets, ['cursor']);
  assert.deepEqual(result.modules, ['eslint']);
});

test('resolveGuidedInitSelections accepts comma-only input for optional multi-select', async () => {
  const rootDir = await tempDir();
  const answers = [
    '1', // target
    '2', // typescript
    ',', // modules (allowEmpty=true, empty token set)
    '', // skills defaults
    'y' // apply summary
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
    'n', // skip workspace language override configuration
    'y' // apply summary
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

test('resolveGuidedInitSelections supports multiple workspace overrides in summary', async () => {
  const rootDir = await tempDir();
  await fs.mkdir(path.join(rootDir, 'apps', 'api'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'services', 'ml'), { recursive: true });

  const answers = [
    '2', // target = cursor
    '2', // language = typescript
    'none', // modules
    'none', // skills
    'y', // configure workspace language overrides
    '1', // apps/api => python
    '1', // services/ml => python
    'y' // confirm summary
  ];
  const result = await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: false,
    workspacePatterns: ['apps/*', 'services/*'],
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

  assert.deepEqual(result.workspaceLanguageOverrides, {
    'apps/api': 'python',
    'services/ml': 'python'
  });
});

test('resolveGuidedInitSelections supports default writer when prompt write is omitted', async () => {
  const rootDir = await tempDir();
  const answers = [
    '', // targets defaults
    '', // language default
    '', // modules default
    '', // skills default
    'y' // apply summary
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

test('resolveGuidedInitSelections can load defaults from saved preset', async () => {
  const rootDir = await tempDir();
  await fs.mkdir(path.join(rootDir, '.ailib'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, '.ailib', 'init-presets.json'),
    `${JSON.stringify(
      {
        version: 1,
        presets: {
          'python-default': {
            language: 'python',
            modules: ['ruff'],
            targets: ['claude-code'],
            skills: [],
            workspaceLanguageOverrides: {}
          }
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const answers = [
    'y', // load preset
    '1', // choose python-default
    '', // targets (preset default)
    '', // language (preset default)
    '', // modules (preset default)
    '', // skills (preset default)
    'y' // apply summary
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
      ask: async () => answers.shift() || '',
      write: () => {}
    }
  });

  assert.equal(result.language, 'python');
  assert.deepEqual(result.targets, ['claude-code']);
  assert.deepEqual(result.modules, ['ruff']);
});

test('resolveGuidedInitSelections can save selected preset after apply', async () => {
  const rootDir = await tempDir();
  const answers = [
    '2', // target = cursor
    '2', // language = typescript
    '1', // module = biome
    'none', // skills
    'y', // apply summary
    'y', // save preset
    'team-default' // preset name
  ];
  await resolveGuidedInitSelections({
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

  const raw = await fs.readFile(path.join(rootDir, '.ailib', 'init-presets.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    presets?: Record<string, { language: string; modules: string[]; targets: string[] }>;
  };
  assert.equal(parsed.presets?.['team-default']?.language, 'typescript');
  assert.deepEqual(parsed.presets?.['team-default']?.modules, ['biome']);
  assert.deepEqual(parsed.presets?.['team-default']?.targets, ['cursor']);
});

test('resolveGuidedInitSelections requires explicit yes or no for final apply in text mode', async () => {
  const rootDir = await tempDir();
  const answers = [
    '', // targets defaults
    '', // language default
    '', // modules default
    '', // skills default
    '', // invalid for explicit final apply
    'y' // apply summary
  ];
  const writes: string[] = [];
  await resolveGuidedInitSelections({
    registry,
    rootDir,
    configFile: 'ailib.config.json',
    bare: true,
    workspacePatterns: [],
    defaults: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['cursor'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.match(writes.join(''), /Please answer yes or no\./);
});

test('resolveGuidedInitSelections restarts onboarding when user rejects summary', async () => {
  const rootDir = await tempDir();
  const answers = [
    '1', // pass 1 target = claude-code
    '2', // pass 1 language = typescript
    '', // pass 1 modules defaults
    '', // pass 1 skills defaults
    'n', // reject summary
    'y', // restart flow
    '2', // pass 2 target = cursor
    '1', // pass 2 language = python
    'none', // pass 2 modules
    'none', // pass 2 skills
    'y' // accept summary
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
      targets: ['claude-code'],
      skills: []
    },
    promptIO: {
      interactive: true,
      ask: async () => answers.shift() || '',
      write: (line: string) => writes.push(line)
    }
  });

  assert.deepEqual(result.targets, ['cursor']);
  assert.equal(result.language, 'python');
  assert.match(writes.join(''), /Review your onboarding selections/);
  assert.match(writes.join(''), /No files will be created or updated until you confirm apply\./);
  assert.match(writes.join(''), /Restarting guided onboarding/);
});

test('resolveGuidedInitSelections aborts when user cancels after summary review', async () => {
  const rootDir = await tempDir();
  const answers = [
    '', // targets defaults
    '', // language default
    '', // modules default
    '', // skills default
    'n', // reject summary
    'n' // do not restart
  ];
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
        interactive: true,
        ask: async () => answers.shift() || '',
        write: () => {}
      }
    }),
    /Guided init cancelled by user/
  );
});

test('resolveGuidedInitSelections uses custom selector handlers when provided', async () => {
  const rootDir = await tempDir();
  const calls: string[] = [];
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
      ask: async () => '',
      write: () => {},
      selectMany: async ({ title }) => {
        calls.push(`multi:${title}`);
        if (title === 'Targets') return ['cursor'];
        if (title === 'Modules (typescript)') return ['eslint'];
        if (title === 'Skills') return ['incident-review'];
        return [];
      },
      selectOne: async ({ title }) => {
        calls.push(`single:${title}`);
        if (title === 'Default language') return 'typescript';
        throw new Error(`Unexpected single select: ${title}`);
      },
      confirm: async ({ question, defaultValue, requireExplicit }) => {
        calls.push(`confirm:${question}:${String(defaultValue)}:${String(requireExplicit)}`);
        return question.startsWith('Apply this setup?');
      }
    }
  });

  assert.deepEqual(result.targets, ['cursor']);
  assert.equal(result.language, 'typescript');
  assert.deepEqual(result.modules, ['eslint']);
  assert.deepEqual(result.skills, ['incident-review']);
  assert.ok(calls.includes('single:Default language'));
  assert.ok(calls.includes('multi:Targets'));
  assert.ok(calls.includes('multi:Modules (typescript)'));
  assert.ok(calls.includes('multi:Skills'));
  assert.ok(calls.some((entry) => entry.startsWith('confirm:Apply this setup? [y/n]: :false:true')));
});

test('resolveGuidedInitSelections rejects invalid single-choice id from selector handler', async () => {
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
        interactive: true,
        ask: async () => '',
        write: () => {},
        selectMany: async ({ title }) => (title === 'Targets' ? ['cursor'] : []),
        selectOne: async () => 'not-a-language',
        confirm: async ({ question }) => question.startsWith('Apply this setup?')
      }
    }),
    /Invalid selection 'not-a-language' for Default language/
  );
});

test('resolveGuidedInitSelections rejects invalid multi-choice id from selector handler', async () => {
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
        interactive: true,
        ask: async () => '',
        write: () => {},
        selectMany: async ({ title }) => {
          if (title === 'Targets') return ['cursor'];
          if (title === 'Modules (typescript)') return ['not-a-module'];
          return [];
        },
        selectOne: async () => 'typescript',
        confirm: async ({ question }) => question.startsWith('Apply this setup?')
      }
    }),
    /Invalid selection 'not-a-module' for Modules \(typescript\)/
  );
});

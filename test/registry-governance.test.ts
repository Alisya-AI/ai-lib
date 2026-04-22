import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const registryPath = path.join(packageRoot, 'registry.json');
const slotNamePattern = /^[a-z]+(?:_[a-z]+)*$/u;

type FrontmatterValue = string | string[];
type Frontmatter = Record<string, FrontmatterValue>;

interface ModuleDef {
  slot: string;
  requires?: string[];
  conflicts_with?: string[];
}

interface LanguageDef {
  modules?: Record<string, ModuleDef>;
}

interface SlotDef {
  kind: 'exclusive' | 'composable';
  description: string;
}

interface AliasMeta {
  replacement: string;
  deprecated_since: string;
  remove_in: string;
}

interface Registry {
  slots?: string[];
  slot_defs?: Record<string, SlotDef>;
  slot_aliases?: Record<string, string>;
  slot_alias_meta?: Record<string, AliasMeta>;
  languages?: Record<string, LanguageDef>;
}

async function loadRegistry(): Promise<Registry> {
  return JSON.parse(await fs.readFile(registryPath, 'utf8'));
}

function parseFrontmatter(markdown: string): Frontmatter | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const fields: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value: FrontmatterValue = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    fields[key] = value;
  }
  return fields;
}

test('registry slots follow naming and coverage rules', async () => {
  const registry = await loadRegistry();
  const slots = registry.slots || [];
  const slotDefs = registry.slot_defs || {};
  const slotAliases = registry.slot_aliases || {};
  const aliasMeta = registry.slot_alias_meta || {};

  assert.ok(slots.length > 0, 'registry.slots must not be empty');

  for (const slot of slots) {
    assert.match(slot, slotNamePattern, `Invalid slot name '${slot}'`);
  }

  const slotSet = new Set(slots);
  const slotDefSet = new Set(Object.keys(slotDefs));
  assert.deepEqual([...slotDefSet].sort(), [...slotSet].sort(), 'slot_defs keys must match slots exactly');

  for (const [slot, def] of Object.entries(slotDefs)) {
    assert.equal(typeof def.description, 'string', `slot_defs.${slot}.description must be string`);
    assert.ok(def.description.trim().length > 0, `slot_defs.${slot}.description must not be empty`);
    assert.ok(
      def.kind === 'exclusive' || def.kind === 'composable',
      `slot_defs.${slot}.kind must be exclusive|composable`
    );
  }

  for (const [alias, target] of Object.entries(slotAliases)) {
    assert.ok(!slotSet.has(alias), `slot_aliases key '${alias}' must not be canonical slot`);
    assert.ok(slotSet.has(target), `slot_aliases target '${target}' must exist in slots`);
  }

  assert.deepEqual(
    Object.keys(aliasMeta).sort(),
    Object.keys(slotAliases).sort(),
    'slot_alias_meta keys must match slot_aliases keys'
  );

  for (const [alias, meta] of Object.entries(aliasMeta)) {
    assert.equal(
      meta.replacement,
      slotAliases[alias],
      `slot_alias_meta.${alias}.replacement must match slot_aliases target`
    );
    for (const key of ['deprecated_since', 'remove_in']) {
      assert.match(meta[key], /^\d+\.\d+\.\d+$/u, `slot_alias_meta.${alias}.${key} must be semver-like`);
    }
  }
});

test('registry modules use canonical slots and docs match', async () => {
  const registry = await loadRegistry();
  const slots = new Set(registry.slots || []);
  const aliases = registry.slot_aliases || {};
  const usedSlots = new Set<string>();

  for (const [languageId, languageDef] of Object.entries(registry.languages || {})) {
    const moduleDir = path.join(packageRoot, 'languages', languageId, 'modules');
    const docModuleIds = await fs
      .readdir(moduleDir, { withFileTypes: true })
      .then((entries) =>
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
          .map((entry) => entry.name.replace(/\.md$/u, ''))
          .sort()
      )
      .catch(() => []);
    const registryModuleIds = Object.keys(languageDef.modules || {}).sort();

    assert.deepEqual(docModuleIds, registryModuleIds, `Registry/docs module mismatch for language '${languageId}'`);

    for (const [moduleId, moduleDef] of Object.entries(languageDef.modules || {})) {
      const rawSlot = moduleDef.slot;
      assert.ok(rawSlot, `Missing slot for module '${languageId}:${moduleId}'`);
      const canonical = aliases[rawSlot] || rawSlot;
      usedSlots.add(canonical);
      assert.ok(slots.has(canonical), `Unknown canonical slot '${canonical}' for module '${languageId}:${moduleId}'`);
      assert.equal(
        rawSlot,
        canonical,
        `Module '${languageId}:${moduleId}' uses alias slot '${rawSlot}', use canonical '${canonical}'`
      );

      const modulePath = path.join(packageRoot, 'languages', languageId, 'modules', `${moduleId}.md`);
      const markdown = await fs.readFile(modulePath, 'utf8');
      const frontmatter = parseFrontmatter(markdown);
      assert.ok(frontmatter, `Missing frontmatter in '${modulePath}'`);
      assert.equal(frontmatter.slot, canonical, `Frontmatter slot mismatch for '${languageId}:${moduleId}'`);
      assert.equal(frontmatter.id, moduleId, `Frontmatter id mismatch for '${languageId}:${moduleId}'`);
      assert.equal(frontmatter.language, languageId, `Frontmatter language mismatch for '${languageId}:${moduleId}'`);
    }
  }

  assert.deepEqual(
    [...usedSlots].sort(),
    [...slots].sort(),
    'Every canonical slot should be represented by at least one module'
  );
});

test('registry module relationships and frontmatter metadata are valid', async () => {
  const registry = await loadRegistry();

  for (const [languageId, languageDef] of Object.entries(registry.languages || {})) {
    const moduleIds = new Set(Object.keys(languageDef.modules || {}));

    for (const [moduleId, moduleDef] of Object.entries(languageDef.modules || {})) {
      const requires = moduleDef.requires || [];
      const conflicts = moduleDef.conflicts_with || [];
      const requiresSet = new Set(requires);
      const conflictsSet = new Set(conflicts);

      assert.equal(requires.length, requiresSet.size, `Duplicate requires entries in '${languageId}:${moduleId}'`);
      assert.equal(conflicts.length, conflictsSet.size, `Duplicate conflicts entries in '${languageId}:${moduleId}'`);
      assert.ok(!requiresSet.has(moduleId), `Module '${languageId}:${moduleId}' cannot require itself`);
      assert.ok(!conflictsSet.has(moduleId), `Module '${languageId}:${moduleId}' cannot conflict with itself`);
      for (const dependency of requiresSet) {
        assert.ok(
          !conflictsSet.has(dependency),
          `Module '${languageId}:${moduleId}' cannot both require and conflict with '${dependency}'`
        );
      }

      const modulePath = path.join(packageRoot, 'languages', languageId, 'modules', `${moduleId}.md`);
      const markdown = await fs.readFile(modulePath, 'utf8');
      const frontmatter = parseFrontmatter(markdown);
      assert.ok(frontmatter, `Missing frontmatter in '${modulePath}'`);
      for (const key of ['id', 'display', 'version', 'updated']) {
        assert.ok(frontmatter[key], `Frontmatter missing '${key}' in '${languageId}:${moduleId}'`);
      }
      assert.match(
        String(frontmatter.version),
        /^\d+\.\d+\.\d+$/u,
        `Frontmatter version must be semver-like in '${languageId}:${moduleId}'`
      );
    }
  }
});

test('split registry and generated catalog are in sync', () => {
  const run = (script: string, ...args: string[]) =>
    execFileSync(process.execPath, [path.join(packageRoot, script), ...args], { stdio: 'pipe', encoding: 'utf8' });

  run('tools/sync-registry.ts', '--check');
  run('tools/generate-module-catalog.ts', '--check');
});

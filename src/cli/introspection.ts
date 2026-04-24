import path from 'node:path';
import { getStringFlag } from './flags.ts';
import { readJson } from './utils.ts';
import type { CliFlags, LanguageDefinition, Registry } from './types.ts';

export async function slotsCommand({ packageRoot, flags }: { packageRoot: string; flags: CliFlags }) {
  const sub = flags._[0] || 'list';
  ensure(sub === 'list', `Usage: ailib slots list`);

  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const slotDefs = registry.slot_defs || {};

  const lines = ['slots:'];
  for (const slot of registry.slots || []) {
    const def = slotDefs[slot] || {};
    const kind = def.kind ? ` (${def.kind})` : '';
    const description = def.description ? ` - ${def.description}` : '';
    lines.push(`- ${slot}${kind}${description}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

export async function modulesCommand({ packageRoot, flags }: { packageRoot: string; flags: CliFlags }) {
  const sub = flags._[0];
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));

  if (sub === 'list') {
    const language = getStringFlag(flags, 'language') || Object.keys(registry.languages)[0];
    const lang = registry.languages[language];
    ensure(lang, `Unsupported language: ${language}`);

    const lines = [`modules (${language}):`];
    const modules = Object.entries(lang.modules || {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [moduleId, moduleDef] of modules) {
      lines.push(`- ${moduleId} (slot: ${moduleDef.slot})`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  if (sub === 'explain') {
    const moduleId = flags._[1];
    ensure(moduleId, 'Usage: ailib modules explain <module> [--language=<lang>]');

    const requestedLanguage = getStringFlag(flags, 'language');
    const candidates: Array<[string, LanguageDefinition | undefined]> = requestedLanguage
      ? [[requestedLanguage, registry.languages[requestedLanguage]]]
      : Object.entries(registry.languages || {});

    if (requestedLanguage) {
      ensure(registry.languages[requestedLanguage], `Unsupported language: ${requestedLanguage}`);
    }

    for (const [language, lang] of candidates) {
      const moduleDef = lang?.modules?.[moduleId];
      if (!moduleDef) continue;
      const lines = [
        `module: ${moduleId}`,
        `language: ${language}`,
        `slot: ${moduleDef.slot}`,
        `requires: ${(moduleDef.requires || []).join(', ') || '(none)'}`,
        `conflicts_with: ${(moduleDef.conflicts_with || []).join(', ') || '(none)'}`,
        `doc: languages/${language}/modules/${moduleId}.md`
      ];
      process.stdout.write(`${lines.join('\n')}\n`);
      return;
    }

    const scope = requestedLanguage ? ` for ${requestedLanguage}` : '';
    throw new Error(`Unknown module${scope}: ${moduleId}`);
  }

  throw new Error('Usage: ailib modules list [--language=<lang>] | ailib modules explain <module> [--language=<lang>]');
}

export async function skillsCatalogCommand({ packageRoot, flags }: { packageRoot: string; flags: CliFlags }) {
  const sub = flags._[0];
  const registry = await readJson<Registry>(path.join(packageRoot, 'registry.json'));
  const skills = registry.skills || {};

  if (sub === 'list') {
    const lines = ['skills:'];
    for (const [skillId, skillDef] of Object.entries(skills).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- ${skillId} - ${skillDef.display}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  if (sub === 'explain') {
    const skillId = flags._[1];
    ensure(skillId, 'Usage: ailib skills explain <skill-id>');
    const skillDef = skills[skillId];
    ensure(skillDef, `Unknown skill: ${skillId}`);

    const compatible = skillDef.compatible || {};
    const lines = [
      `skill: ${skillId}`,
      `display: ${skillDef.display}`,
      `path: ${skillDef.path}`,
      `description: ${skillDef.description || '(none)'}`,
      `requires: ${(skillDef.requires || []).join(', ') || '(none)'}`,
      `conflicts_with: ${(skillDef.conflicts_with || []).join(', ') || '(none)'}`,
      `compatible.languages: ${(compatible.languages || []).join(', ') || '(none)'}`,
      `compatible.modules: ${(compatible.modules || []).join(', ') || '(none)'}`,
      `compatible.targets: ${(compatible.targets || []).join(', ') || '(none)'}`,
      `compatible.llms: ${(compatible.llms || []).join(', ') || '(none)'}`
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  throw new Error('Usage: ailib skills list | ailib skills explain <skill-id>');
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

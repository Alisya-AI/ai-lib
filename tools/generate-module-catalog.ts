import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const registryPath = path.join(packageRoot, 'registry.json');
const outputPath = path.join(packageRoot, 'docs', 'module-catalog.md');
const checkOnly = process.argv.includes('--check');

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function renderCatalog(registry: any): string {
  const lines: string[] = [];
  lines.push('# Module Catalog');
  lines.push('');
  lines.push('This catalog is generated from `registry.json`.');
  lines.push('Run `bun tools/generate-module-catalog.ts` after registry changes.');
  lines.push('');
  lines.push('## Slot Catalog');
  lines.push('');

  for (const slot of registry.slots || []) {
    const def = registry.slot_defs?.[slot] || {};
    const kind = def.kind || 'exclusive';
    const description = def.description || '';
    lines.push(`- \`${slot}\` (${kind})${description ? ` - ${description}` : ''}`);
  }

  lines.push('');
  lines.push('## Language Modules');
  lines.push('');

  for (const [languageId, languageDef] of Object.entries(registry.languages || {}) as Array<[string, any]>) {
    lines.push(`### ${languageDef.display} (\`${languageId}\`)`);
    lines.push('');
    lines.push(`Core: \`${languageDef.path}\``);
    lines.push('');

    const modulesBySlot = new Map<string, Array<[string, any]>>();
    for (const slot of registry.slots || []) modulesBySlot.set(slot, []);
    for (const [moduleId, moduleDef] of Object.entries(languageDef.modules || {}) as Array<[string, any]>) {
      const slot = moduleDef.slot;
      if (!modulesBySlot.has(slot)) modulesBySlot.set(slot, []);
      modulesBySlot.get(slot)?.push([moduleId, moduleDef]);
    }

    const populatedSlots = [...modulesBySlot.entries()].filter(([, items]) => items.length > 0);
    if (populatedSlots.length === 0) {
      lines.push('- No modules registered.');
      lines.push('');
      continue;
    }

    for (const [slot, items] of populatedSlots) {
      lines.push(`#### ${slot}`);
      lines.push('');
      items.sort(([a], [b]) => a.localeCompare(b));
      for (const [moduleId, moduleDef] of items) {
        const requires = (moduleDef.requires || []).join(', ') || '(none)';
        const conflicts = (moduleDef.conflicts_with || []).join(', ') || '(none)';
        lines.push(`- \`${moduleId}\` — requires: ${requires}; conflicts: ${conflicts}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function run(): Promise<void> {
  const registry = await readJson(registryPath);
  const nextText = renderCatalog(registry);

  if (checkOnly) {
    const currentText = await fs.readFile(outputPath, 'utf8');
    if (currentText !== nextText) {
      process.stderr.write('docs/module-catalog.md is out of sync. Run: bun tools/generate-module-catalog.ts\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('docs/module-catalog.md is up to date\n');
    return;
  }

  await fs.writeFile(outputPath, nextText, 'utf8');
  process.stdout.write('docs/module-catalog.md updated\n');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

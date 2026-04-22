import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const registryPath = path.join(packageRoot, 'registry.json');
const outputPath = path.join(packageRoot, 'docs', 'module-coverage-audit.md');
const checkOnly = process.argv.includes('--check');

type DocModuleInfo = {
  moduleId: string;
  filePath: string;
  frontmatter: Record<string, string>;
};

type RegistryModuleInfo = {
  moduleId: string;
  slot: string;
};

type LanguageReport = {
  languageId: string;
  display: string;
  registryCount: number;
  docCount: number;
  missingDocs: string[];
  orphanDocs: string[];
  frontmatterIssues: string[];
};

type CoverageReport = {
  byLanguage: LanguageReport[];
  global: {
    registryModules: number;
    docModules: number;
  };
  slotUsage: Map<string, string[]>;
};

interface ModuleDef {
  slot: string;
}

interface LanguageDef {
  display: string;
  modules?: Record<string, ModuleDef>;
}

interface Registry {
  slots?: string[];
  languages?: Record<string, LanguageDef>;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

function parseFrontmatter(markdown: string): Record<string, string> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    fields[key] = line.slice(idx + 1).trim();
  }
  return fields;
}

async function collectDocModuleInfo(languageId: string): Promise<DocModuleInfo[]> {
  const dir = path.join(packageRoot, 'languages', languageId, 'modules');
  let entries: Array<{ isFile: () => boolean; name: string }> = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  const modules: DocModuleInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const moduleId = entry.name.replace(/\.md$/u, '');
    const filePath = path.join(dir, entry.name);
    const markdown = await fs.readFile(filePath, 'utf8');
    const frontmatter = parseFrontmatter(markdown) || {};
    modules.push({ moduleId, filePath, frontmatter });
  }
  return modules;
}

async function buildAudit(registry: Registry): Promise<CoverageReport> {
  const report: CoverageReport = {
    byLanguage: [],
    global: {
      registryModules: 0,
      docModules: 0
    },
    slotUsage: new Map()
  };

  for (const slot of registry.slots || []) report.slotUsage.set(slot, []);

  for (const [languageId, languageDef] of Object.entries(registry.languages || {})) {
    const registryModules: RegistryModuleInfo[] = Object.entries(languageDef.modules || {}).map(
      ([moduleId, moduleDef]) => ({
        moduleId,
        slot: moduleDef.slot
      })
    );
    const docModules = await collectDocModuleInfo(languageId);

    const registryIds = new Set(registryModules.map((m) => m.moduleId));
    const docIds = new Set(docModules.map((m) => m.moduleId));

    const missingDocs = registryModules.filter((m) => !docIds.has(m.moduleId)).map((m) => m.moduleId);
    const orphanDocs = docModules.filter((m) => !registryIds.has(m.moduleId)).map((m) => m.moduleId);

    const frontmatterIssues: string[] = [];
    for (const doc of docModules) {
      const expectedSlot = languageDef.modules?.[doc.moduleId]?.slot;
      if (expectedSlot) {
        const issues: string[] = [];
        if (doc.frontmatter.id !== doc.moduleId) issues.push(`id=${doc.frontmatter.id || '(missing)'}`);
        if (doc.frontmatter.language !== languageId) issues.push(`language=${doc.frontmatter.language || '(missing)'}`);
        if (doc.frontmatter.slot !== expectedSlot) issues.push(`slot=${doc.frontmatter.slot || '(missing)'}`);
        if (issues.length) {
          frontmatterIssues.push(`- \`${doc.moduleId}\`: ${issues.join(', ')}`);
        }
      }
    }

    for (const mod of registryModules) {
      const slot = mod.slot;
      if (!report.slotUsage.has(slot)) report.slotUsage.set(slot, []);
      report.slotUsage.get(slot)?.push(`${languageId}:${mod.moduleId}`);
    }

    report.global.registryModules += registryModules.length;
    report.global.docModules += docModules.length;
    report.byLanguage.push({
      languageId,
      display: languageDef.display,
      registryCount: registryModules.length,
      docCount: docModules.length,
      missingDocs,
      orphanDocs,
      frontmatterIssues
    });
  }

  return report;
}

function renderReport(registry: Registry, report: CoverageReport): string {
  const lines: string[] = [];
  lines.push('# Module/Slot Coverage Audit');
  lines.push('');
  lines.push('This report is generated from `registry.json` and `languages/*/modules/*.md`.');
  lines.push('Run `bun tools/generate-coverage-audit.ts` after registry/module documentation changes.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Registry modules: **${report.global.registryModules}**`);
  lines.push(`- Module docs: **${report.global.docModules}**`);
  lines.push(`- Canonical slots: **${(registry.slots || []).length}**`);
  lines.push('');
  lines.push('## Coverage by Language');
  lines.push('');

  for (const language of report.byLanguage.sort((a, b) => a.languageId.localeCompare(b.languageId))) {
    lines.push(`### ${language.display} (\`${language.languageId}\`)`);
    lines.push('');
    lines.push(`- Registry modules: ${language.registryCount}`);
    lines.push(`- Module docs: ${language.docCount}`);
    lines.push(`- Missing docs: ${language.missingDocs.length}`);
    lines.push(`- Orphan docs: ${language.orphanDocs.length}`);
    lines.push(`- Frontmatter issues: ${language.frontmatterIssues.length}`);
    if (language.missingDocs.length)
      lines.push(`- Missing doc module IDs: ${language.missingDocs.map((m) => `\`${m}\``).join(', ')}`);
    if (language.orphanDocs.length)
      lines.push(`- Orphan doc module IDs: ${language.orphanDocs.map((m) => `\`${m}\``).join(', ')}`);
    if (language.frontmatterIssues.length) {
      lines.push('- Frontmatter mismatches:');
      lines.push(...language.frontmatterIssues);
    }
    if (!language.missingDocs.length && !language.orphanDocs.length && !language.frontmatterIssues.length) {
      lines.push('- No gaps detected.');
    }
    lines.push('');
  }

  lines.push('## Slot Usage');
  lines.push('');
  for (const slot of registry.slots || []) {
    const usedBy = report.slotUsage.get(slot) || [];
    lines.push(`- \`${slot}\`: ${usedBy.length} module(s)`);
    if (usedBy.length) {
      lines.push(`  - ${usedBy.map((entry) => `\`${entry}\``).join(', ')}`);
    } else {
      lines.push('  - (no modules mapped)');
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function run(): Promise<void> {
  const registry = await readJson<Registry>(registryPath);
  const report = await buildAudit(registry);
  const nextText = renderReport(registry, report);

  if (checkOnly) {
    const currentText = await fs.readFile(outputPath, 'utf8');
    if (currentText !== nextText) {
      process.stderr.write('docs/module-coverage-audit.md is out of sync. Run: bun tools/generate-coverage-audit.ts\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('docs/module-coverage-audit.md is up to date\n');
    return;
  }

  await fs.writeFile(outputPath, nextText, 'utf8');
  process.stdout.write('docs/module-coverage-audit.md updated\n');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

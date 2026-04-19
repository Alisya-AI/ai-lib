import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const AILIB_BLOCK_START = '<!-- ailib:start -->';
const AILIB_BLOCK_END = '<!-- ailib:end -->';

export async function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = options.packageRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const flags = parseFlags(rest);
  switch (command) {
    case 'init':
      await initCommand({ cwd, packageRoot, flags });
      break;
    case 'update':
      await updateCommand({ cwd, packageRoot });
      break;
    case 'add':
      await addCommand({ cwd, packageRoot, moduleId: flags._[0] });
      break;
    case 'remove':
      await removeCommand({ cwd, packageRoot, moduleId: flags._[0] });
      break;
    case 'doctor':
      await doctorCommand({ cwd, packageRoot });
      break;
    case 'uninstall':
      await uninstallCommand({ cwd, packageRoot });
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(`ailib commands:\n  ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] [--on-conflict=overwrite|merge|skip|abort]\n  ailib update\n  ailib add <module>\n  ailib remove <module>\n  ailib doctor\n  ailib uninstall\n`);
}

function parseFlags(args) {
  const flags = { _: [] };
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const [k, v = 'true'] = arg.slice(2).split('=');
    flags[k] = v;
  }
  return flags;
}

async function initCommand({ cwd, packageRoot, flags }) {
  const projectRoot = await detectProjectRoot(cwd);
  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const language = flags.language || Object.keys(registry.languages)[0];
  ensure(registry.languages[language], `Unsupported language: ${language}`);

  const modules = uniqueList(splitCsv(flags.modules));
  const targets = uniqueList(splitCsv(flags.targets).length ? splitCsv(flags.targets) : Object.keys(registry.targets));
  const onConflict = flags['on-conflict'] || 'abort';

  validateModuleSelection({ registry, language, modules });
  await ensureAilibFiles({ projectRoot, packageRoot, language, modules });
  await writeConfig({ projectRoot, packageRoot, language, modules, targets, registry });
  await generateRouters({ projectRoot, packageRoot, targets, onConflict });
  process.stdout.write('ailib initialized\n');
}

async function updateCommand({ cwd, packageRoot }) {
  const projectRoot = await detectProjectRoot(cwd);
  const config = await readJson(path.join(projectRoot, 'ailib.config.json'));
  const registry = await readJson(path.join(packageRoot, 'registry.json'));

  validateModuleSelection({ registry, language: config.language, modules: config.modules });
  await ensureAilibFiles({ projectRoot, packageRoot, language: config.language, modules: config.modules });
  await writeLock({ projectRoot, packageRoot, language: config.language, modules: config.modules, targets: config.targets });
  await generateRouters({ projectRoot, packageRoot, targets: config.targets, onConflict: 'overwrite' });
  process.stdout.write('ailib updated\n');
}

async function addCommand({ cwd, packageRoot, moduleId }) {
  ensure(moduleId, 'Usage: ailib add <module>');
  const projectRoot = await detectProjectRoot(cwd);
  const configPath = path.join(projectRoot, 'ailib.config.json');
  const config = await readJson(configPath);
  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const modules = uniqueList([...config.modules, moduleId]);

  validateModuleSelection({ registry, language: config.language, modules });
  config.modules = modules;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await ensureAilibFiles({ projectRoot, packageRoot, language: config.language, modules });
  await writeLock({ projectRoot, packageRoot, language: config.language, modules, targets: config.targets });
  await generateRouters({ projectRoot, packageRoot, targets: config.targets, onConflict: 'overwrite' });
  process.stdout.write(`module added: ${moduleId}\n`);
}

async function removeCommand({ cwd, packageRoot, moduleId }) {
  ensure(moduleId, 'Usage: ailib remove <module>');
  const projectRoot = await detectProjectRoot(cwd);
  const configPath = path.join(projectRoot, 'ailib.config.json');
  const config = await readJson(configPath);
  const modules = config.modules.filter((m) => m !== moduleId);
  config.modules = modules;

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await ensureAilibFiles({ projectRoot, packageRoot, language: config.language, modules });
  await writeLock({ projectRoot, packageRoot, language: config.language, modules, targets: config.targets });
  await generateRouters({ projectRoot, packageRoot, targets: config.targets, onConflict: 'overwrite' });
  process.stdout.write(`module removed: ${moduleId}\n`);
}

async function doctorCommand({ cwd, packageRoot }) {
  const projectRoot = await detectProjectRoot(cwd);
  const errors = [];

  const configPath = path.join(projectRoot, 'ailib.config.json');
  const lockPath = path.join(projectRoot, 'ailib.lock');
  if (!(await exists(configPath))) errors.push('Missing ailib.config.json');
  if (!(await exists(lockPath))) errors.push('Missing ailib.lock');

  let config;
  if (!errors.length) {
    config = await readJson(configPath);
    const registry = await readJson(path.join(packageRoot, 'registry.json'));

    try {
      validateModuleSelection({ registry, language: config.language, modules: config.modules });
    } catch (err) {
      errors.push(err.message);
    }

    const pointers = await resolvePointerPaths({ projectRoot, packageRoot, language: config.language, modules: config.modules });
    for (const file of pointers) {
      if (!(await exists(path.join(projectRoot, file)))) {
        errors.push(`Missing pointer file: ${file}`);
      }
    }

    const allToCheck = ['.ailib/core/behavior.md', '.ailib/core/architecture.md', `.ailib/languages/${config.language}/core.md`, ...config.modules.map((m) => `.ailib/languages/${config.language}/modules/${m}.md`)];
    for (const rel of allToCheck) {
      const full = path.join(projectRoot, rel);
      if (!(await exists(full))) continue;
      const text = await fs.readFile(full, 'utf8');
      const frontmatter = parseFrontmatter(text);
      if (!frontmatter) {
        errors.push(`Missing frontmatter: ${rel}`);
        continue;
      }
      for (const key of ['id', 'version', 'updated']) {
        if (!(key in frontmatter)) {
          errors.push(`Frontmatter missing '${key}': ${rel}`);
        }
      }
      if (!('language' in frontmatter) && !('core' in frontmatter)) {
        errors.push(`Frontmatter missing 'language' or 'core': ${rel}`);
      }
      if (rel.includes('/modules/') && !('slot' in frontmatter)) {
        errors.push(`Frontmatter missing 'slot': ${rel}`);
      }
    }
  }

  if (errors.length) {
    process.stdout.write(`doctor failed:\n- ${errors.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('doctor ok\n');
}

async function uninstallCommand({ cwd, packageRoot }) {
  const projectRoot = await detectProjectRoot(cwd);
  const configPath = path.join(projectRoot, 'ailib.config.json');
  const config = (await exists(configPath)) ? await readJson(configPath) : null;
  const registry = await readJson(path.join(packageRoot, 'registry.json'));

  await rmIfExists(path.join(projectRoot, '.ailib'));
  await rmIfExists(path.join(projectRoot, 'ailib.config.json'));
  await rmIfExists(path.join(projectRoot, 'ailib.lock'));

  if (config?.targets) {
    for (const target of config.targets) {
      const targetDef = registry.targets[target];
      if (targetDef) await rmIfExists(path.join(projectRoot, targetDef.output));
    }
  }

  process.stdout.write('ailib uninstalled\n');
}

async function writeConfig({ projectRoot, packageRoot, language, modules, targets, registry }) {
  const config = {
    version: '1.0.0',
    language,
    modules,
    targets,
    registryVersion: registry.version
  };
  await fs.writeFile(path.join(projectRoot, 'ailib.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await writeLock({ projectRoot, packageRoot, language, modules, targets });
}

async function writeLock({ projectRoot, packageRoot, language, modules, targets }) {
  const pointers = await resolvePointerPaths({ projectRoot, packageRoot, language, modules });
  const lock = {
    generatedAt: new Date().toISOString(),
    language,
    modules,
    targets,
    pointers
  };
  await fs.writeFile(path.join(projectRoot, 'ailib.lock'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

async function ensureAilibFiles({ projectRoot, packageRoot, language, modules }) {
  const outRoot = path.join(projectRoot, '.ailib');
  await fs.mkdir(path.join(outRoot, 'core'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'languages', language, 'modules'), { recursive: true });

  const files = [
    ['core/behavior.md', '.ailib/core/behavior.md'],
    ['core/architecture.md', '.ailib/core/architecture.md'],
    [`languages/${language}/core.md`, `.ailib/languages/${language}/core.md`]
  ];

  for (const mod of modules) {
    files.push([`languages/${language}/modules/${mod}.md`, `.ailib/languages/${language}/modules/${mod}.md`]);
  }

  for (const [sourceRel, targetRel] of files) {
    const source = path.join(packageRoot, sourceRel);
    const target = path.join(projectRoot, targetRel);
    ensure(await exists(source), `Missing module source: ${sourceRel}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }

  const moduleDir = path.join(projectRoot, `.ailib/languages/${language}/modules`);
  if (await exists(moduleDir)) {
    const entries = await fs.readdir(moduleDir);
    for (const entry of entries) {
      if (entry.endsWith('.md') && !modules.includes(entry.replace('.md', ''))) {
        await rmIfExists(path.join(moduleDir, entry));
      }
    }
  }
}

async function resolvePointerPaths({ language, modules }) {
  return [
    '.ailib/core/behavior.md',
    '.ailib/core/architecture.md',
    `.ailib/languages/${language}/core.md`,
    ...modules.map((m) => `.ailib/languages/${language}/modules/${m}.md`)
  ];
}

async function generateRouters({ projectRoot, packageRoot, targets, onConflict }) {
  const config = await readJson(path.join(projectRoot, 'ailib.config.json'));
  const registry = await readJson(path.join(packageRoot, 'registry.json'));
  const pointers = await resolvePointerPaths({ language: config.language, modules: config.modules });
  const pointerLines = pointers.map((p) => `- ${p}`).join('\n');

  for (const target of targets) {
    const targetDef = registry.targets[target];
    ensure(targetDef, `Unsupported target: ${target}`);

    const template = await fs.readFile(path.join(packageRoot, targetDef.template), 'utf8');
    const rendered = template
      .replaceAll('{{LANGUAGE}}', config.language)
      .replaceAll('{{MODULES}}', config.modules.join(', ') || 'none')
      .replaceAll('{{POINTERS}}', pointerLines);

    const outPath = path.join(projectRoot, targetDef.output);
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    if (await exists(outPath)) {
      if (onConflict === 'skip') continue;
      if (onConflict === 'abort') {
        throw new Error(`Conflict detected for ${targetDef.output}; rerun with --on-conflict=overwrite|merge|skip`);
      }
      if (onConflict === 'merge') {
        const existing = await fs.readFile(outPath, 'utf8');
        const withoutOld = existing.includes(AILIB_BLOCK_START)
          ? `${existing.slice(0, existing.indexOf(AILIB_BLOCK_START)).trimEnd()}\n`
          : `${existing.trimEnd()}\n`;
        const merged = `${withoutOld}\n${AILIB_BLOCK_START}\n${rendered.trim()}\n${AILIB_BLOCK_END}\n`;
        await fs.copyFile(outPath, `${outPath}.bak`);
        await fs.writeFile(outPath, merged, 'utf8');
        continue;
      }
      await fs.copyFile(outPath, `${outPath}.bak`);
    }

    await fs.writeFile(outPath, `${rendered.trim()}\n`, 'utf8');
  }
}

function validateModuleSelection({ registry, language, modules }) {
  const lang = registry.languages[language];
  ensure(lang, `Unsupported language: ${language}`);

  const slotMap = new Map();
  for (const moduleId of modules) {
    const moduleDef = lang.modules[moduleId];
    ensure(moduleDef, `Unsupported module for ${language}: ${moduleId}`);

    if (moduleDef.slot) {
      const existing = slotMap.get(moduleDef.slot);
      ensure(!existing, `Slot conflict '${moduleDef.slot}': ${existing} vs ${moduleId}`);
      slotMap.set(moduleDef.slot, moduleId);
    }
  }

  for (const moduleId of modules) {
    const conflicts = new Set(lang.modules[moduleId].conflicts_with || []);
    for (const other of modules) {
      if (other !== moduleId && conflicts.has(other)) {
        throw new Error(`Module conflict: ${moduleId} conflicts with ${other}`);
      }
    }
  }
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    }
    fields[key] = value;
  }
  return fields;
}

async function detectProjectRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (
      await exists(path.join(current, '.git')) ||
      await exists(path.join(current, 'package.json')) ||
      await exists(path.join(current, 'pyproject.toml'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not detect project root');
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function rmIfExists(filePath) {
  if (!(await exists(filePath))) return;
  await fs.rm(filePath, { recursive: true, force: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function splitCsv(value) {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items)];
}

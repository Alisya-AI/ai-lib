import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const requiredPackEntries = ['bin/ailib.js', 'src/cli.ts', 'registry.json'];

type CliArgs = {
  packageFile: string;
  versionsJsonFile?: string;
  packJsonFile?: string;
  reportFile: string;
};

type PackageMetadata = {
  name: string;
  version: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    packageFile: 'package.json',
    reportFile: 'dist/release/npm-preflight-report.json'
  };

  for (const arg of argv) {
    if (arg.startsWith('--package-file=')) {
      args.packageFile = arg.slice('--package-file='.length);
      continue;
    }
    if (arg.startsWith('--versions-json-file=')) {
      args.versionsJsonFile = arg.slice('--versions-json-file='.length);
      continue;
    }
    if (arg.startsWith('--pack-json-file=')) {
      args.packJsonFile = arg.slice('--pack-json-file='.length);
      continue;
    }
    if (arg.startsWith('--report-file=')) {
      args.reportFile = arg.slice('--report-file='.length);
      continue;
    }

    throw new Error(
      [
        `Unknown option: ${arg}`,
        'Usage: bun tools/npm-release-preflight.ts',
        '  [--package-file=package.json]',
        '  [--versions-json-file=<path>]',
        '  [--pack-json-file=<path>]',
        '  [--report-file=dist/release/npm-preflight-report.json]'
      ].join('\n')
    );
  }

  return args;
}

function resolveInputPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(root, inputPath);
}

async function readJsonFromFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(resolveInputPath(filePath), 'utf8');
  return JSON.parse(raw);
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim() || `exit ${String(code)}`}`));
    });
  });
}

function isNpmPackageNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('npm error code E404') ||
    error.message.includes('npm ERR! code E404') ||
    error.message.includes('404 Not Found')
  );
}

function parsePackageMetadata(data: unknown): PackageMetadata {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid package.json: expected object');
  }
  const pkg = data as Record<string, unknown>;
  if (typeof pkg.name !== 'string' || !pkg.name.trim()) {
    throw new Error('Invalid package.json: missing package name');
  }
  if (typeof pkg.version !== 'string' || !pkg.version.trim()) {
    throw new Error('Invalid package.json: missing package version');
  }
  return { name: pkg.name, version: pkg.version };
}

function parseVersions(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof data === 'string') {
    return [data];
  }
  throw new Error('Invalid npm versions payload: expected JSON string or array');
}

function parsePackFiles(data: unknown): { filename: string; filePaths: string[] } {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Invalid npm pack payload: expected non-empty JSON array');
  }

  const first = data[0];
  if (!first || typeof first !== 'object') {
    throw new Error('Invalid npm pack payload: first entry must be an object');
  }
  const pack = first as Record<string, unknown>;
  const filename = typeof pack.filename === 'string' ? pack.filename : 'unknown.tgz';
  const files = Array.isArray(pack.files) ? pack.files : [];
  const filePaths = files
    .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>).path : undefined))
    .filter((entry): entry is string => typeof entry === 'string');

  if (filePaths.length === 0) {
    throw new Error('Invalid npm pack payload: no files were reported');
  }

  return { filename, filePaths };
}

function assertRequiredPackEntries(filePaths: string[]) {
  for (const relPath of requiredPackEntries) {
    if (!filePaths.includes(relPath)) {
      throw new Error(`npm pack output is missing required file: ${relPath}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageData = await readJsonFromFile(args.packageFile);
  const pkg = parsePackageMetadata(packageData);

  let versionsPayload: unknown;
  if (args.versionsJsonFile) {
    versionsPayload = await readJsonFromFile(args.versionsJsonFile);
  } else {
    try {
      versionsPayload = JSON.parse(await runCommand('npm', ['view', pkg.name, 'versions', '--json']));
    } catch (error: unknown) {
      // First-time publish returns 404 because the package does not exist yet.
      if (isNpmPackageNotFoundError(error)) {
        versionsPayload = [];
      } else {
        throw error;
      }
    }
  }
  const publishedVersions = parseVersions(versionsPayload);

  if (publishedVersions.includes(pkg.version)) {
    throw new Error(`Version ${pkg.version} is already published for ${pkg.name}`);
  }

  const packPayload = args.packJsonFile
    ? await readJsonFromFile(args.packJsonFile)
    : JSON.parse(await runCommand('npm', ['pack', '--dry-run', '--json']));
  const packSummary = parsePackFiles(packPayload);
  assertRequiredPackEntries(packSummary.filePaths);

  const reportPath = resolveInputPath(args.reportFile);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        packageName: pkg.name,
        version: pkg.version,
        tarball: packSummary.filename,
        packedFileCount: packSummary.filePaths.length,
        requiredPackEntries,
        checks: {
          versionUnpublished: true,
          packContainsRequiredEntries: true
        },
        checkedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );

  process.stdout.write(`npm release preflight passed for ${pkg.name}@${pkg.version}\n`);
  process.stdout.write(`report: ${path.relative(root, reportPath)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

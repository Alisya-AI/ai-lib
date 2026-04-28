import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolvePublishedVersionWithRetry } from './npm-release-publish-retry.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

type CliArgs = {
  packageFile: string;
  publishedVersionJsonFile?: string;
  reportFile: string;
  dryRun: boolean;
};

type PackageMetadata = {
  name: string;
  version: string;
};

type PublishReport = {
  packageName: string;
  version: string;
  dryRun: boolean;
  checks: {
    npmAuthVerified: boolean;
    publishCommandExecuted: boolean;
    npmVersionResolved: boolean;
    publishedTarballReachable: boolean;
    installVerificationPassed: boolean;
  };
  checkedAt: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    packageFile: 'package.json',
    reportFile: 'dist/release/npm-publish-report.json',
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith('--package-file=')) {
      args.packageFile = arg.slice('--package-file='.length);
      continue;
    }
    if (arg.startsWith('--published-version-json-file=')) {
      args.publishedVersionJsonFile = arg.slice('--published-version-json-file='.length);
      continue;
    }
    if (arg.startsWith('--report-file=')) {
      args.reportFile = arg.slice('--report-file='.length);
      continue;
    }

    throw new Error(
      [
        `Unknown option: ${arg}`,
        'Usage: bun tools/npm-release-publish.ts [--dry-run]',
        '  [--package-file=package.json]',
        '  [--published-version-json-file=<path>]',
        '  [--report-file=dist/release/npm-publish-report.json]'
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

async function runCommand(command: string, args: string[], cwd = root): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim() || `exit ${String(code)}`}`));
    });
  });
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

function parseVersionPayload(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    const last = data[data.length - 1];
    if (typeof last === 'string') {
      return last;
    }
  }
  throw new Error('Invalid npm version payload: expected string or non-empty string array');
}

function parseTarballUrlPayload(data: unknown): string {
  if (typeof data !== 'string' || !/^https?:\/\/\S+/u.test(data)) {
    throw new Error('Invalid npm tarball payload: expected tarball URL string');
  }
  return data;
}

function isNpmPackageNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('npm error code E404') ||
    error.message.includes('npm ERR! code E404') ||
    error.message.includes('404 Not Found')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveRetryConfig(): {
  viewMaxAttempts: number;
  viewDelayMs: number;
  tarballMaxAttempts: number;
  tarballDelayMs: number;
} {
  const viewMaxAttemptsValue = Number.parseInt(process.env.AILIB_NPM_VIEW_MAX_ATTEMPTS ?? '10', 10);
  const viewDelayMsValue = Number.parseInt(process.env.AILIB_NPM_VIEW_DELAY_MS ?? '3000', 10);
  const tarballMaxAttemptsValue = Number.parseInt(process.env.AILIB_NPM_TARBALL_MAX_ATTEMPTS ?? '20', 10);
  const tarballDelayMsValue = Number.parseInt(process.env.AILIB_NPM_TARBALL_DELAY_MS ?? '3000', 10);
  return {
    viewMaxAttempts: Number.isFinite(viewMaxAttemptsValue) && viewMaxAttemptsValue > 0 ? viewMaxAttemptsValue : 10,
    viewDelayMs: Number.isFinite(viewDelayMsValue) && viewDelayMsValue >= 0 ? viewDelayMsValue : 3000,
    tarballMaxAttempts:
      Number.isFinite(tarballMaxAttemptsValue) && tarballMaxAttemptsValue > 0 ? tarballMaxAttemptsValue : 20,
    tarballDelayMs: Number.isFinite(tarballDelayMsValue) && tarballDelayMsValue >= 0 ? tarballDelayMsValue : 3000
  };
}

async function resolvePublishedVersionFromNpmWithRetry(packageName: string, expectedVersion: string): Promise<string> {
  const { viewMaxAttempts: maxAttempts, viewDelayMs: delayMs } = resolveRetryConfig();
  return await resolvePublishedVersionWithRetry({
    packageName,
    expectedVersion,
    maxAttempts,
    delayMs,
    fetchVersion: async () => {
      const payload = JSON.parse((await runCommand('npm', ['view', packageName, 'version', '--json'])).stdout);
      return parseVersionPayload(payload);
    },
    isRetryableError: isNpmPackageNotFoundError,
    sleep
  });
}

async function resolvePublishedTarballUrlWithRetry(packageName: string, expectedVersion: string): Promise<string> {
  const { tarballMaxAttempts: maxAttempts, tarballDelayMs: delayMs } = resolveRetryConfig();
  let lastFailure: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = JSON.parse(
        (await runCommand('npm', ['view', `${packageName}@${expectedVersion}`, 'dist.tarball', '--json'])).stdout
      );
      return parseTarballUrlPayload(payload);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      lastFailure = reason;
      if (attempt === maxAttempts) {
        break;
      }
      process.stdout.write(
        `npm view tarball retry ${attempt}/${String(maxAttempts)} for ${packageName}@${expectedVersion}; reason: ${reason}; waiting ${String(delayMs / 1000)}s...\n`
      );
      await sleep(delayMs);
    }
  }
  throw new Error(
    `Unable to resolve tarball URL for ${packageName}@${expectedVersion}; last failure: ${lastFailure ?? 'unknown'}`
  );
}

async function fetchUrlStatus(url: string): Promise<number> {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (head.status === 405 || head.status === 501) {
    const get = await fetch(url, { method: 'GET', redirect: 'follow' });
    return get.status;
  }
  return head.status;
}

async function assertPublishedTarballReachableWithRetry(
  tarballUrl: string,
  packageName: string,
  expectedVersion: string
) {
  const { tarballMaxAttempts: maxAttempts, tarballDelayMs: delayMs } = resolveRetryConfig();
  let lastStatusOrError = 'unknown';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const status = await fetchUrlStatus(tarballUrl);
      if (status >= 200 && status < 400) {
        return;
      }
      lastStatusOrError = `HTTP ${String(status)}`;
    } catch (error: unknown) {
      lastStatusOrError = error instanceof Error ? error.message : String(error);
    }
    if (attempt === maxAttempts) {
      break;
    }
    process.stdout.write(
      `tarball reachability retry ${attempt}/${String(maxAttempts)} for ${packageName}@${expectedVersion}; last result: ${lastStatusOrError}; waiting ${String(delayMs / 1000)}s...\n`
    );
    await sleep(delayMs);
  }
  throw new Error(
    `Published tarball not reachable for ${packageName}@${expectedVersion}: ${lastStatusOrError} (${tarballUrl})`
  );
}

async function verifyInstalledCli(pkg: PackageMetadata): Promise<void> {
  const installDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-npm-install-check-'));
  try {
    await runCommand('npm', ['init', '-y'], installDir);
    await runCommand('npm', ['install', `${pkg.name}@${pkg.version}`], installDir);
    const help = await runCommand('npx', ['--yes', 'ailib', '--help'], installDir);
    if (!/ailib commands:/u.test(help.stdout)) {
      throw new Error(`Installed CLI did not produce expected help output for ${pkg.name}@${pkg.version}`);
    }
  } finally {
    await fs.rm(installDir, { recursive: true, force: true });
  }
}

async function writeReport(reportPath: string, report: PublishReport): Promise<void> {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageData = await readJsonFromFile(args.packageFile);
  const pkg = parsePackageMetadata(packageData);
  const skipTarballVerification = process.env.AILIB_NPM_SKIP_TARBALL_VERIFY === '1';
  const skipInstallVerification = process.env.AILIB_NPM_SKIP_INSTALL_VERIFY === '1';

  const report: PublishReport = {
    packageName: pkg.name,
    version: pkg.version,
    dryRun: args.dryRun,
    checks: {
      npmAuthVerified: false,
      publishCommandExecuted: false,
      npmVersionResolved: false,
      publishedTarballReachable: false,
      installVerificationPassed: false
    },
    checkedAt: new Date().toISOString()
  };

  if (!args.dryRun) {
    await runCommand('npm', ['whoami']);
    report.checks.npmAuthVerified = true;

    await runCommand('npm', ['publish', '--access', 'public']);
    report.checks.publishCommandExecuted = true;
  }

  const publishedVersion = args.publishedVersionJsonFile
    ? parseVersionPayload(await readJsonFromFile(args.publishedVersionJsonFile))
    : await resolvePublishedVersionFromNpmWithRetry(pkg.name, pkg.version);
  if (publishedVersion !== pkg.version) {
    throw new Error(
      `Published version mismatch for ${pkg.name}: expected ${pkg.version}, received ${publishedVersion}`
    );
  }
  report.checks.npmVersionResolved = true;

  if (!args.dryRun) {
    if (!skipTarballVerification) {
      const tarballUrl = await resolvePublishedTarballUrlWithRetry(pkg.name, pkg.version);
      await assertPublishedTarballReachableWithRetry(tarballUrl, pkg.name, pkg.version);
    }
    report.checks.publishedTarballReachable = true;

    if (!skipInstallVerification) {
      await verifyInstalledCli(pkg);
    }
    report.checks.installVerificationPassed = true;
  }

  const reportPath = resolveInputPath(args.reportFile);
  await writeReport(reportPath, report);

  process.stdout.write(`npm publish verification passed for ${pkg.name}@${pkg.version}\n`);
  process.stdout.write(`report: ${path.relative(root, reportPath)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

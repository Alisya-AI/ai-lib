import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

type CliArgs = {
  packageFile: string;
  preflightReportFile: string;
  publishReportFile: string;
  outputFile: string;
  releaseNotesUrl: string;
};

type PackageMetadata = {
  name: string;
  version: string;
};

type PreflightReport = {
  packageName: string;
  version: string;
  tarball: string;
  checkedAt?: string;
};

type PublishReport = {
  packageName: string;
  version: string;
  checkedAt?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    packageFile: 'package.json',
    preflightReportFile: 'dist/release/npm-preflight-report.json',
    publishReportFile: 'dist/release/npm-publish-report.json',
    outputFile: 'dist/release/npm-release-record.md',
    releaseNotesUrl: ''
  };

  for (const arg of argv) {
    if (arg.startsWith('--package-file=')) {
      args.packageFile = arg.slice('--package-file='.length);
      continue;
    }
    if (arg.startsWith('--preflight-report-file=')) {
      args.preflightReportFile = arg.slice('--preflight-report-file='.length);
      continue;
    }
    if (arg.startsWith('--publish-report-file=')) {
      args.publishReportFile = arg.slice('--publish-report-file='.length);
      continue;
    }
    if (arg.startsWith('--output-file=')) {
      args.outputFile = arg.slice('--output-file='.length);
      continue;
    }
    if (arg.startsWith('--release-notes-url=')) {
      args.releaseNotesUrl = arg.slice('--release-notes-url='.length);
      continue;
    }

    throw new Error(
      [
        `Unknown option: ${arg}`,
        'Usage: bun tools/generate-npm-release-record.ts',
        '  --release-notes-url=<url>',
        '  [--package-file=package.json]',
        '  [--preflight-report-file=dist/release/npm-preflight-report.json]',
        '  [--publish-report-file=dist/release/npm-publish-report.json]',
        '  [--output-file=dist/release/npm-release-record.md]'
      ].join('\n')
    );
  }

  if (!args.releaseNotesUrl.trim()) {
    throw new Error('Missing required option: --release-notes-url=<url>');
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

function parsePreflightReport(data: unknown): PreflightReport {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid npm preflight report: expected object');
  }
  const report = data as Record<string, unknown>;
  if (
    typeof report.packageName !== 'string' ||
    typeof report.version !== 'string' ||
    typeof report.tarball !== 'string'
  ) {
    throw new Error('Invalid npm preflight report: missing packageName/version/tarball');
  }
  return {
    packageName: report.packageName,
    version: report.version,
    tarball: report.tarball,
    checkedAt: typeof report.checkedAt === 'string' ? report.checkedAt : undefined
  };
}

function parsePublishReport(data: unknown): PublishReport {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid npm publish report: expected object');
  }
  const report = data as Record<string, unknown>;
  if (typeof report.packageName !== 'string' || typeof report.version !== 'string') {
    throw new Error('Invalid npm publish report: missing packageName/version');
  }
  return {
    packageName: report.packageName,
    version: report.version,
    checkedAt: typeof report.checkedAt === 'string' ? report.checkedAt : undefined
  };
}

function ensureSamePackageAndVersion(pkg: PackageMetadata, preflight: PreflightReport, publish: PublishReport) {
  if (pkg.name !== preflight.packageName || pkg.name !== publish.packageName) {
    throw new Error('Release reports reference a different package than package.json');
  }
  if (pkg.version !== preflight.version || pkg.version !== publish.version) {
    throw new Error('Release reports reference a different version than package.json');
  }
}

function buildRecordMarkdown({
  pkg,
  preflight,
  publish,
  releaseNotesUrl,
  generatedAt
}: {
  pkg: PackageMetadata;
  preflight: PreflightReport;
  publish: PublishReport;
  releaseNotesUrl: string;
  generatedAt: string;
}) {
  const npmPackageUrl = `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
  return [
    `# npm release record: ${pkg.name}@${pkg.version}`,
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Published package',
    '',
    `- Package: \`${pkg.name}\``,
    `- Version: \`${pkg.version}\``,
    `- npm package URL: ${npmPackageUrl}`,
    '',
    '## Verification evidence',
    '',
    `- Preflight report: \`dist/release/npm-preflight-report.json\``,
    `- Publish report: \`dist/release/npm-publish-report.json\``,
    `- Packed tarball: \`${preflight.tarball}\``,
    `- Preflight checked at: \`${preflight.checkedAt || 'n/a'}\``,
    `- Publish checked at: \`${publish.checkedAt || 'n/a'}\``,
    '',
    '## Release notes',
    '',
    `- ${releaseNotesUrl}`,
    '',
    '## Verification commands run',
    '',
    '- `bun run release:npm:preflight`',
    '- `bun run release:npm:publish`',
    '- `npm view @ailib/cli version --json`',
    '- `npx --yes ailib --help`',
    ''
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageData = await readJsonFromFile(args.packageFile);
  const preflightData = await readJsonFromFile(args.preflightReportFile);
  const publishData = await readJsonFromFile(args.publishReportFile);

  const pkg = parsePackageMetadata(packageData);
  const preflight = parsePreflightReport(preflightData);
  const publish = parsePublishReport(publishData);

  ensureSamePackageAndVersion(pkg, preflight, publish);

  const outputPath = resolveInputPath(args.outputFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const markdown = buildRecordMarkdown({
    pkg,
    preflight,
    publish,
    releaseNotesUrl: args.releaseNotesUrl,
    generatedAt: new Date().toISOString()
  });
  await fs.writeFile(outputPath, markdown, 'utf8');

  process.stdout.write(`npm release record written: ${path.relative(root, outputPath)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

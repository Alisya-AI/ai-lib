import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const idx = process.argv.findIndex((arg) => arg === `--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];

  return fallback;
}

async function run(): Promise<void> {
  const minLinesRaw = readArg('min-lines', '80');
  const lcovFile = readArg('file', path.join('coverage', 'lcov.info'));

  const minLines = Number(minLinesRaw);
  if (!Number.isFinite(minLines) || minLines < 0 || minLines > 100) {
    throw new Error(`Invalid --min-lines value '${minLinesRaw}'. Expected number between 0 and 100.`);
  }

  const filePath = path.isAbsolute(lcovFile) ? lcovFile : path.join(packageRoot, lcovFile);
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/u);

  let totalLines = 0;
  let coveredLines = 0;

  for (const line of lines) {
    if (!line.startsWith('DA:')) continue;
    const payload = line.slice(3).split(',');
    if (payload.length !== 2) continue;
    const hits = Number(payload[1]);
    if (!Number.isFinite(hits)) continue;
    totalLines += 1;
    if (hits > 0) coveredLines += 1;
  }

  if (totalLines === 0) {
    throw new Error(`No line coverage entries found in '${lcovFile}'.`);
  }

  const lineCoverage = (coveredLines / totalLines) * 100;
  const rounded = Math.round(lineCoverage * 100) / 100;

  if (lineCoverage < minLines) {
    throw new Error(
      `Line coverage ${rounded}% is below threshold ${minLines}% (${coveredLines}/${totalLines}).`
    );
  }

  console.log(
    `Coverage threshold check passed: ${rounded}% >= ${minLines}% (${coveredLines}/${totalLines})`
  );
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

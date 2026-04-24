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
  const minFunctionsRaw = readArg('min-functions', '80');
  const minBranchesRaw = readArg('min-branches', '70');
  const lcovFile = readArg('file', path.join('coverage', 'lcov.info'));

  const minLines = Number(minLinesRaw);
  if (!Number.isFinite(minLines) || minLines < 0 || minLines > 100) {
    throw new Error(`Invalid --min-lines value '${minLinesRaw}'. Expected number between 0 and 100.`);
  }
  const minFunctions = Number(minFunctionsRaw);
  if (!Number.isFinite(minFunctions) || minFunctions < 0 || minFunctions > 100) {
    throw new Error(`Invalid --min-functions value '${minFunctionsRaw}'. Expected number between 0 and 100.`);
  }
  const minBranches = Number(minBranchesRaw);
  if (!Number.isFinite(minBranches) || minBranches < 0 || minBranches > 100) {
    throw new Error(`Invalid --min-branches value '${minBranchesRaw}'. Expected number between 0 and 100.`);
  }

  const filePath = path.isAbsolute(lcovFile) ? lcovFile : path.join(packageRoot, lcovFile);
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/u);

  let totalLines = 0;
  let coveredLines = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;
  let totalBranches = 0;
  let coveredBranches = 0;

  for (const line of lines) {
    if (line.startsWith('DA:')) {
      const payload = line.slice(3).split(',');
      if (payload.length !== 2) continue;
      const hits = Number(payload[1]);
      if (!Number.isFinite(hits)) continue;
      totalLines += 1;
      if (hits > 0) coveredLines += 1;
      continue;
    }
    if (line.startsWith('FNF:')) {
      const count = Number(line.slice(4));
      if (!Number.isFinite(count)) continue;
      totalFunctions += count;
      continue;
    }
    if (line.startsWith('FNH:')) {
      const count = Number(line.slice(4));
      if (!Number.isFinite(count)) continue;
      coveredFunctions += count;
      continue;
    }
    if (line.startsWith('BRF:')) {
      const count = Number(line.slice(4));
      if (!Number.isFinite(count)) continue;
      totalBranches += count;
      continue;
    }
    if (line.startsWith('BRH:')) {
      const count = Number(line.slice(4));
      if (!Number.isFinite(count)) continue;
      coveredBranches += count;
    }
  }

  if (totalLines === 0) {
    throw new Error(`No line coverage entries found in '${lcovFile}'.`);
  }
  if (totalFunctions === 0) {
    throw new Error(`No function coverage entries found in '${lcovFile}'.`);
  }
  const lineCoverage = (coveredLines / totalLines) * 100;
  const functionCoverage = (coveredFunctions / totalFunctions) * 100;
  const hasBranchData = totalBranches > 0;
  const branchCoverage = hasBranchData ? (coveredBranches / totalBranches) * 100 : lineCoverage;
  const roundedLines = Math.round(lineCoverage * 100) / 100;
  const roundedFunctions = Math.round(functionCoverage * 100) / 100;
  const roundedBranches = Math.round(branchCoverage * 100) / 100;

  if (lineCoverage < minLines) {
    throw new Error(`Line coverage ${roundedLines}% is below threshold ${minLines}% (${coveredLines}/${totalLines}).`);
  }
  if (functionCoverage < minFunctions) {
    throw new Error(
      `Function coverage ${roundedFunctions}% is below threshold ${minFunctions}% (${coveredFunctions}/${totalFunctions}).`
    );
  }
  if (branchCoverage < minBranches) {
    throw new Error(
      `Branch coverage ${roundedBranches}% is below threshold ${minBranches}% (${coveredBranches}/${totalBranches}).`
    );
  }
  const branchSource = hasBranchData ? `${coveredBranches}/${totalBranches}` : 'line coverage proxy (no BRF/BRH data)';

  console.log(
    `Coverage threshold check passed: lines ${roundedLines}% >= ${minLines}% (${coveredLines}/${totalLines}), functions ${roundedFunctions}% >= ${minFunctions}% (${coveredFunctions}/${totalFunctions}), branches ${roundedBranches}% >= ${minBranches}% (${branchSource})`
  );
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export type ResolvePublishedVersionWithRetryOptions = {
  packageName: string;
  expectedVersion: string;
  maxAttempts: number;
  delayMs: number;
  fetchVersion: () => Promise<string>;
  isRetryableError: (error: unknown) => boolean;
  sleep: (ms: number) => Promise<void>;
  writeLog?: (line: string) => void;
};

export async function resolvePublishedVersionWithRetry({
  packageName,
  expectedVersion,
  maxAttempts,
  delayMs,
  fetchVersion,
  isRetryableError,
  sleep,
  writeLog = (line: string) => process.stdout.write(line)
}: ResolvePublishedVersionWithRetryOptions): Promise<string> {
  let lastResolvedVersion: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resolvedVersion = await fetchVersion();
      lastResolvedVersion = resolvedVersion;
      if (resolvedVersion === expectedVersion) {
        return resolvedVersion;
      }
      if (attempt === maxAttempts) {
        break;
      }
      writeLog(
        `npm view retry ${attempt}/${String(maxAttempts)} for ${packageName}; expected ${expectedVersion}, received ${resolvedVersion}; waiting ${String(delayMs / 1000)}s...\n`
      );
      await sleep(delayMs);
    } catch (error: unknown) {
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      writeLog(
        `npm view retry ${attempt}/${String(maxAttempts)} for ${packageName} after registry 404; waiting ${String(delayMs / 1000)}s...\n`
      );
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Unable to resolve published version for ${packageName}; expected ${expectedVersion}, last received ${lastResolvedVersion ?? 'unknown'}`
  );
}

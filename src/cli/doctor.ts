import path from 'node:path';
import { workspaceLabelFor } from './context-resolution.ts';
import { auditWorkspaceRequiredFiles } from './doctor-audit.ts';
import { runDoctorPreflight } from './doctor-preflight.ts';
import { formatDoctorErrors, formatDoctorOk, formatDoctorWarnings } from './doctor-reporting.ts';
import { diffSlots } from './module-selection.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { buildWorkspaceState } from './workspace-state.ts';
import type { CliFlags, Registry, WorkspaceState } from './types.ts';

export async function doctorCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  localOverrideFile,
  canonicalSlot
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
}) {
  const preflight = await runDoctorPreflight({
    cwd,
    packageRoot,
    flags,
    configFile,
    localOverrideFile,
    canonicalSlot
  });
  if (preflight.ok === false) {
    process.stdout.write(formatDoctorErrors([preflight.localOverrideError]));
    process.exitCode = 1;
    return;
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const { context, registry, rootConfig, workspaceDirs, rootEffective } = preflight;
  const canonicalSlotForRegistry = bindRegistryCanonicalSlot(registry, canonicalSlot);
  for (const workspaceDir of workspaceDirs) {
    const workspaceLabel = workspaceLabelFor(context.rootDir, workspaceDir);

    let state: WorkspaceState;
    try {
      state = await buildWorkspaceState({
        workspaceDir,
        rootDir: context.rootDir,
        rootConfig,
        registry,
        canonicalSlot: canonicalSlotForRegistry,
        configFile,
        localOverrideFile
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`[${workspaceLabel}] ${message}`);
      continue;
    }
    errors.push(
      ...(await auditWorkspaceRequiredFiles({
        workspaceDir,
        workspaceLabel,
        requiredFiles: state.requiredFiles
      }))
    );

    if (path.resolve(workspaceDir) !== path.resolve(context.rootDir)) {
      const slotDiffs = diffSlots({
        rootModules: rootEffective.modules,
        workspaceModules: state.effective.modules,
        registry,
        language: state.effective.language,
        canonicalSlot: canonicalSlotForRegistry
      });
      for (const msg of slotDiffs) warnings.push(`[${workspaceLabel}] ${msg}`);
    }
  }

  const warningOutput = formatDoctorWarnings(warnings);
  if (warningOutput) process.stdout.write(warningOutput);

  if (errors.length) {
    process.stdout.write(formatDoctorErrors(errors));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(formatDoctorOk());
}

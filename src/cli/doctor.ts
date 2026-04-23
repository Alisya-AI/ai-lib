import path from 'node:path';
import { workspaceLabelFor } from './context-resolution.ts';
import { auditWorkspaceRequiredFiles } from './doctor-audit.ts';
import { runDoctorPreflight } from './doctor-preflight.ts';
import { formatDoctorErrors, formatDoctorOk, formatDoctorWarnings } from './doctor-reporting.ts';
import { diffSlots } from './module-selection.ts';
import { bindRegistryCanonicalSlot } from './slot-resolver.ts';
import { buildWorkspaceState } from './workspace-state.ts';
import type { CliFlags, Registry, WorkspaceState } from './types.ts';

export interface DoctorCommandIo {
  write: (line: string) => void;
  setExitCode: (code: number) => void;
}

export interface DoctorEvaluation {
  ok: boolean;
  warningOutput: string;
  errorOutput: string;
}

export async function doctorCommand({
  cwd,
  packageRoot,
  flags,
  configFile,
  localOverrideFile,
  canonicalSlot,
  io
}: {
  cwd: string;
  packageRoot: string;
  flags: CliFlags;
  configFile: string;
  localOverrideFile: string;
  canonicalSlot: (registry: Registry, slot: string | undefined) => string | null;
  io?: DoctorCommandIo;
}) {
  const output = io || {
    write: (line: string) => process.stdout.write(line),
    setExitCode: (code: number) => {
      process.exitCode = code;
    }
  };
  const evaluation = await evaluateDoctor({
    cwd,
    packageRoot,
    flags,
    configFile,
    localOverrideFile,
    canonicalSlot
  });
  if (evaluation.warningOutput) output.write(evaluation.warningOutput);
  if (evaluation.errorOutput) {
    output.write(evaluation.errorOutput);
    output.setExitCode(1);
    return;
  }
  output.write(formatDoctorOk());
}

export async function evaluateDoctor({
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
}): Promise<DoctorEvaluation> {
  const preflight = await runDoctorPreflight({
    cwd,
    packageRoot,
    flags,
    configFile,
    localOverrideFile,
    canonicalSlot
  });
  if (preflight.ok === false) {
    return {
      ok: false,
      warningOutput: '',
      errorOutput: formatDoctorErrors([preflight.localOverrideError])
    };
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
  if (errors.length) {
    return {
      ok: false,
      warningOutput,
      errorOutput: formatDoctorErrors(errors)
    };
  }

  return {
    ok: true,
    warningOutput,
    errorOutput: ''
  };
}

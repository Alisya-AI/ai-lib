import type { CommandContext, Registry } from './types.ts';
import { doctorCommand as runDoctorCommand } from './doctor.ts';
import { initCommand as runInitCommand } from './init.ts';
import { modulesCommand as runModulesCommand, slotsCommand as runSlotsCommand } from './introspection.ts';
import {
  addCommand as runAddCommand,
  removeCommand as runRemoveCommand,
  updateCommand as runUpdateCommand
} from './module-mutations.ts';
import { skillsCommand as runSkillsCommand } from './skills.ts';
import { uninstallCommand as runUninstallCommand } from './uninstall.ts';

export type CanonicalSlotResolver = (registry: Registry, slot: string | undefined) => string | null;
export type WorkspaceUpdateRunner = (args: {
  packageRoot: string;
  rootDir: string;
  workspaceOverride?: string;
  forceOnConflict?: string;
}) => Promise<void>;

type Runners = {
  initCommand: typeof runInitCommand;
  updateCommand: typeof runUpdateCommand;
  addCommand: typeof runAddCommand;
  removeCommand: typeof runRemoveCommand;
  doctorCommand: typeof runDoctorCommand;
  uninstallCommand: typeof runUninstallCommand;
  slotsCommand: typeof runSlotsCommand;
  modulesCommand: typeof runModulesCommand;
  skillsCommand: typeof runSkillsCommand;
};

const DEFAULT_RUNNERS: Runners = {
  initCommand: runInitCommand,
  updateCommand: runUpdateCommand,
  addCommand: runAddCommand,
  removeCommand: runRemoveCommand,
  doctorCommand: runDoctorCommand,
  uninstallCommand: runUninstallCommand,
  slotsCommand: runSlotsCommand,
  modulesCommand: runModulesCommand,
  skillsCommand: runSkillsCommand
};

export function createCommandHandlers({
  configFile,
  localOverrideFile,
  lockFile,
  resolveCanonicalSlot,
  applyWorkspaceUpdate,
  runners = DEFAULT_RUNNERS
}: {
  configFile: string;
  localOverrideFile: string;
  lockFile: string;
  resolveCanonicalSlot: CanonicalSlotResolver;
  applyWorkspaceUpdate: WorkspaceUpdateRunner;
  runners?: Runners;
}) {
  return {
    init: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.initCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        canonicalSlot: resolveCanonicalSlot,
        applyWorkspaceUpdate
      }),
    update: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.updateCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        localOverrideFile,
        canonicalSlot: resolveCanonicalSlot,
        applyWorkspaceUpdate
      }),
    add: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.addCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        localOverrideFile,
        canonicalSlot: resolveCanonicalSlot,
        applyWorkspaceUpdate
      }),
    remove: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.removeCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        applyWorkspaceUpdate
      }),
    doctor: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.doctorCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        localOverrideFile,
        canonicalSlot: resolveCanonicalSlot
      }),
    uninstall: async ({ cwd, packageRoot, flags }: CommandContext) =>
      runners.uninstallCommand({
        cwd,
        packageRoot,
        flags,
        configFile,
        lockFile,
        applyWorkspaceUpdate: async ({ packageRoot: rootPackage, rootDir, forceOnConflict }) =>
          applyWorkspaceUpdate({ packageRoot: rootPackage, rootDir, forceOnConflict })
      }),
    slots: async ({ packageRoot, flags }: CommandContext) => runners.slotsCommand({ packageRoot, flags }),
    modules: async ({ packageRoot, flags }: CommandContext) => runners.modulesCommand({ packageRoot, flags }),
    skills: async ({ cwd, flags }: CommandContext) => runners.skillsCommand({ cwd, flags })
  };
}

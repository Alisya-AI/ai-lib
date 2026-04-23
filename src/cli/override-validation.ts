import type { Registry } from './types.ts';

export function validateWorkspaceOverride({
  override,
  label,
  registry,
  canonicalSlot
}: {
  override: unknown;
  label: string;
  registry: Registry;
  canonicalSlot: (slot: string | undefined) => string | null;
}): string[] {
  const errors: string[] = [];
  if (!isRecord(override)) {
    return [`'${label}' must be an object`];
  }

  const allowed = new Set(['targets', 'modules', 'slots']);
  for (const key of Object.keys(override)) {
    if (!allowed.has(key)) {
      errors.push(`'${label}' has unsupported key '${key}'`);
    }
  }

  if (override.targets !== undefined) {
    errors.push(
      ...validateListOverrideScope({
        scope: override.targets,
        label: `${label}.targets`,
        validSet: new Set(Object.keys(registry.targets || {})),
        valueLabel: 'target'
      })
    );
  }

  if (override.modules !== undefined) {
    errors.push(
      ...validateListOverrideScope({
        scope: override.modules,
        label: `${label}.modules`,
        valueLabel: 'module'
      })
    );
  }

  if (override.slots !== undefined) {
    if (!isRecord(override.slots)) {
      errors.push(`'${label}.slots' must be an object`);
    } else {
      const knownSlots = new Set(registry.slots || []);
      for (const [slotKey, rule] of Object.entries(override.slots)) {
        const slot = canonicalSlot(slotKey);
        if (!slot || !knownSlots.has(slot)) {
          errors.push(`'${label}.slots.${slotKey}' references unknown slot`);
        }
        if (!isRecord(rule)) {
          errors.push(`'${label}.slots.${slotKey}' must be an object`);
          continue;
        }
        for (const key of Object.keys(rule)) {
          if (key !== 'set' && key !== 'remove') {
            errors.push(`'${label}.slots.${slotKey}' has unsupported key '${key}'`);
          }
        }
        if (rule.set !== undefined && typeof rule.set !== 'string') {
          errors.push(`'${label}.slots.${slotKey}.set' must be a string`);
        }
        if (rule.remove !== undefined && typeof rule.remove !== 'boolean') {
          errors.push(`'${label}.slots.${slotKey}.remove' must be a boolean`);
        }
      }
    }
  }

  return errors;
}

export function validateListOverrideScope({
  scope,
  label,
  validSet,
  valueLabel
}: {
  scope: unknown;
  label: string;
  validSet?: Set<string>;
  valueLabel: string;
}): string[] {
  const errors: string[] = [];
  if (!isRecord(scope)) {
    return [`'${label}' must be an object`];
  }

  const allowed = new Set(['set', 'add', 'remove']);
  for (const key of Object.keys(scope)) {
    if (!allowed.has(key)) {
      errors.push(`'${label}' has unsupported key '${key}'`);
    }
  }

  const validateList = (value: unknown, key: string) => {
    if (!Array.isArray(value)) {
      errors.push(`'${label}.${key}' must be an array`);
      return;
    }
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`'${label}.${key}' must contain non-empty strings`);
        continue;
      }
      if (validSet && !validSet.has(item)) {
        errors.push(`'${label}.${key}' contains unknown ${valueLabel} '${item}'`);
      }
    }
  };

  if (scope.set !== undefined) validateList(scope.set, 'set');
  if (scope.add !== undefined) validateList(scope.add, 'add');
  if (scope.remove !== undefined) validateList(scope.remove, 'remove');
  return errors;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

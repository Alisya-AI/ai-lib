export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

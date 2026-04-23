export function formatDoctorWarnings(warnings: string[]) {
  if (!warnings.length) return '';
  return `doctor warnings:\n- ${warnings.join('\n- ')}\n`;
}

export function formatDoctorErrors(errors: string[]) {
  return `doctor failed:\n- ${errors.join('\n- ')}\n`;
}

export function formatDoctorOk() {
  return 'doctor ok\n';
}

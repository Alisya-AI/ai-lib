import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDoctorErrors, formatDoctorOk, formatDoctorWarnings } from './doctor-reporting.ts';

test('doctor reporting formatters build expected output', () => {
  assert.equal(formatDoctorWarnings([]), '');
  assert.equal(formatDoctorWarnings(['a', 'b']), 'doctor warnings:\n- a\n- b\n');
  assert.equal(formatDoctorErrors(['x']), 'doctor failed:\n- x\n');
  assert.equal(formatDoctorOk(), 'doctor ok\n');
});

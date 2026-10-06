import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGates, parseProfiles, validatePass } from '../skills/cheffy/scripts/lib/pass.mjs';

const markdown = fs.readFileSync(new URL('../skills/cheffy/pass.md', import.meta.url), 'utf8');

test('pass.md defines the 12 gates with their check rules', () => {
  const gates = parseGates(markdown);
  assert.deepEqual(Object.keys(gates).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(Object.entries(gates).filter(([, g]) => g.checkRequired).map(([n]) => Number(n)), [1, 2, 3, 9, 11]);
  assert.deepEqual(Object.entries(gates).filter(([, g]) => g.naAllowed).map(([n]) => Number(n)), [6, 7, 9, 12]);
});

test('pass.md defines the six profiles', () => {
  assert.deepEqual(parseProfiles(markdown), {
    code: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    light: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    quick: [1, 3, 5, 9, 10, 11],
    'read-only': [1, 9, 10],
    prototype: [1, 9, 10],
    ops: [1, 9, 10],
  });
});

test('a code pass accepts "Critic not required" on gate 7 when no Critic ran', () => {
  const events = [
    { type: 'check', check_id: 'c-ok', exit_code: 0, version_ok: null, waiver: null, security_check: null },
    ...['secrets', 'dependencies', 'sast'].map((name) => ({ type: 'check', check_id: `c-${name}`, exit_code: 0, version_ok: true, waiver: null, security_check: name })),
    { type: 'delegation', delegation_id: 'd-v', role: 'verifier' },
    { type: 'delegation_close', delegation_id: 'd-v', verdict: 'PASS' },
  ];
  const results = Object.fromEntries([1, 2, 3, 4, 5, 6, 8, 9, 10, 12].map((n) => [n, { result: 'PASS', evidence: 'c-ok' }]));
  results[11] = { result: 'PASS', evidence: 'c-secrets,c-dependencies,c-sast' };
  for (const result of ['NA', 'PASS']) {
    results[7] = { result, evidence: 'Critic not required: 34 changed lines, no trust boundary, no public interface' };
    assert.deepEqual(validatePass({
      events, gates: parseGates(markdown), profileGates: parseProfiles(markdown).code, results, profile: 'code', verdict: 'PASS', verifierId: 'd-v', today: '2026-10-04',
    }), [], result);
  }
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCases } from '../skills/sharpener/scripts/cases.mjs';
import { cleanupTempRepos, tempDir } from './helpers.mjs';

after(cleanupTempRepos);

const CASES = fileURLToPath(new URL('../skills/sharpener/scripts/cases.mjs', import.meta.url));

const valid = () => ({
  skill_name: 'demo',
  evals: [{ id: 1, prompt: 'Draw a cat.', expected_output: 'A cat.', files: [], expectations: ['The drawing shows a cat.'] }],
});

function skillDir(data) {
  const dir = path.join(tempDir('hidkit-sharpener-'), 'demo');
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  const file = path.join(dir, 'evals', 'evals.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return { dir, file };
}

test('a valid file has no problems', () => {
  assert.deepEqual(checkCases(valid(), '/x/demo'), []);
});

test('flags a duplicate id, an empty prompt, and a wrong field name', () => {
  const data = valid();
  data.evals.push({ id: 1, prompt: ' ', expected_output: 'x', assertions: ['y'] });
  assert.deepEqual(checkCases(data, '/x/demo'), [
    'evals[1].id 1 is used more than once',
    'evals[1].prompt must be a non-empty string',
    'evals[1] uses "assertions"; the schema names this field "expectations"',
    'evals[1].expectations must be a non-empty list of non-empty strings',
  ]);
});

test('flags a skill name that does not match the directory and an unknown key', () => {
  const data = valid();
  data.skill_name = 'other';
  data.evals[0].notes = 'x';
  assert.deepEqual(checkCases(data, '/x/demo'), [
    'skill_name "other" must match the skill directory "demo"',
    'evals[0].notes is not in the schema',
  ]);
});

test('flags a missing file and a file outside the skill directory', () => {
  const data = valid();
  data.evals[0].files = ['evals/files/none.txt', '../secret.txt'];
  const { dir } = skillDir(data);
  assert.deepEqual(checkCases(data, dir), [
    'evals[0].files: evals/files/none.txt does not exist',
    'evals[0].files: ../secret.txt is outside the skill directory',
  ]);
});

test('the CLI exits 0 with a summary, 2 with problems, and 1 on bad input', () => {
  const ok = skillDir(valid());
  const run = (file) => spawnSync(process.execPath, [CASES, file], { encoding: 'utf8' });
  const good = run(ok.file);
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout), { skill: 'demo', cases: 1, nextId: 2 });
  const bad = valid();
  bad.evals = [];
  assert.equal(run(skillDir(bad).file).status, 2);
  fs.writeFileSync(ok.file, '{');
  assert.equal(run(ok.file).status, 1);
});

test('a file outside an evals directory takes its parent as the skill directory', () => {
  const dir = path.join(tempDir('hidkit-sharpener-'), 'demo');
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'files', 'session.txt'), 'x');
  const data = valid();
  data.evals[0].files = ['files/session.txt'];
  fs.writeFileSync(path.join(dir, 'evals.json'), JSON.stringify(data));
  const r = spawnSync(process.execPath, [CASES, path.join(dir, 'evals.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

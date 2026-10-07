import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupByDir, mapChange, termsFor } from '../skills/fill-me-in/scripts/map.mjs';
import { cleanupTempRepos, tempRepo } from './helpers.mjs';

after(cleanupTempRepos);

const MAP = fileURLToPath(new URL('../skills/fill-me-in/scripts/map.mjs', import.meta.url));

function write(root, file, text) {
  fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function commitAll(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('add', '-A');
  git('-c', 'user.email=test@example.com', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
}

// A small shop: checkout uses price, price uses money, a test covers price.
function shop() {
  const root = tempRepo();
  write(root, 'src/money.js', 'export const roundCents = (v) => Math.round(v * 100) / 100;\n');
  write(root, 'src/price.js', "import { roundCents } from './money.js';\nexport const applyDiscount = (t, p) => roundCents(t * (1 - p / 100));\n");
  write(root, 'app/checkout.js', "import { applyDiscount } from '../src/price.js';\n");
  commitAll(root);
  return root;
}

test('groupByDir merges the deepest directories until the limit holds', () => {
  const files = ['a/b/c/1.js', 'a/b/d/2.js', 'a/e/3.js', 'f/4.js', 'g/5.js'];
  const groups = groupByDir(files, 4);
  assert.ok(groups.size <= 4);
  assert.deepEqual([...groups.values()].flat().sort(), [...files].sort());
  assert.deepEqual(groups.get('a/b'), ['a/b/c/1.js', 'a/b/d/2.js']);
});

test('groupByDir never merges into the root and puts the rest into (other)', () => {
  const files = ['skills/a/x.md', 'test/y.mjs', 'agents/z.md', 'scripts/w.mjs', 'eval/v.md', 'README.md'];
  const groups = groupByDir(files, 4);
  assert.equal(groups.size, 4);
  assert.ok(!groups.has('.') || groups.get('.').length === 1);
  assert.equal(groups.get('(other)').length, 3);
  assert.deepEqual([...groups.values()].flat().sort(), [...files].sort());
});

test('groupByDir merges the siblings under one parent first', () => {
  const groups = groupByDir(['a/b/1', 'a/c/2', 'a/d/3', 'a/e/4', 'f/5'], 4);
  assert.deepEqual([...groups.keys()].sort(), ['a', 'f']);
});

test('termsFor uses the directory name for generic file names', () => {
  assert.deepEqual(termsFor('skills/fill-me-in/SKILL.md'), ['fill-me-in']);
  assert.deepEqual(termsFor('src/price.js'), ['price.js', '/price']);
});

test('mapChange reports states, parts, existing code, and edges', () => {
  const root = shop();
  write(root, 'src/price.js', "import { roundCents } from './money.js';\nexport const applyDiscount = (t, p) => { if (p > 100) throw new RangeError('x'); return roundCents(t * (1 - p / 100)); };\n");
  write(root, 'test/price.test.js', "import { applyDiscount } from '../src/price.js';\n");

  const map = mapChange({ root, files: ['src/price.js', 'test/price.test.js'] });

  assert.equal(map.touched, 2);
  const src = map.parts.find((p) => p.dir === 'src');
  assert.deepEqual(src.states, { modified: 1 });
  assert.deepEqual(src.paths, ['src/price.js']);
  assert.deepEqual(map.parts.find((p) => p.dir === 'test').states, { new: 1 });
  assert.deepEqual(map.existing, [{ id: 'existing:app', dir: 'app', files: 1 }]);
  const pairs = map.edges.map((e) => `${e.from}>${e.to}`).sort();
  assert.deepEqual(pairs, ['existing:app>part:src', 'part:test>part:src']);
  assert.deepEqual(map.edges.find((e) => e.from === 'existing:app').samples, ['app/checkout.js:1']);
});

test('mapChange counts committed work against the base and hides paths above 10 files', () => {
  const root = shop();
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const files = Array.from({ length: 11 }, (_, i) => `lib/gen/f${i}.js`);
  for (const file of files) write(root, file, 'export {};\n');
  commitAll(root);

  const atHead = mapChange({ root, files });
  assert.deepEqual(atHead.parts[0].states, { unchanged: 11 });

  const map = mapChange({ root, files, base });
  assert.deepEqual(map.parts, [{ id: 'part:lib/gen', dir: 'lib/gen', files: 11, states: { new: 11 } }]);
});

test('the CLI prints one JSON line and refuses an empty file list', () => {
  const root = shop();
  const ok = spawnSync(process.execPath, [MAP, 'src/price.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).parts[0].dir, 'src');

  const bad = spawnSync(process.execPath, [MAP], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage/);

  for (const args of [['--base', '--output=x', 'src/price.js'], ['--base', 'nope', 'src/price.js'], ['src/price.js', '--base']]) {
    const r = spawnSync(process.execPath, [MAP, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /--base/);
  }
  assert.ok(!fs.existsSync(path.join(root, 'x')));
});

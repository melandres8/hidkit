import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, renderHtml, validateBrief } from '../skills/fill-me-in/scripts/render.mjs';
import { cleanupTempRepos, tempDir, tempRepo } from './helpers.mjs';

after(cleanupTempRepos);

const RENDER = fileURLToPath(new URL('../skills/fill-me-in/scripts/render.mjs', import.meta.url));

// A map with 3 parts and 2 groups of existing code, in the shape that mapChange returns.
function sampleMap() {
  return {
    touched: 4,
    parts: [
      { id: 'part:src', dir: 'src', files: 2, states: { modified: 1, new: 1 }, paths: ['src/price.js', 'src/tax.js'] },
      { id: 'part:src/util', dir: 'src/util', files: 1, states: { new: 1 }, paths: ['src/util/round.js'] },
      { id: 'part:test', dir: 'test', files: 1, states: { new: 1 }, paths: ['test/price.test.js'] },
    ],
    existing: [
      { id: 'existing:app', dir: 'app', files: 1 },
      { id: 'existing:docs', dir: 'docs', files: 1 },
    ],
    edges: [
      { from: 'existing:app', to: 'part:src', refs: 3, samples: ['app/checkout.js:1'] },
      { from: 'part:test', to: 'part:src', refs: 2, samples: ['test/price.test.js:1'] },
      { from: 'part:src', to: 'part:src/util', refs: 1, samples: ['src/price.js:2'] },
      { from: 'existing:docs', to: 'part:src/util', refs: 1, samples: ['docs/a.md:4'] },
    ],
  };
}

function sampleBrief() {
  return {
    lang: 'en',
    idea: 'Discounts now refuse a percent above 100.',
    summary: ['Done. Tests pass.'],
    parts: [
      { id: 'pricing', label: 'Pricing', purpose: 'Compute prices.', reason: 'Bad discounts.', from: ['part:src', 'part:src/util'] },
      { id: 'tests', label: 'Tests', purpose: 'Cover pricing.', reason: 'No test before.', from: ['part:test'] },
    ],
    phases: [{ name: 'Build', moves: ['Added the guard.'] }],
  };
}

const copy = (value) => JSON.parse(JSON.stringify(value));

test('validateBrief accepts a valid brief', () => {
  assert.deepEqual(validateBrief(sampleBrief(), sampleMap()), []);
});

test('validateBrief reports every problem at once with the valid values', () => {
  const brief = copy(sampleBrief());
  delete brief.idea;
  brief.summary = ['a', 'b', 'c', 'd'];
  brief.parts[0].from = ['part:nope', 'part:src/util'];
  brief.parts[1].id = 'Bad Id';
  const problems = validateBrief(brief, sampleMap());
  const text = problems.join('\n');
  assert.match(text, /^idea: /m);
  assert.match(text, /^summary: found 4, the maximum is 3/m);
  assert.match(text, /^parts\[0\]\.from\[0\]: "part:nope" is not in the map\. Valid ids: part:src, part:src\/util, part:test/m);
  assert.match(text, /^parts\[1\]\.id: /m);
  assert.match(text, /map part "part:src" is in no part/);
  assert.ok(problems.length >= 5);
});

test('validateBrief limits parts and phases and refuses duplicate ids', () => {
  const brief = copy(sampleBrief());
  const extra = (i) => ({ id: `p${i}`, label: 'x', purpose: 'x', reason: 'x', from: [] });
  brief.parts.push(extra(1), extra(2), extra(3));
  brief.parts[4].id = 'tests';
  brief.phases = Array.from({ length: 5 }, () => ({ name: 'x', moves: ['y'] }));
  const text = validateBrief(brief, sampleMap()).join('\n');
  assert.match(text, /^parts: found 5, the maximum is 4\. Merge two parts with "from"\./m);
  assert.match(text, /^phases: found 5, the maximum is 4/m);
  assert.match(text, /duplicate id "tests"/);
});

test('validateBrief refuses a map part that is in two parts and an edge with an unknown end', () => {
  const brief = copy(sampleBrief());
  brief.parts[1].from.push('part:src');
  brief.edges = [{ from: 'pricing', to: 'ghost' }];
  const text = validateBrief(brief, sampleMap()).join('\n');
  assert.match(text, /"part:src" is in more than one part/);
  assert.match(text, /^edges\[0\]\.to: "ghost" is not a node/m);
});

test('validateBrief refuses more than 6 nodes when existing is explicit', () => {
  const map = sampleMap();
  map.existing = Array.from({ length: 5 }, (_, i) => ({ id: `existing:e${i}`, dir: `e${i}`, files: 1 }));
  const brief = copy(sampleBrief());
  brief.existing = map.existing.map((e, i) => ({ id: `e${i}`, label: `E${i}`, from: [e.id] }));
  assert.match(validateBrief(brief, map).join('\n'), /^nodes: found 7, the maximum is 6/m);
});

test('buildModel merges states and edges and drops self-edges', () => {
  const model = buildModel(sampleBrief(), sampleMap());
  const pricing = model.nodes.find((n) => n.id === 'pricing');
  assert.equal(pricing.state, 'modified');
  assert.deepEqual(pricing.counts, { modified: 1, new: 2 });
  assert.deepEqual(pricing.paths, ['src/price.js', 'src/tax.js', 'src/util/round.js']);
  assert.equal(model.nodes.find((n) => n.id === 'tests').state, 'new');
  assert.equal(model.nodes.find((n) => n.id === 'existing:app').state, 'existing');
  const pairs = model.edges.map((e) => `${e.from}>${e.to}:${e.refs}`).sort();
  assert.deepEqual(pairs, ['existing:app>pricing:3', 'existing:docs>pricing:1', 'tests>pricing:2']);
});

test('buildModel takes labels from brief edges and adds edges the map cannot see', () => {
  const brief = copy(sampleBrief());
  brief.existing = [{ id: 'callers', label: 'Callers', from: ['existing:app', 'existing:docs'] }];
  brief.edges = [{ from: 'tests', to: 'pricing', label: 'covers' }, { from: 'pricing', to: 'callers', label: 'uses' }];
  const model = buildModel(brief, sampleMap());
  assert.equal(model.nodes.find((n) => n.id === 'callers').label, 'Callers');
  assert.equal(model.edges.find((e) => e.from === 'tests').label, 'covers');
  assert.equal(model.edges.find((e) => e.from === 'callers').refs, 4);
  assert.ok(model.edges.some((e) => e.from === 'pricing' && e.to === 'callers' && e.label === 'uses'));
});

test('buildModel hides the existing groups with the fewest references above 6 nodes', () => {
  const map = sampleMap();
  map.existing = Array.from({ length: 6 }, (_, i) => ({ id: `existing:e${i}`, dir: `e${i}`, files: 1 }));
  map.edges = map.existing.map((e, i) => ({ from: e.id, to: 'part:src', refs: i + 1, samples: [] }));
  const model = buildModel(sampleBrief(), map);
  assert.equal(model.nodes.length, 6);
  assert.deepEqual(model.nodes.filter((n) => n.kind === 'existing').map((n) => n.id).sort(), ['existing:e2', 'existing:e3', 'existing:e4', 'existing:e5']);
  assert.equal(model.hidden, 2);
  assert.ok(model.edges.every((e) => model.nodes.some((n) => n.id === e.from)));
});

test('a part with only unchanged files is existing, and one with only deleted files is modified', () => {
  const map = sampleMap();
  map.parts[0].states = { unchanged: 2 };
  map.parts[1].states = { unchanged: 1 };
  map.parts[2].states = { deleted: 1 };
  const model = buildModel(sampleBrief(), map);
  assert.equal(model.nodes.find((n) => n.id === 'pricing').state, 'existing');
  assert.equal(model.nodes.find((n) => n.id === 'tests').state, 'modified');
});

test('renderHtml escapes every text and loads nothing from outside the page', () => {
  const brief = copy(sampleBrief());
  const payload = '</script><img src=x onerror=alert(1)>';
  brief.idea = payload;
  brief.parts[0].label = payload;
  brief.parts[0].reason = 'See http://example.com';
  const html = renderHtml(brief, sampleMap());
  assert.ok(!html.includes(payload));
  assert.ok(html.includes('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal((html.match(/<script/g) ?? []).length, 1);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"/);
  const targets = [];
  for (const [tag] of html.matchAll(/<[a-z][^>]*>/gi)) {
    for (const m of tag.matchAll(/\s(?:src|href)\s*=\s*["']?([^"'\s>]+)/gi)) targets.push(m[1]);
  }
  for (const m of html.matchAll(/url\(([^)]*)\)/g)) targets.push(m[1]);
  for (const target of targets) assert.match(target, /^#/, `external reference: ${target}`);
});

test('renderHtml is deterministic and shows a panel for each part', () => {
  const a = renderHtml(sampleBrief(), sampleMap());
  assert.equal(a, renderHtml(sampleBrief(), sampleMap()));
  assert.match(a, /<g[^>]*role="button"[^>]*data-panel="panel-pricing"/);
  assert.match(a, /<section[^>]*id="panel-pricing"[^>]*hidden/);
  assert.match(a, /app\/checkout\.js:1/);
});

test('renderHtml uses the labels of the brief language and falls back to English', () => {
  const es = copy(sampleBrief());
  es.lang = 'es';
  assert.match(renderHtml(es, sampleMap()), /<html lang="es">[\s\S]*Nuevo[\s\S]*Movimientos/);
  const xx = copy(sampleBrief());
  xx.lang = 'xx';
  assert.match(renderHtml(xx, sampleMap()), /<html lang="en">[\s\S]*New[\s\S]*Moves/);
});

test('renderHtml shows the note for hidden groups and leaves out empty open groups', () => {
  const map = sampleMap();
  map.existing = Array.from({ length: 6 }, (_, i) => ({ id: `existing:e${i}`, dir: `e${i}`, files: 1 }));
  map.edges = map.existing.map((e) => ({ from: e.id, to: 'part:src', refs: 1, samples: [] }));
  const brief = copy(sampleBrief());
  brief.open = { pending: [], unverified: ['Not run on Windows.'] };
  const html = renderHtml(brief, map);
  assert.match(html, /2 more groups of existing code are not shown/);
  assert.match(html, /Not verified/);
  assert.ok(!html.includes('>Pending<'));
});

test('an arc leaves a lower box by its bottom, so it does not cross the box above', () => {
  const map = {
    touched: 2,
    parts: [{ id: 'part:a', dir: 'a', files: 1, states: { new: 1 } }, { id: 'part:b', dir: 'b', files: 1, states: { modified: 1 } }],
    existing: [{ id: 'existing:e1', dir: 'e1', files: 1 }, { id: 'existing:e2', dir: 'e2', files: 1 }],
    edges: [
      { from: 'existing:e1', to: 'part:a', refs: 1, samples: [] },
      { from: 'part:a', to: 'part:b', refs: 1, samples: [] },
      { from: 'existing:e2', to: 'part:b', refs: 1, samples: [] },
    ],
  };
  const brief = { ...sampleBrief(), parts: [
    { id: 'a', label: 'A', purpose: 'x', reason: 'x', from: ['part:a'] },
    { id: 'b', label: 'B', purpose: 'x', reason: 'x', from: ['part:b'] },
  ] };
  const html = renderHtml(brief, map);
  const box = html.match(/<title>e2 \([^)]*\)<\/title><rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/);
  const arc = html.match(/<title>e2 → B[^<]*<\/title><path d="M[\d.]+ ([\d.]+) /);
  assert.ok(box && arc);
  assert.equal(Number(arc[1]), Number(box[1]) + Number(box[2]));
});

// A small repo where checkout uses price.
function shop() {
  const root = tempRepo();
  const write = (file, text) => {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write('src/price.js', 'export const applyDiscount = (t, p) => t * (1 - p / 100);\n');
  write('app/checkout.js', "import { applyDiscount } from '../src/price.js';\n");
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('add', '-A');
  git('-c', 'user.email=test@example.com', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
  write('src/price.js', 'export const applyDiscount = (t, p) => { if (p > 100) throw new RangeError(); return t * (1 - p / 100); };\n');
  return root;
}

const cliBrief = {
  idea: 'Guard discounts.',
  summary: ['Done.'],
  parts: [{ id: 'pricing', label: 'Pricing', purpose: 'Prices.', reason: 'Guard.', from: ['part:src'] }],
  phases: [{ name: 'Build', moves: ['Added a guard.'] }],
};

const run = (root, args, input) => spawnSync(process.execPath, [RENDER, '--no-open', ...args], { cwd: root, encoding: 'utf8', input });

test('the CLI writes the page and prints its path', () => {
  const root = shop();
  const out = tempDir('render-out-');
  const r = run(root, ['--out', out, 'src/price.js'], JSON.stringify(cliBrief));
  assert.equal(r.status, 0, r.stderr);
  const file = r.stdout.trim();
  assert.equal(path.dirname(file), out);
  assert.match(path.basename(file), /^brief-\d{8}-\d{6}\.html$/);
  assert.match(fs.readFileSync(file, 'utf8'), /Guard discounts\./);
});

test('the CLI exits with 2 for a bad brief, an empty stdin, and a bad --base', () => {
  const root = shop();
  const out = tempDir('render-out-');
  const bad = run(root, ['--out', out, 'src/price.js'], JSON.stringify({ ...cliBrief, parts: [] }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /problems? in the page data/);

  const empty = run(root, ['--out', out, 'src/price.js'], '');
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /no page data on stdin/);

  const notJson = run(root, ['--out', out, 'src/price.js'], '{oops');
  assert.equal(notJson.status, 2);
  assert.match(notJson.stderr, /not JSON/);

  for (const args of [['--base', '--output=x', 'src/price.js'], ['--base', 'nope', 'src/price.js']]) {
    const r = run(root, ['--out', out, ...args], JSON.stringify(cliBrief));
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /--base/);
  }
  assert.ok(!fs.existsSync(path.join(root, 'x')));
  assert.deepEqual(fs.readdirSync(out), []);
});

test('the CLI falls back to the default directory when --out cannot be written', () => {
  const root = shop();
  const blocker = path.join(tempDir('render-out-'), 'file');
  fs.writeFileSync(blocker, '');
  const r = run(root, ['--out', path.join(blocker, 'sub'), 'src/price.js'], JSON.stringify(cliBrief));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /wrote to/);
  const file = r.stdout.trim();
  assert.ok(fs.existsSync(file));
  fs.rmSync(file);
});

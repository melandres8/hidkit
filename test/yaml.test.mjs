import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, YamlError } from '../skills/cheffy/scripts/lib/yaml.mjs';
import { splitFrontmatter } from '../skills/cheffy/scripts/lib/frontmatter.mjs';

test('parses nested maps, scalars, and comments', () => {
  const doc = parseYaml(`
# top comment
name: critic   # trailing comment
tier: strong
count: 3
ratio: 0.5
enabled: true
missing: null
version: "2.1.261"
url: "https://example.com/#anchor"
nested:
  deep:
    key: value
`);
  assert.deepEqual(doc, {
    name: 'critic', tier: 'strong', count: 3, ratio: 0.5, enabled: true, missing: null,
    version: '2.1.261', url: 'https://example.com/#anchor', nested: { deep: { key: 'value' } },
  });
});

test('parses inline lists and block lists', () => {
  assert.deepEqual(
    parseYaml('input: [request, diff, "a, b"]\nempty: []\nitems:\n  - one\n  - 2\n'),
    { input: ['request', 'diff', 'a, b'], empty: [], items: ['one', 2] },
  );
});

test('parses a list of maps at the key indent', () => {
  assert.deepEqual(
    parseYaml('waivers:\n- check: sast\n  reason: none yet\n- check: secrets\n  expires: 2026-12-31\n'),
    { waivers: [{ check: 'sast', reason: 'none yet' }, { check: 'secrets', expires: '2026-12-31' }] },
  );
});

test('keeps a value with a colon and no following space', () => {
  assert.deepEqual(parseYaml('docs: [https://a.example/x]\nhome: https://b.example'), {
    docs: ['https://a.example/x'], home: 'https://b.example',
  });
});

test('keeps a hash that has no leading space', () => {
  assert.deepEqual(parseYaml('color: a#b'), { color: 'a#b' });
});

test('rejects tabs and unsupported syntax', () => {
  assert.throws(() => parseYaml('a:\n\tb: 1'), YamlError);
  assert.throws(() => parseYaml('a: |\n  text'), YamlError);
  assert.throws(() => parseYaml('a: &anchor 1'), YamlError);
  assert.throws(() => parseYaml('a: {b: 1}'), YamlError);
});

test('returns an empty map for empty input', () => {
  assert.deepEqual(parseYaml('# only a comment\n'), {});
});

test('splits frontmatter and reports the body start line', () => {
  const { data, body, bodyStartLine } = splitFrontmatter('---\nname: x\n---\n# Title\n');
  assert.deepEqual(data, { name: 'x' });
  assert.equal(body, '# Title\n');
  assert.equal(bodyStartLine, 4);
});

test('returns null data when there is no frontmatter', () => {
  assert.deepEqual(splitFrontmatter('# Title\n'), { data: null, body: '# Title\n', bodyStartLine: 1 });
});

test('refuses a duplicate key, so a second block cannot hide the first', () => {
  assert.throws(() => parseYaml('security:\n  asvs_level: 2\nsecurity:\n  waivers: []\n'), /line 3: duplicate key "security"/);
  assert.throws(() => parseYaml('a:\n  b: 1\n  "b": 2\n'), /line 3: duplicate key "b"/);
  assert.throws(() => parseYaml('- check: x\n  check: y\n'), /line 2: duplicate key "check"/);
  assert.deepEqual(parseYaml('a:\n  b: 1\nc:\n  b: 2\n'), { a: { b: 1 }, c: { b: 2 } });
});

test('refuses a __proto__ key, quoted or not', () => {
  for (const text of ['__proto__:\n  polluted: true\n', '"__proto__": 1\n', "a:\n  '__proto__': {}\n"]) {
    assert.throws(() => parseYaml(text), (error) => error instanceof YamlError && /__proto__/.test(error.message), text);
  }
  assert.equal({}.polluted, undefined);
});

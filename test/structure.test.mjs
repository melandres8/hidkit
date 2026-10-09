import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkStructure } from '../skills/cheffy/scripts/lib/structure.mjs';
import { parseGates, parseProfiles } from '../skills/cheffy/scripts/lib/pass.mjs';
import { cleanupTempRepos, tempDir } from './helpers.mjs';

after(cleanupTempRepos);

const config = JSON.parse(fs.readFileSync(new URL('../skills/cheffy/scripts/lint.config.json', import.meta.url), 'utf8'));
const fixture = new URL('./fixtures/structure/', import.meta.url).pathname;

function copyFixture() {
  const dir = tempDir('hidkit-structure-');
  fs.cpSync(fixture, dir, { recursive: true });
  return dir;
}
const edit = (root, rel, from, to) => {
  const file = path.join(root, rel);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to));
};
const rules = (root) => checkStructure(root, config).map((f) => `${f.rule}: ${f.message}`);

test('the valid fixture has no structure findings', () => {
  assert.deepEqual(checkStructure(fixture, config), []);
});

test('parses gates and profiles from pass.md', () => {
  const md = fs.readFileSync(path.join(fixture, 'skills/cheffy/pass.md'), 'utf8');
  assert.deepEqual(parseGates(md), {
    1: { name: 'Proof', level: 'MUST', checkRequired: true, naAllowed: false },
    7: { name: 'Critic', level: 'MUST when the diff crosses a function boundary', checkRequired: false, naAllowed: true },
  });
  assert.deepEqual(parseProfiles(md), { code: [1, 7] });
});

test('flags a recipe with an unknown profile and a wrong last step', () => {
  const root = copyFixture();
  edit(root, 'skills/cheffy/recipes/bug-fix.md', 'profile: code', 'profile: fast');
  assert.deepEqual(rules(root), [
    'recipe-frontmatter: profile "fast" is not defined in pass.md',
    'recipe-steps: last step must be "Run the pass (profile: fast)."',
  ]);
});

test('rejects a profile name inherited from Object.prototype', () => {
  const root = copyFixture();
  edit(root, 'skills/cheffy/recipes/bug-fix.md', 'profile: code', 'profile: constructor');
  assert.deepEqual(rules(root), [
    'recipe-frontmatter: profile "constructor" is not defined in pass.md',
    'recipe-steps: last step must be "Run the pass (profile: constructor)."',
  ]);
});

test('flags a router row without a recipe file and a recipe without a row', () => {
  const root = copyFixture();
  fs.renameSync(path.join(root, 'skills/cheffy/recipes/bug-fix.md'), path.join(root, 'skills/cheffy/recipes/feature.md'));
  edit(root, 'skills/cheffy/recipes/feature.md', 'name: bug-fix', 'name: feature');
  assert.deepEqual(rules(root), [
    'router: recipe "feature" has no router row',
    'router: router row "bug-fix" has no recipe file',
    'link: recipes/bug-fix.md does not exist',
  ]);
});

test('flags role contract problems', () => {
  const root = copyFixture();
  edit(root, 'agents/critic.md', 'tier: strong', 'tier: medium');
  edit(root, 'agents/critic.md', '## Judgment\nSet the severity.\n', '');
  assert.deepEqual(rules(root), [
    'role-frontmatter: tier must be one of strong, fast',
    'role-sections: sections must be Mandate, Judgment, Limits, Input, Output in this order',
  ]);
});

test('flags broken links, budgets, and harness tool names in skills', () => {
  const root = copyFixture();
  edit(root, 'skills/cheffy/principles/prove-it-works.md', 'Check the real artifact.', 'Check the real artifact with `Bash`. See [x](missing.md).');
  fs.appendFileSync(path.join(root, 'skills/cheffy/principles/prove-it-works.md'), `${'word '.repeat(300)}\n`);
  assert.deepEqual(rules(root), [
    'link: missing.md does not exist',
    'budget: 321 words; the budget is 300',
    'tool-name: `Bash` is a harness tool name; use the action name',
  ]);
});

test('missing pass.md is an error only when recipes exist', () => {
  const root = copyFixture();
  fs.rmSync(path.join(root, 'skills/cheffy/recipes'), { recursive: true });
  fs.rmSync(path.join(root, 'skills/cheffy/pass.md'));
  edit(root, 'skills/cheffy/SKILL.md', '| [Bug fix](recipes/bug-fix.md) | A reported defect. |', '');
  assert.deepEqual(rules(root), []);
});

test('flags eval files, which belong in the private eval repository', () => {
  const root = copyFixture();
  fs.mkdirSync(path.join(root, 'skills/cheffy/evals'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills/cheffy-workspace'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/cheffy-workspace/SKILL.md'), '---\nname: cheffy-workspace\ndescription: x\n---\n');
  fs.mkdirSync(path.join(root, 'node_modules/x/evals'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents/evals.json'), '{}');
  assert.deepEqual(rules(root).filter((r) => r.startsWith('eval-location')), [
    'eval-location: eval files belong in the private eval repository, not here',
    'eval-location: eval files belong in the private eval repository, not here',
    'eval-location: eval files belong in the private eval repository, not here',
  ]);
  const files = checkStructure(root, config).filter((f) => f.rule === 'eval-location').map((f) => f.file).sort();
  assert.deepEqual(files, ['agents/evals.json', 'skills/cheffy-workspace/', 'skills/cheffy/evals/']);
});

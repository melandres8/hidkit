import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkProse, countWords, parseGlossary, sentences, textBlocks, textType } from '../skills/cheffy/scripts/lib/prose.mjs';

const config = {
  proceduralPrefixes: ['skills/', 'agents/'],
  sentenceLimits: { procedural: { soft: 20, hard: 26 }, descriptive: { soft: 25, hard: 32 } },
  rfc: { forbiddenUppercase: ['SHALL', 'REQUIRED', 'RECOMMENDED', 'OPTIONAL'], lowercaseInProcedural: ['must', 'should', 'shall'] },
  bannedWords: ['simply', 'leverage', 'etc.', 'simplemente'],
};
const glossary = new Map([['playbook', 'recipe']]);
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const check = (relPath, markdown) => checkProse({ relPath, markdown, config, glossary });

test('the false-positive corpus is clean in both languages', () => {
  for (const file of ['clean-en.md', 'clean-es.md']) {
    const markdown = fs.readFileSync(new URL(`./fixtures/prose/${file}`, import.meta.url), 'utf8');
    assert.deepEqual(check(`docs/${file}`, markdown), [], file);
  }
});

test('splits sentences and protects abbreviations in both languages', () => {
  assert.deepEqual(sentences('Read it, e.g. the file. Then run it.'), ['Read it, e.g. the file.', 'Then run it.']);
  assert.deepEqual(sentences('Usa el ledger, p. ej. el reporte. ¿Está completo? Sí.'), ['Usa el ledger, p. ej. el reporte.', '¿Está completo?', 'Sí.']);
});

test('handles curly quotes and apostrophes in sentences and word counts', () => {
  assert.deepEqual(sentences('He left. \u201CGo now.\u201D Then stop.'), ['He left.', '\u201CGo now.\u201D Then stop.']);
  assert.equal(countWords('don\u2019t stop'), 2);
});

test('counts words and skips code, links, and URLs', () => {
  assert.equal(countWords('Run the check with three flags.'), 6);
  assert.deepEqual(textBlocks('Run `a b c d` now, see [the docs](https://x.y/z) or https://x.y.'), [{ line: 1, text: 'Run now, see the docs or' }]);
});

test('chooses the text type from the path', () => {
  assert.equal(textType('skills/cheffy/SKILL.md', config), 'procedural');
  assert.equal(textType('agents/critic.md', config), 'procedural');
  assert.equal(textType('GLOSSARY.md', config), 'descriptive');
});

test('warns past the soft limit and fails past the hard limit', () => {
  assert.deepEqual(check('agents/x.md', `${words(22)}.`).map((f) => [f.severity, f.rule]), [['warn', 'sentence-length']]);
  assert.deepEqual(check('agents/x.md', `${words(27)}.`).map((f) => [f.severity, f.rule]), [['error', 'sentence-length']]);
  assert.deepEqual(check('GLOSSARY.md', `${words(27)}.`), [ { file: 'GLOSSARY.md', line: 1, severity: 'warn', rule: 'sentence-length', message: '27 words (soft limit 25 for descriptive text)' } ]);
});

test('flags RFC 2119 misuse', () => {
  assert.deepEqual(check('agents/x.md', 'The role SHALL stop.').map((f) => f.rule), ['rfc-keyword']);
  assert.deepEqual(check('agents/x.md', 'The role must stop.').map((f) => [f.severity, f.rule]), [['warn', 'rfc-keyword']]);
  assert.deepEqual(check('GLOSSARY.md', 'A test must fail first.'), []);
});

test('flags banned words and rejected glossary synonyms', () => {
  assert.deepEqual(check('agents/x.md', 'Simply run it.').map((f) => f.rule), ['banned-word']);
  assert.deepEqual(check('agents/x.md', 'Follow the playbook.').map((f) => f.message), ['"playbook" is a rejected synonym; use "recipe"']);
  assert.deepEqual(check('GLOSSARY.md', 'Follow the playbook.'), []);
});

test('reads rejected synonyms from the glossary', () => {
  const md = '## recipe\n\n**Definition.** A procedure.\n\n**Do not use:** playbook, workflow.\n\n## pass\n';
  assert.deepEqual([...parseGlossary(md)], [['playbook', 'recipe'], ['workflow', 'recipe']]);
});

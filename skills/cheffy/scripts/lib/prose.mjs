import { splitFrontmatter } from './frontmatter.mjs';

const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'p. ej.', 'p.ej.', 'Sr.', 'Sra.', 'Dr.', 'Dra.', 'núm.', 'pág.', 'approx.'];
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[\p{Lu}¿¡"\u201C(\d])/u;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'\u2019_./-]*/gu;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const SKIPPED_LINE = /^(#|\||<!--|---$)/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (word, flags) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`, `u${flags}`);

function cleanInline(text) {
  return text
    .replace(/`[^`]*`/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/[^\s>)]+>?/g, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function textBlocks(markdown) {
  const { body, bodyStartLine } = splitFrontmatter(markdown);
  const blocks = [];
  let current = null;
  let fence = null;
  body.split('\n').forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fence) {
      if (fenceMatch && fenceMatch[1] === fence) fence = null;
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      current = null;
      return;
    }
    const trimmed = line.trim();
    if (trimmed === '' || SKIPPED_LINE.test(trimmed)) {
      current = null;
      return;
    }
    if (current === null || LIST_ITEM.test(line)) {
      current = { line: bodyStartLine + index, text: line.replace(LIST_ITEM, '').replace(/^\s*>\s?/, '') };
      blocks.push(current);
    } else current.text += ` ${trimmed}`;
  });
  return blocks.map((block) => ({ line: block.line, text: cleanInline(block.text) })).filter((b) => b.text !== '');
}

export function sentences(text) {
  let guarded = text;
  for (const abbreviation of ABBREVIATIONS) guarded = guarded.split(abbreviation).join(abbreviation.replace(/\./g, '\u0000'));
  return guarded.split(SENTENCE_BREAK).map((s) => s.replace(/\u0000/g, '.').trim()).filter(Boolean);
}

export const countWords = (sentence) => (sentence.match(WORD) ?? []).length;

export const textType = (relPath, config) =>
  config.proceduralPrefixes.some((prefix) => relPath.startsWith(prefix)) ? 'procedural' : 'descriptive';

export function parseGlossary(markdown) {
  const synonyms = new Map();
  let term = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      term = heading[1];
      continue;
    }
    const rejected = line.match(/^\*\*Do not use:\*\*\s*(.+)$/);
    if (term && rejected) {
      for (const synonym of rejected[1].replace(/\.\s*$/, '').split(',')) {
        if (synonym.trim()) synonyms.set(synonym.trim().toLowerCase(), term);
      }
    }
  }
  return synonyms;
}

export function checkProse({ relPath, markdown, config, glossary }) {
  const type = textType(relPath, config);
  const limits = config.sentenceLimits[type];
  const findings = [];
  const add = (line, severity, rule, message) => findings.push({ file: relPath, line, severity, rule, message });
  const isGlossary = relPath.endsWith('GLOSSARY.md');
  for (const { line, text } of textBlocks(markdown)) {
    for (const sentence of sentences(text)) {
      const n = countWords(sentence);
      if (n > limits.hard) add(line, 'error', 'sentence-length', `${n} words (hard limit ${limits.hard} for ${type} text)`);
      else if (n > limits.soft) add(line, 'warn', 'sentence-length', `${n} words (soft limit ${limits.soft} for ${type} text)`);
    }
    for (const word of config.rfc.forbiddenUppercase) {
      if (wordPattern(word, '').test(text)) add(line, 'error', 'rfc-keyword', `"${word}" is not in the Hidkit RFC 2119 set; use MUST, MUST NOT, SHOULD, SHOULD NOT, or MAY`);
    }
    if (type === 'procedural') {
      for (const word of config.rfc.lowercaseInProcedural) {
        if (wordPattern(word, '').test(text)) add(line, 'warn', 'rfc-keyword', `lowercase "${word}" in procedural text; use the uppercase keyword or rephrase`);
      }
    }
    for (const word of config.bannedWords) {
      if (wordPattern(word, 'i').test(text)) add(line, 'error', 'banned-word', `"${word}" is banned by plating`);
    }
    if (!isGlossary) {
      for (const [synonym, term] of glossary) {
        if (wordPattern(synonym, 'i').test(text)) add(line, 'error', 'glossary-synonym', `"${synonym}" is a rejected synonym; use "${term}"`);
      }
    }
  }
  return findings;
}

import { parseYaml } from './yaml.mjs';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(text) {
  const match = text.match(FRONTMATTER);
  if (!match) return { data: null, body: text, bodyStartLine: 1 };
  return {
    data: parseYaml(match[1]),
    body: text.slice(match[0].length),
    bodyStartLine: match[0].split('\n').length,
  };
}

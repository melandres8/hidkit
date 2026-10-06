export class YamlError extends Error {}

const UNSUPPORTED = /^[|>&*!%@`]/;
const isListItem = (text) => text === '-' || text.startsWith('- ');

export function parseYaml(text) {
  const lines = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const lead = raw.match(/^[ \t]*/)[0];
    const content = stripComment(raw);
    if (content.trim() === '') return;
    if (lead.includes('\t')) throw new YamlError(`line ${index + 1}: tabs are not allowed`);
    lines.push({ indent: lead.length, text: content.trim(), no: index + 1 });
  });
  if (lines.length === 0) return {};
  const [value, next] = parseBlock(lines, 0, lines[0].indent);
  if (next < lines.length) throw new YamlError(`line ${lines[next].no}: unexpected indentation`);
  return value;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function parseBlock(lines, i, indent) {
  return isListItem(lines[i].text) ? parseList(lines, i, indent) : parseMap(lines, i, indent);
}

function parseMap(lines, i, indent) {
  const map = {};
  while (i < lines.length && lines[i].indent === indent && !isListItem(lines[i].text)) {
    const { text, no } = lines[i];
    const match = text.match(/^([^:]+?):(?:\s+(.*))?$/);
    if (!match) throw new YamlError(`line ${no}: expected "key: value"`);
    const key = unquote(match[1].trim());
    if (key === '__proto__') throw new YamlError(`line ${no}: the key "__proto__" is not allowed`);
    if (Object.hasOwn(map, key)) throw new YamlError(`line ${no}: duplicate key "${key}"`);
    i += 1;
    if (match[2] !== undefined) {
      map[key] = parseScalar(match[2], no);
      continue;
    }
    const next = lines[i];
    if (next && next.indent > indent) [map[key], i] = parseBlock(lines, i, next.indent);
    else if (next && next.indent === indent && isListItem(next.text)) [map[key], i] = parseList(lines, i, indent);
    else map[key] = null;
  }
  return [map, i];
}

function parseList(lines, i, indent) {
  const list = [];
  while (i < lines.length && lines[i].indent === indent && isListItem(lines[i].text)) {
    const line = lines[i];
    const rest = line.text === '-' ? '' : line.text.slice(2).trimStart();
    let value;
    if (rest === '') {
      i += 1;
      const next = lines[i];
      if (next && next.indent > indent) [value, i] = parseBlock(lines, i, next.indent);
      else value = null;
    } else if (/^[^"'[{][^:]*:(\s|$)/.test(rest)) {
      const column = line.indent + line.text.length - rest.length;
      lines[i] = { indent: column, text: rest, no: line.no };
      [value, i] = parseMap(lines, i, column);
    } else {
      value = parseScalar(rest, line.no);
      i += 1;
    }
    list.push(value);
  }
  return [list, i];
}

function parseScalar(raw, no) {
  const value = raw.trim();
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new YamlError(`line ${no}: unclosed inline list`);
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : splitInline(inner, no).map((part) => parseScalar(part, no));
  }
  if (value === '{}') return {};
  if (value.startsWith('{')) throw new YamlError(`line ${no}: inline maps are not supported`);
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new YamlError(`line ${no}: invalid double-quoted string`);
    }
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) throw new YamlError(`line ${no}: unclosed single quote`);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (UNSUPPORTED.test(value)) throw new YamlError(`line ${no}: unsupported YAML syntax "${value[0]}"`);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitInline(inner, no) {
  const parts = [];
  let quote = null;
  let current = '';
  for (const c of inner) {
    if (quote) {
      current += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (c === ',') {
      parts.push(current.trim());
      current = '';
    } else current += c;
  }
  if (quote) throw new YamlError(`line ${no}: unclosed quote in inline list`);
  parts.push(current.trim());
  return parts;
}

function unquote(key) {
  return /^(["']).*\1$/.test(key) ? key.slice(1, -1) : key;
}

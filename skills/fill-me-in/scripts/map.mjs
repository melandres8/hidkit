#!/usr/bin/env node
// Maps the files that a session touched into parts and finds the code that refers to each part.
// Usage: node map.mjs [--base <rev>] [--max <n>] <file>...
// Prints one JSON object. Paths are relative to the git root of the working directory.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERIC = new Set(['index', 'main', 'mod', '__init__', 'skill', 'readme']);
const SAMPLES = 2;
const LIST_LIMIT = 10;

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err.status === 1 && args[0] === 'grep') return '';
    throw err;
  }
}

function states(root, base) {
  const out = new Map();
  for (const line of git(root, ['diff', '--name-status', '--no-renames', base, '--']).split('\n')) {
    const [code, file] = line.split('\t');
    if (file) out.set(file, code === 'A' ? 'new' : code === 'D' ? 'deleted' : 'modified');
  }
  for (const file of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')) {
    if (file) out.set(file, 'new');
  }
  return out;
}

const depth = (dir) => (dir === '.' ? 0 : dir.split('/').length);

// Groups paths by directory. While there are more than `max` groups, merges the sibling directories under one
// parent, the parent that removes the most groups first. It never merges into the root. If more than `max` groups
// remain, it keeps the `max - 1` largest and puts the rest into an "(other)" group.
export function groupByDir(files, max) {
  const groups = new Map();
  for (const file of files) {
    const dir = path.posix.dirname(file);
    groups.set(dir, [...(groups.get(dir) ?? []), file]);
  }
  while (groups.size > max) {
    const children = new Map();
    for (const dir of groups.keys()) {
      if (depth(dir) < 2) continue;
      const parent = path.posix.dirname(dir);
      children.set(parent, [...(children.get(parent) ?? []), dir]);
    }
    if (children.size === 0) break;
    const gain = (parent, dirs) => dirs.length - (groups.has(parent) ? 0 : 1);
    const [parent, dirs] = [...children].sort((a, b) => gain(...b) - gain(...a) || depth(b[0]) - depth(a[0]))[0];
    const merged = [...(groups.get(parent) ?? [])];
    for (const dir of dirs) {
      merged.push(...groups.get(dir));
      groups.delete(dir);
    }
    groups.set(parent, merged);
  }
  if (groups.size <= max) return groups;
  const bySize = [...groups].sort((a, b) => b[1].length - a[1].length);
  return new Map([...bySize.slice(0, max - 1), ['(other)', bySize.slice(max - 1).flatMap(([, members]) => members)]]);
}

// The strings that another file uses to refer to `file`.
export function termsFor(file) {
  const base = path.posix.basename(file);
  const stem = base.replace(/\.[^.]+$/, '');
  if (GENERIC.has(stem.toLowerCase())) {
    const parent = path.posix.basename(path.posix.dirname(file));
    return parent === '.' ? [base] : [parent];
  }
  return [base, `/${stem}`];
}

// Resolves `base` to a commit id. Returns null when `base` is not a commit. A base that starts with "-" would reach
// git as an option, so the function accepts only a name that resolves to a commit.
export function resolveBase(root, base) {
  if (typeof base !== 'string' || base === '' || base.startsWith('-')) return null;
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${base}^{commit}`]).trim();
  } catch {
    return null;
  }
}

function ownerOf(groups) {
  const owner = new Map();
  for (const [dir, members] of groups) for (const file of members) owner.set(file, dir);
  return owner;
}

export function mapChange({ root, files, base = 'HEAD', max = 4 }) {
  const touched = [...new Set(files.map((f) => path.posix.normalize(f)))];
  const state = states(root, base);
  const parts = groupByDir(touched, max);
  const partOf = ownerOf(parts);

  const refs = [];
  for (const [dir, members] of parts) {
    const terms = [...new Set(members.flatMap(termsFor))];
    const args = ['grep', '--untracked', '-n', '-i', '-F', ...terms.flatMap((t) => ['-e', t])];
    for (const line of git(root, args).split('\n')) {
      const m = line.match(/^(.+?):(\d+):/);
      if (!m || members.includes(m[1])) continue;
      refs.push({ file: m[1], line: Number(m[2]), to: dir });
    }
  }

  const outside = [...new Set(refs.map((r) => r.file).filter((f) => !partOf.has(f)))];
  const neighbours = groupByDir(outside, max);
  const neighbourOf = ownerOf(neighbours);

  const edges = new Map();
  for (const ref of refs) {
    const from = partOf.has(ref.file) ? `part:${partOf.get(ref.file)}` : `existing:${neighbourOf.get(ref.file)}`;
    const to = `part:${ref.to}`;
    if (from === to) continue;
    const key = `${from}>${to}`;
    const edge = edges.get(key) ?? { from, to, refs: 0, samples: [] };
    edge.refs += 1;
    if (edge.samples.length < SAMPLES) edge.samples.push(`${ref.file}:${ref.line}`);
    edges.set(key, edge);
  }

  const listFiles = touched.length <= LIST_LIMIT;
  return {
    touched: touched.length,
    parts: [...parts].map(([dir, members]) => {
      const counts = {};
      for (const file of members) {
        const s = state.get(file) ?? 'unchanged';
        counts[s] = (counts[s] ?? 0) + 1;
      }
      return { id: `part:${dir}`, dir, files: members.length, states: counts, ...(listFiles ? { paths: members } : {}) };
    }),
    existing: [...neighbours].map(([dir, members]) => ({ id: `existing:${dir}`, dir, files: members.length })),
    edges: [...edges.values()].sort((a, b) => b.refs - a.refs),
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let base = 'HEAD';
  let max = 4;
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--base') base = args[++i];
    else if (args[i] === '--max') max = Number(args[++i]);
    else files.push(args[i]);
  }
  const usage = (reason) => {
    console.error(`map.mjs: ${reason}\nusage: map.mjs [--base <rev>] [--max <n>] <file>...`);
    process.exit(2);
  };
  if (files.length === 0) usage('no files');
  if (!Number.isInteger(max) || max < 2) usage('--max must be an integer of 2 or more');
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const commit = resolveBase(root, base);
  if (!commit) usage(typeof base === 'string' && !base.startsWith('-') ? `--base ${base} is not a commit` : '--base needs a commit');
  console.log(JSON.stringify(mapChange({ root, files, base: commit, max })));
}

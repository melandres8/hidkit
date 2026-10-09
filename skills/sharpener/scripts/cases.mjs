#!/usr/bin/env node
// Checks an evals.json file in the skill-creator schema, so that sharpener appends only valid regression cases.
// Usage: node cases.mjs <path>/evals.json
// The skill directory is the parent of the file, or its grandparent when the parent is named evals.
// Exit 0 prints a summary as JSON, exit 2 lists each problem, exit 1 is a usage or read error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYS = ['id', 'prompt', 'expected_output', 'files', 'expectations'];
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

// Returns the list of problems in the parsed file. skillDir resolves the paths in `files`.
export function checkCases(data, skillDir) {
  const problems = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the file must hold a JSON object'];
  if (!nonEmpty(data.skill_name)) problems.push('skill_name must be a non-empty string');
  else if (skillDir && data.skill_name !== path.basename(skillDir)) {
    problems.push(`skill_name "${data.skill_name}" must match the skill directory "${path.basename(skillDir)}"`);
  }
  if (!Array.isArray(data.evals) || data.evals.length === 0) return [...problems, 'evals must be a non-empty list'];

  const seen = new Set();
  data.evals.forEach((c, i) => {
    const at = `evals[${i}]`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      problems.push(`${at} must be an object`);
      return;
    }
    if (!Number.isInteger(c.id) || c.id < 1) problems.push(`${at}.id must be a positive integer`);
    else if (seen.has(c.id)) problems.push(`${at}.id ${c.id} is used more than once`);
    else seen.add(c.id);
    if (!nonEmpty(c.prompt)) problems.push(`${at}.prompt must be a non-empty string`);
    if (!nonEmpty(c.expected_output)) problems.push(`${at}.expected_output must be a non-empty string`);
    if ('assertions' in c) problems.push(`${at} uses "assertions"; the schema names this field "expectations"`);
    if (!Array.isArray(c.expectations) || c.expectations.length === 0 || !c.expectations.every(nonEmpty)) {
      problems.push(`${at}.expectations must be a non-empty list of non-empty strings`);
    }
    if (c.files !== undefined) {
      if (!Array.isArray(c.files) || !c.files.every(nonEmpty)) problems.push(`${at}.files must be a list of paths`);
      else if (skillDir) {
        for (const f of c.files) {
          const abs = path.resolve(skillDir, f);
          if (path.relative(skillDir, abs).startsWith('..') || path.isAbsolute(f)) problems.push(`${at}.files: ${f} is outside the skill directory`);
          else if (!fs.existsSync(abs)) problems.push(`${at}.files: ${f} does not exist`);
        }
      }
    }
    for (const key of Object.keys(c)) {
      if (!KEYS.includes(key) && key !== 'assertions') problems.push(`${at}.${key} is not in the schema`);
    }
  });
  return problems;
}

function main(argv) {
  const file = argv[0];
  if (!file || argv.length > 1) {
    console.error('usage: node cases.mjs <path>/evals.json');
    return 1;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    return 1;
  }
  const parent = path.dirname(path.resolve(file));
  const skillDir = path.basename(parent) === 'evals' ? path.dirname(parent) : parent;
  const problems = checkCases(data, skillDir);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    return 2;
  }
  const ids = data.evals.map((c) => c.id);
  console.log(JSON.stringify({ skill: data.skill_name, cases: ids.length, nextId: Math.max(...ids) + 1 }));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));

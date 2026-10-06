#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { GLOSSARY_FILE, PLUGIN_ROOT, SCRIPTS_DIR } from './lib/paths.mjs';
import { checkProse, parseGlossary } from './lib/prose.mjs';
import { checkStructure, walkMarkdown } from './lib/structure.mjs';

const config = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, 'lint.config.json'), 'utf8'));
const args = process.argv.slice(2);

function glossaryAt(root) {
  const file = path.join(root, 'GLOSSARY.md');
  if (fs.existsSync(file)) return parseGlossary(fs.readFileSync(file, 'utf8'));
  return fs.existsSync(GLOSSARY_FILE) ? parseGlossary(fs.readFileSync(GLOSSARY_FILE, 'utf8')) : new Map();
}

let findings;
if (args[0] === '--prose') {
  const glossary = glossaryAt(PLUGIN_ROOT);
  findings = args.slice(1).flatMap((file) => checkProse({
    relPath: path.relative(process.cwd(), path.resolve(file)),
    markdown: fs.readFileSync(file, 'utf8'),
    config,
    glossary,
  }));
} else {
  const root = path.resolve(args[0] ?? PLUGIN_ROOT);
  const glossary = glossaryAt(root);
  const files = config.lintPaths.flatMap((p) => walkMarkdown(root, p));
  findings = [
    ...files.flatMap((rel) => checkProse({ relPath: rel, markdown: fs.readFileSync(path.join(root, rel), 'utf8'), config, glossary })),
    ...checkStructure(root, config),
  ];
}

for (const f of findings) console.log(`${f.file}:${f.line}: ${f.severity} ${f.rule}: ${f.message}`);
const errors = findings.filter((f) => f.severity === 'error').length;
console.log(`lint: ${errors} errors, ${findings.length - errors} warnings`);
process.exit(errors > 0 ? 1 : 0);

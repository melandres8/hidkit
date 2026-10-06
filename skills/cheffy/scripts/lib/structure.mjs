import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from './frontmatter.mjs';
import { parseGates, parseProfiles } from './pass.mjs';
import { countWords } from './prose.mjs';

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const finding = (file, rule, message) => ({ file, line: 1, severity: 'error', rule, message });
const headings = (body, level) => [...body.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map((m) => m[1].trim());
const withoutCode = (text) => text.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');

export function walkMarkdown(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return rel.endsWith('.md') ? [rel] : [];
  return fs.readdirSync(abs, { recursive: true })
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(rel, f))
    .sort();
}

export function checkStructure(root, config) {
  const findings = [];
  const roles = checkRoles(root, config, findings);
  const recipeFiles = walkMarkdown(root, config.paths.recipes);
  const profiles = checkPassFile(root, config, recipeFiles.length > 0, findings);
  checkPrinciples(root, config, findings);
  checkSkills(root, config, findings);
  const recipes = checkRecipes(root, config, recipeFiles, profiles, roles, findings);
  checkRouter(root, config, recipes, findings);
  const files = config.lintPaths.flatMap((p) => walkMarkdown(root, p));
  checkLinks(root, files, findings);
  checkBudgets(root, config, files, findings);
  checkToolNames(root, config, findings);
  return findings;
}

function checkRoles(root, config, findings) {
  const files = walkMarkdown(root, config.paths.agents);
  const names = new Set(files.map((f) => path.basename(f, '.md')));
  for (const file of files) {
    const name = path.basename(file, '.md');
    const { data, body } = splitFrontmatter(read(root, file));
    const add = (rule, message) => findings.push(finding(file, rule, message));
    if (!data) {
      add('role-frontmatter', 'missing frontmatter');
      continue;
    }
    if (data.name !== name) add('role-frontmatter', `name must be "${name}"`);
    if (typeof data.description !== 'string' || data.description === '') add('role-frontmatter', 'description is required');
    if (!config.role.tiers.includes(data.tier)) add('role-frontmatter', `tier must be one of ${config.role.tiers.join(', ')}`);
    if (!config.role.access.includes(data.access)) add('role-frontmatter', `access must be one of ${config.role.access.join(', ')}`);
    if (!Array.isArray(data.input) || data.input.length === 0) add('role-frontmatter', 'input must be a non-empty list');
    if (!Array.isArray(data.withheld)) add('role-frontmatter', 'withheld must be a list');
    if (data.diversity !== undefined) {
      const m = /^differ-from ([a-z-]+)$/.exec(String(data.diversity));
      if (!m || !names.has(m[1])) add('role-frontmatter', 'diversity must be "differ-from <existing role>"');
    }
    if (headings(body, 2).join('|') !== config.role.sections.join('|')) {
      add('role-sections', `sections must be ${config.role.sections.join(', ')} in this order`);
    }
  }
  return names;
}

function checkPassFile(root, config, required, findings) {
  const file = config.paths.pass;
  if (!exists(root, file)) {
    if (required) findings.push(finding(file, 'pass', 'pass.md is missing'));
    return {};
  }
  const markdown = read(root, file);
  const gates = parseGates(markdown);
  const profiles = parseProfiles(markdown);
  if (Object.keys(gates).length === 0) findings.push(finding(file, 'pass', 'no rows in the "## Gates" table'));
  if (Object.keys(profiles).length === 0) findings.push(finding(file, 'pass', 'no rows in the "## Profiles" table'));
  for (const [profile, numbers] of Object.entries(profiles)) {
    for (const n of numbers) if (!gates[n]) findings.push(finding(file, 'pass', `profile "${profile}" uses unknown gate ${n}`));
  }
  return profiles;
}

function checkPrinciples(root, config, findings) {
  for (const file of walkMarkdown(root, config.paths.principles)) {
    const name = path.basename(file, '.md');
    const { data, body } = splitFrontmatter(read(root, file));
    if (!data || data.name !== name) findings.push(finding(file, 'principle-frontmatter', `name must be "${name}"`));
    if (!data || !config.principle.groups.includes(data.group)) findings.push(finding(file, 'principle-frontmatter', `group must be one of ${config.principle.groups.join(', ')}`));
    if (headings(body, 2).join('|') !== config.principle.sections.join('|')) {
      findings.push(finding(file, 'principle-sections', `sections must be ${config.principle.sections.join(', ')} in this order`));
    }
  }
}

function checkSkills(root, config, findings) {
  const skillsDir = path.join(root, config.paths.skills);
  if (!fs.existsSync(skillsDir)) return;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const file = path.join(config.paths.skills, entry.name, 'SKILL.md');
    if (!exists(root, file)) {
      findings.push(finding(file, 'skill', 'SKILL.md is missing'));
      continue;
    }
    const { data } = splitFrontmatter(read(root, file));
    if (!data || data.name !== entry.name) findings.push(finding(file, 'skill', `name must be "${entry.name}"`));
    if (!data || typeof data.description !== 'string' || data.description === '') findings.push(finding(file, 'skill', 'description is required'));
  }
}

function stepsOf(body) {
  const steps = body.split(/^## /m).find((s) => s.startsWith('Steps')) ?? '';
  return steps.split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s+/, '').trim());
}

function checkRecipes(root, config, files, profiles, roles, findings) {
  const names = new Set();
  for (const file of files) {
    const name = path.basename(file, '.md');
    names.add(name);
    const { data, body } = splitFrontmatter(read(root, file));
    const add = (rule, message) => findings.push(finding(file, rule, message));
    if (!data) {
      add('recipe-frontmatter', 'missing frontmatter');
      continue;
    }
    if (data.name !== name) add('recipe-frontmatter', `name must be "${name}"`);
    if (!Object.hasOwn(profiles, data.profile)) add('recipe-frontmatter', `profile "${data.profile}" is not defined in pass.md`);
    if (!Array.isArray(data.roles)) add('recipe-frontmatter', 'roles must be a list');
    else for (const role of data.roles) if (!roles.has(role)) add('recipe-frontmatter', `unknown role "${role}"`);
    if (!/^# .+/m.test(body)) add('recipe-sections', 'missing "# <Title>"');
    if (headings(body, 2).join('|') !== config.recipe.sections.join('|')) {
      add('recipe-sections', `sections must be ${config.recipe.sections.join(', ')} in this order`);
    }
    const steps = stepsOf(body);
    if (steps.length > config.recipe.maxSteps) add('recipe-steps', `${steps.length} steps; the maximum is ${config.recipe.maxSteps}`);
    const last = /Run the pass \(profile: ([a-z-]+)\)\.?$/.exec(steps.at(-1) ?? '');
    if (!last || last[1] !== data.profile) add('recipe-steps', `last step must be "Run the pass (profile: ${data.profile})."`);
  }
  return names;
}

function checkRouter(root, config, recipes, findings) {
  const file = path.join(config.paths.cheffy, 'SKILL.md');
  if (!exists(root, file)) return;
  const router = read(root, file).split(/^## /m).find((s) => s.startsWith('Router'));
  if (!router) {
    findings.push(finding(file, 'router', 'missing "## Router" section'));
    return;
  }
  const routed = new Set([...router.matchAll(/\(recipes\/([a-z-]+)\.md\)/g)].map((m) => m[1]));
  for (const recipe of recipes) if (!routed.has(recipe)) findings.push(finding(file, 'router', `recipe "${recipe}" has no router row`));
  for (const row of routed) if (!recipes.has(row)) findings.push(finding(file, 'router', `router row "${row}" has no recipe file`));
}

function checkLinks(root, files, findings) {
  for (const file of files) {
    for (const [, target] of withoutCode(read(root, file)).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const resolved = path.join(path.dirname(file), target.split('#')[0]);
      if (!exists(root, resolved)) findings.push(finding(file, 'link', `${target} does not exist`));
    }
  }
}

function checkBudgets(root, config, files, findings) {
  for (const file of files) {
    const budget = config.budgets.find((b) => (b.path.endsWith('/') ? file.startsWith(b.path) : file === b.path));
    if (!budget) continue;
    const words = countWords(withoutCode(splitFrontmatter(read(root, file)).body));
    if (words > budget.words) findings.push(finding(file, 'budget', `${words} words; the budget is ${budget.words}`));
  }
}

function checkToolNames(root, config, findings) {
  for (const file of walkMarkdown(root, config.paths.skills)) {
    if (file.startsWith(config.paths.harness)) continue;
    const text = read(root, file);
    for (const name of config.toolNames.anywhere) {
      if (new RegExp(`\\b${name}\\b`).test(text)) findings.push(finding(file, 'tool-name', `${name} is a harness tool name; use the action name`));
    }
    for (const name of config.toolNames.backticked) {
      if (text.includes(`\`${name}\``)) findings.push(finding(file, 'tool-name', `\`${name}\` is a harness tool name; use the action name`));
    }
  }
}

#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../skills/cheffy/scripts/lib/frontmatter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACE = path.join(ROOT, 'skills/cheffy/scripts/trace.mjs');
const FIXTURE = path.join(ROOT, 'scripts/smoke-fixture');
const ALLOWED = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Agent', 'Bash(node *)', 'Bash(git *)'];
const WRITE_OR_SHELL = ['Edit', 'Write', 'NotebookEdit', 'Bash'];

function workdir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-')));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=smoke@example.com', '-c', 'user.name=smoke', 'commit', '-q', '-m', 'initial']]) {
    execFileSync('git', args, { cwd: dir });
  }
  return dir;
}

function claude(cwd, args) {
  const res = spawnSync('claude', ['--plugin-dir', ROOT, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk', ...args], { cwd, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(cwd, '.git', 'smoke-stream.jsonl'), res.stdout ?? '', { mode: 0o600 });
  const events = (res.stdout ?? '').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const result = events.find((e) => e.type === 'result');
  // A claim never passes on a run that did not complete: an API or auth error emits no tool use and would pass vacuously.
  if (res.status !== 0 || !result || result.is_error) {
    console.error(`run failed in ${cwd}: ${result?.result ?? res.error?.message ?? `exit ${res.status}`}`);
  }
  return {
    ok: res.status === 0 && Boolean(result) && !result.is_error,
    result: result?.result ?? '',
    events,
    toolUses: events.flatMap((e) => (e.message?.content ?? []).filter((c) => c.type === 'tool_use')),
  };
}

const claims = {
  'cheffy does not auto-invoke'() {
    const run = claude(workdir(), ['--allowedTools', ALLOWED.join(','), '-p', 'The 404 message in this repo has a typo. Fix it with high quality.']);
    return run.ok && !run.toolUses.some((t) => JSON.stringify(t.input ?? {}).includes('cheffy'));
  },
  'a read-only role gets no write or shell tools'() {
    const dir = workdir();
    const run = claude(dir, ['--agent', 'hidkit:critic', '--allowedTools', ALLOWED.join(','), '-p', 'Create a file named probe.txt that contains the word x.']);
    const init = run.events.find((e) => e.type === 'system' && e.subtype === 'init');
    const tools = init?.tools ?? [];
    const enforced = tools.length > 0 && !tools.some((t) => WRITE_OR_SHELL.includes(t));
    return run.ok && enforced && !fs.existsSync(path.join(dir, 'probe.txt'));
  },
  'agents load with hidkit frontmatter keys'() {
    const run = claude(workdir(), ['--agent', 'hidkit:investigator', '--allowedTools', 'Read', '-p', 'Reply with the single word ready.']);
    const init = run.events.find((e) => e.type === 'system' && e.subtype === 'init');
    const declared = splitFrontmatter(fs.readFileSync(path.join(ROOT, 'agents/investigator.md'), 'utf8')).data?.tools;
    const expected = new Set((Array.isArray(declared) ? declared : String(declared ?? '').split(',')).map((t) => String(t).trim()).filter(Boolean));
    const actual = new Set(init?.tools ?? []);
    // Subset, not equality: Claude Code 2.1.289 drops Grep and Glob from the role's init list. A session that
    // ignored the role would list the full session tool set, so any tool outside the frontmatter fails the claim.
    const applied = actual.has('Read') && [...actual].every((t) => expected.has(t));
    return run.ok && run.result.toLowerCase().includes('ready') && applied;
  },
  'cheffy writes a complete quick-lane ledger'() {
    const dir = workdir();
    const run = claude(dir, ['--allowedTools', ALLOWED.join(','), '-p', '/hidkit:cheffy The 404 message says "Not fuond". Fix the typo.']);
    if (!run.ok) return false;
    if (/fuond/i.test(fs.readFileSync(path.join(dir, 'src/messages.mjs'), 'utf8'))) return false;
    const first = (match) => run.toolUses.findIndex(match);
    const started = first((t) => t.name === 'Bash' && /trace\.mjs (start|begin)\b/.test(String(t.input?.command ?? '')));
    const edited = first((t) => t.name === 'Edit' || t.name === 'Write');
    if (started === -1 || (edited !== -1 && edited < started)) return false;
    try {
      const report = JSON.parse(execFileSync('node', [TRACE, 'report', '--all'], { cwd: dir, encoding: 'utf8' }));
      return report.runs.some((r) => r.lane === 'quick' && r.passes.length > 0 && r.status !== 'open');
    } catch {
      return false;
    }
  },
};

const only = process.argv[2];
const selected = Object.entries(claims).filter(([n]) => !only || n.includes(only));
if (selected.length === 0) {
  console.error(`no claim matches "${only}"`);
  process.exit(1);
}
let failed = 0;
for (const [name, run] of selected) {
  const ok = run();
  failed += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
if (failed) process.exitCode = 1;
else if (only) {
  console.log(`partial run: ${selected.length} of ${Object.keys(claims).length} claims`);
  process.exitCode = 3;
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, adapterVerified, loadHarnessMap, loadProjectConfig, readProjectConfig, resolveModel } from './lib/config.mjs';
import {
  TraceError, appendEvent, assertNoSymlink, checkLogFile, currentRun, ensureExcluded, listRuns, mainRoot,
  newId, newRunId, readEvents, runsDir, setCurrentRun, writeSecure,
} from './lib/ledger.mjs';
import { SECURITY_CHECKS, parseGateArgs, parseGates, parseProfiles, usedWaiver, validatePass } from './lib/pass.mjs';
import { AGENTS_DIR, HARNESS_DIR, PASS_FILE, SECURITY_TOOLS_FILE, TRACE_FILE, UNTRUSTED_FILE } from './lib/paths.mjs';
import { redact } from './lib/redact.mjs';
import { summarizeRun } from './lib/report.mjs';
import { enforcementFor, loadRole, renderBrief, validateBriefFields, validateTrusted } from './lib/roles.mjs';
import { deltaCommand, resolveSecurityCheck, waiverStatus } from './lib/security.mjs';
import { YamlError, parseYaml } from './lib/yaml.mjs';

const OUTPUT_TAIL_LINES = 40;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const ALL_SCANS = 'all';
const RUNLESS = new Set(['setup', 'start', 'begin', 'report', 'prune', 'detect']);
const CRITIC_LINE_LIMIT = 80;
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

function parseCli(argv) {
  const [command, ...rest] = argv;
  const dash = rest.indexOf('--');
  const head = dash === -1 ? rest : rest.slice(0, dash);
  const tail = dash === -1 ? [] : rest.slice(dash + 1);
  const opts = Object.create(null);
  for (let i = 0; i < head.length; i += 1) {
    if (!head[i].startsWith('--')) throw new TraceError(`unexpected argument: ${head[i]}`);
    const eq = head[i].indexOf('=');
    const key = head[i].slice(2, eq === -1 ? undefined : eq);
    const next = head[i + 1];
    let value;
    if (eq !== -1) value = head[i].slice(eq + 1);
    else if (next === undefined || next.startsWith('--')) value = true;
    else {
      value = next;
      i += 1;
    }
    (opts[key] ??= []).push(value);
  }
  return { command, opts, tail };
}

function many(opts, key) {
  const values = opts[key] ?? [];
  if (values.includes(true)) throw new TraceError(`--${key} needs a value`);
  return values;
}

function one(opts, key, { required = true, flag = false } = {}) {
  const values = opts[key];
  if (!values) {
    if (required) throw new TraceError(`--${key} is required`);
    return null;
  }
  if (values.length > 1) throw new TraceError(`--${key} is given more than once`);
  if (flag && values[0] !== true) throw new TraceError(`--${key} takes no value`);
  if (!flag && values[0] === true) throw new TraceError(`--${key} needs a value`);
  return values[0];
}

function choice(value, allowed, key) {
  if (!allowed.includes(value)) throw new TraceError(`--${key} must be one of: ${allowed.join(', ')}`);
  return value;
}

function runStart(events) {
  const start = events.find((e) => e.type === 'run_start');
  if (!start) throw new TraceError('run has no run_start');
  return start;
}

function withheldByRole() {
  if (!fs.existsSync(AGENTS_DIR)) return {};
  return Object.fromEntries(fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).map((f) => {
    let role;
    try {
      role = loadRole(f.slice(0, -3), AGENTS_DIR);
    } catch (error) {
      if (error instanceof TraceError || error instanceof YamlError) return null;
      throw error;
    }
    return [role.name, role.withheld ?? []];
  }).filter(Boolean));
}

const outputTail = (text) => text.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
const singleCheckResult = ({ event, clean }) => ({
  exitCode: event.exit_code,
  text: `${outputTail(clean)}\n${JSON.stringify({ check_id: event.check_id, exit_code: event.exit_code, output_path: event.output_path, version_ok: event.version_ok })}`,
});

// Lists repository files by registry pattern. Paths are relative to the top of the repository.
// A pattern is relative to the scan dir. A pattern that starts with "/" is relative to the top of the repository.
// The match ignores case, because a case-insensitive file system gives .GITLEAKSIGNORE to a scanner that opens .gitleaksignore.
function repoFiles(ctx, patterns) {
  const top = { ...ctx, cwd: git(ctx, 'rev-parse', '--show-toplevel') };
  const prefix = git(ctx, 'rev-parse', '--show-prefix');
  const specs = patterns.map((pattern) => `:(glob,icase)${pattern.startsWith('/') ? pattern.slice(1) : `${prefix}${pattern}`}`);
  return { top, list: (...args) => git(top, ...args, '-z', '--', ...specs).split('\0').filter(Boolean) };
}

// gitleaks and semgrep always read some suppression files from the scanned repository, and no flag turns that off.
// A file is "changed" when it is untracked, is not a regular file, or differs from the run base. With no base, each file is changed.
// A file that git ignores counts only when its directory has tracked files, so node_modules/x/.semgrepignore does not fail the scan.
// A deleted file is not listed: the scan then suppresses less.
function suppressionState(ctx, patterns) {
  const { top, list } = repoFiles(ctx, patterns);
  const onDisk = (file) => {
    try {
      return fs.lstatSync(path.join(top.cwd, file));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const hasTracked = (file) => git(top, '--literal-pathspecs', 'ls-files', '--', `${path.posix.dirname(file)}/`) !== '';
  const untracked = [...list('ls-files', '--others', '--exclude-standard'), ...list('ls-files', '--others', '--ignored', '--exclude-standard').filter(hasTracked)];
  const present = [...new Set([...list('ls-files', '--cached'), ...untracked])].filter((file) => onDisk(file)).sort();
  const given = runStart(readEvents(ctx.root, ctx.runId)).base;
  const base = given && git(ctx, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${given}^{commit}`);
  const changed = new Set(base ? [...list('diff', '--name-only', '--no-renames', base), ...untracked, ...present.filter((file) => !onDisk(file).isFile())] : present);
  return { changed: present.filter((file) => changed.has(file)), unchanged: present.filter((file) => !changed.has(file)), base };
}

// osv-scanner skips each file that git ignores, so a .gitignore entry can hide a tracked lockfile.
const ignoredTargets = (ctx, patterns) => repoFiles(ctx, patterns).list('ls-files', '--cached', '--ignored', '--exclude-standard').sort();

// Runs one command, records one check event (and a decision for a used waiver), and returns the event and the redacted output.
function runCheck(ctx, step, argv, scan) {
  const { name = null, security = null, project = null, deltaBase = null } = scan ?? {};
  const checkId = newId('c');
  const startedAt = now();
  const suppression = security?.suppressionFiles?.length ? suppressionState(ctx, security.suppressionFiles) : null;
  const ignored = security?.trackedTargets?.length ? ignoredTargets(ctx, security.trackedTargets) : null;
  let output;
  let exitCode;
  if (security?.toolName && security.installed === null) {
    output = `${security.toolName} is not installed. Run doctor for the pinned install command.\n`;
    exitCode = 127;
  } else if (suppression?.changed.length) {
    output = `${suppression.changed.join(', ')} changed since the run base (${suppression.base ?? 'none'}). ${security.toolName} always reads these files, so they can hide findings. `
      + 'The scan did not run. Ask the user to review the change.\n';
    exitCode = 1;
  } else if (ignored?.length) {
    output = `git ignores these tracked files, so ${security.toolName} does not scan them: ${ignored.join(', ')}. The scan did not run. Ask the user to review the ignore rules.\n`;
    exitCode = 1;
  } else {
    const res = spawnSync(argv[0], argv.slice(1), { cwd: ctx.cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
    const overflow = res.error?.code === 'ENOBUFS';
    const partial = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    if (overflow) output = `${partial}\n[output truncated: the command wrote more than ${MAX_OUTPUT_BYTES} bytes]\n`;
    else output = res.error ? `could not run ${argv[0]}: ${res.error.message}\n` : partial;
    exitCode = overflow ? 1 : res.error ? 127 : (res.status ?? 1);
  }
  const clean = redact(output);
  const logFile = checkLogFile(ctx.root, ctx.runId, checkId);
  writeSecure(ctx.root, logFile, clean);
  const event = {
    type: 'check', check_id: checkId, step, command: argv.join(' '), security_check: name,
    ...(security && { security_source: security.source, config_sha256: project.sha256, delta_base: deltaBase }),
    ...(suppression && { suppression_files: { changed: suppression.changed, unchanged: suppression.unchanged } }),
    ...(ignored && { ignored_targets: ignored }),
    tool_version: security?.installed ?? null, version_ok: security?.versionOk ?? null, waiver: security?.waiver ?? null,
    exit_code: exitCode, output_sha256: crypto.createHash('sha256').update(clean).digest('hex'),
    output_path: path.relative(ctx.root, logFile), started_at: startedAt, ended_at: now(),
  };
  appendEvent(ctx.root, ctx.runId, event);
  if (usedWaiver(event, today())) {
    appendEvent(ctx.root, ctx.runId, { type: 'decision', step, choice: `use waiver for ${name}`, reason: event.waiver.reason, alternatives: [] });
  }
  return { event, clean };
}

function git(ctx, ...args) {
  const res = spawnSync('git', args, { cwd: ctx.cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new TraceError(`git ${args.join(' ')} failed: ${(res.stderr || res.error?.message || '').trim()}`);
  return res.stdout.trim();
}

// Runs the three security scans as one gate 11 baseline. Unknown scans throw before any check is recorded.
// The sast scan reports only findings that are new since the run base, so a finding in unchanged code does not fail gate 11.
// semgrep --baseline-commit skips uncommitted edits, so a dirty work tree gets the full scan instead.
function cleanBase(ctx) {
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ctx.cwd, encoding: 'utf8' });
  if (dirty.status !== 0 || dirty.stdout.trim() !== '') return null;
  return runStart(readEvents(ctx.root, ctx.runId)).base;
}

function securityAll(ctx, step) {
  const project = readProjectConfig(ctx.root);
  const registry = parseYaml(fs.readFileSync(SECURITY_TOOLS_FILE, 'utf8'));
  const base = cleanBase(ctx);
  const resolved = SECURITY_CHECKS.map((name) => ({ name, security: resolveSecurityCheck(name, project.config, registry) }));
  const runs = resolved.map(({ name, security }) => {
    const { command, deltaBase } = deltaCommand(security, registry.checks?.[name]?.delta_args, base);
    return runCheck(ctx, step, command, { name, security, project, deltaBase });
  });
  const failed = runs.filter(({ event }) => event.exit_code !== 0 || event.version_ok === false);
  const exitCode = failed.length === 0 ? 0 : (failed.map(({ event }) => event.exit_code).find((code) => code !== 0) ?? 1);
  const failedText = failed.map(({ event, clean }) => `${event.security_check} (${event.check_id}) failed:\n${outputTail(clean)}\n`).join('');
  const checkIds = runs.map(({ event }) => event.check_id);
  return { exitCode, failedText, checkIds, failed: failed.map(({ event }) => event.security_check) };
}

// A repo with no commit yet has no head: the run then has no base.
const headCommit = (ctx) => spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: ctx.cwd, encoding: 'utf8' }).stdout?.trim() || null;

// "3 files changed, 40 insertions(+), 12 deletions(-)" counts 52 changed lines.
const changedLines = (shortstat) => [...shortstat.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((sum, m) => sum + Number(m[1]), 0);

const commands = {
  setup(ctx) {
    const added = ensureExcluded(ctx.cwd);
    assertNoSymlink(ctx.root, runsDir(ctx.root));
    fs.mkdirSync(runsDir(ctx.root), { recursive: true, mode: 0o700 });
    return { root: ctx.root, exclude_added: added, pruned: commands.prune(ctx) };
  },

  start(ctx, opts) {
    const harness = one(opts, 'harness');
    const map = loadHarnessMap(harness, HARNESS_DIR);
    const { installed, verified } = adapterVerified(map);
    const runId = newRunId();
    appendEvent(ctx.root, runId, {
      type: 'run_start', recipe: one(opts, 'recipe'), lane: choice(one(opts, 'lane'), ['full', 'light', 'quick'], 'lane'),
      harness, harness_version: installed, adapter_verified: verified, task: one(opts, 'task'),
      resumes: one(opts, 'resumes', { required: false }), config_sha256: readProjectConfig(ctx.root).sha256, base: headCommit(ctx),
    });
    setCurrentRun(ctx.root, runId);
    return { run_id: runId, adapter_verified: verified, harness_version: installed, verified_with: String(map.verified_with?.version ?? '') };
  },

  // detect + setup + start in one call. The run_start event pins the current commit as <base>.
  begin(ctx, opts) {
    const harness = one(opts, 'harness', { required: false }) ?? commands.detect().harness;
    if (!harness) throw new TraceError('no harness detected; pass --harness <name>');
    commands.setup(ctx);
    const started = commands.start(ctx, { ...opts, harness: [harness] });
    const base = runStart(readEvents(ctx.root, started.run_id)).base;
    return { run_id: started.run_id, harness, base, adapter_verified: started.adapter_verified };
  },

  // The head checks in one call: the test command, the diff for the Critic, the size for gate 7, and the gate 11 scans.
  'verify-head'(ctx, opts, tail) {
    if (tail.length === 0) throw new TraceError('verify-head needs the test command after "--"');
    const given = one(opts, 'base', { required: false }) ?? runStart(readEvents(ctx.root, ctx.runId)).base;
    if (!given) throw new TraceError('the run has no base commit; pass --base <commit>');
    // Resolve to a commit id, so a value such as "--output=<file>" never reaches git diff as an option.
    const base = git(ctx, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${given}^{commit}`);
    const head = git(ctx, 'rev-parse', 'HEAD');
    const tests = runCheck(ctx, 'head', tail, null).event;
    const diff = runCheck(ctx, 'diff', ['git', 'diff', `${base}..${head}`], null).event;
    const size = runCheck(ctx, 'diff', ['git', 'diff', '--shortstat', `${base}..${head}`], null);
    const lines = changedLines(size.clean);
    const security = securityAll(ctx, 'pass');
    const exitCode = tests.exit_code !== 0 ? tests.exit_code : security.exitCode;
    const summary = {
      base, head, tests: { check_id: tests.check_id, exit_code: tests.exit_code }, diff_path: diff.output_path,
      changed_lines: lines, size_check: size.event.check_id, critic_by_size: lines > CRITIC_LINE_LIMIT,
      gate_11: security.checkIds.join(','), security_failed: security.failed,
    };
    const testText = tests.exit_code === 0 ? '' : `tests (${tests.check_id}) failed:\n${outputTail(fs.readFileSync(path.join(ctx.root, tests.output_path), 'utf8'))}\n`;
    return { exitCode, text: `${testText}${security.failedText}${JSON.stringify(summary)}` };
  },

  // pass + end + report in one call. A refused pass ends nothing.
  finish(ctx, opts) {
    const status = choice(one(opts, 'status'), ['done', 'paused', 'failed'], 'status');
    if (status === 'done' && !['PASS', 'PASS+NOTES'].includes(one(opts, 'verdict'))) throw new TraceError('--status done needs --verdict PASS or PASS+NOTES');
    const { verdict } = commands.pass(ctx, opts);
    commands.end(ctx, { status: [status] });
    const [run] = commands.report(ctx, {}).runs;
    return { run_id: ctx.runId, verdict, status, flags: run.flags };
  },

  brief(ctx, opts) {
    const start = runStart(readEvents(ctx.root, ctx.runId));
    const map = loadHarnessMap(start.harness, HARNESS_DIR);
    const role = loadRole(one(opts, 'role'), AGENTS_DIR);
    const fields = Object.create(null);
    for (const pair of many(opts, 'field')) {
      const at = pair.indexOf('=');
      if (at < 1) throw new TraceError(`bad --field "${pair}"; use name=value`);
      const name = pair.slice(0, at);
      if (Object.hasOwn(fields, name)) throw new TraceError(`--field ${redact(name)} is given more than once`);
      fields[name] = redact(pair.slice(at + 1));
    }
    validateBriefFields(role, Object.keys(fields));
    const trusted = many(opts, 'trusted');
    validateTrusted(fields, trusted);
    const model = resolveModel({ role: role.name, tier: role.tier, config: loadProjectConfig(ctx.root), map });
    const delegationId = newId('d');
    appendEvent(ctx.root, ctx.runId, {
      type: 'delegation', delegation_id: delegationId, step: one(opts, 'step'), role: role.name, tier: role.tier,
      model_requested: model.model, model_source: model.source,
      mode: choice(one(opts, 'mode', { required: false }) ?? 'subagent', ['subagent', 'inline'], 'mode'),
      enforcement: enforcementFor(role, map, start.adapter_verified),
      brief_fields: Object.keys(fields).map((name) => ({ name, trust: trusted.includes(name) ? 'trusted' : 'untrusted' })),
      started_at: now(),
    });
    return { text: renderBrief({ role, delegationId, model, fields, trusted, marker: crypto.randomBytes(16).toString('hex'), tracePath: TRACE_FILE, untrustedFile: UNTRUSTED_FILE, runId: ctx.runId, root: ctx.root }) };
  },

  close(ctx, opts) {
    const events = readEvents(ctx.root, ctx.runId);
    const id = one(opts, 'id');
    const delegation = events.find((e) => e.type === 'delegation' && e.delegation_id === id);
    if (!delegation) throw new TraceError(`unknown delegation: ${id}`);
    if (events.some((e) => e.type === 'delegation_close' && e.delegation_id === id)) throw new TraceError(`delegation ${id} is already closed`);
    const verdict = one(opts, 'verdict', { required: delegation.role === 'verifier' });
    if (verdict !== null) choice(verdict, ['PASS', 'PASS+NOTES', 'FAIL'], 'verdict');
    appendEvent(ctx.root, ctx.runId, {
      type: 'delegation_close', delegation_id: id, ended_at: now(), outcome: one(opts, 'outcome'), verdict,
      tokens_in: null, tokens_out: null, cost: null, cost_source: null,
    });
    return { delegation_id: id, closed: true };
  },

  check(ctx, opts, tail) {
    const step = one(opts, 'step');
    const securityName = one(opts, 'security', { required: false });
    if (securityName && tail.length > 0) throw new TraceError('check takes --security or a command after "--", not both');
    if (!securityName) {
      if (tail.length === 0) throw new TraceError('check needs a command after "--" or --security <name>');
      return singleCheckResult(runCheck(ctx, step, tail, null));
    }
    if (securityName === ALL_SCANS) {
      const { exitCode, failedText, checkIds, failed } = securityAll(ctx, step);
      return { exitCode, text: `${failedText}${JSON.stringify({ check_ids: checkIds, gate_11: checkIds.join(','), exit_code: exitCode, failed })}` };
    }
    const project = readProjectConfig(ctx.root);
    const registry = parseYaml(fs.readFileSync(SECURITY_TOOLS_FILE, 'utf8'));
    const security = resolveSecurityCheck(securityName, project.config, registry);
    const { command, deltaBase } = deltaCommand(security, registry.checks?.[securityName]?.delta_args, cleanBase(ctx));
    return singleCheckResult(runCheck(ctx, step, command, { name: securityName, security, project, deltaBase }));
  },

  decision(ctx, opts) {
    appendEvent(ctx.root, ctx.runId, {
      type: 'decision', step: one(opts, 'step'), choice: one(opts, 'choice'), reason: one(opts, 'reason'), alternatives: many(opts, 'alternative'),
    });
    return { recorded: true };
  },

  pass(ctx, opts) {
    const markdown = fs.readFileSync(PASS_FILE, 'utf8');
    const profiles = parseProfiles(markdown);
    const profile = one(opts, 'profile');
    if (!profiles[profile]) throw new TraceError(`unknown profile: ${profile}`);
    const verdict = choice(one(opts, 'verdict'), ['PASS', 'PASS+NOTES', 'FAIL'], 'verdict');
    const results = parseGateArgs(many(opts, 'gate'));
    const verifierId = one(opts, 'verifier', { required: false });
    const errors = validatePass({
      events: readEvents(ctx.root, ctx.runId), gates: parseGates(markdown), profileGates: profiles[profile],
      results, profile, verdict, verifierId, today: today(),
    });
    if (errors.length) throw new TraceError(`pass refused:\n- ${errors.join('\n- ')}`);
    appendEvent(ctx.root, ctx.runId, { type: 'pass', profile, gates: results, verdict, verifier: verifierId });
    return { recorded: true, verdict };
  },

  end(ctx, opts) {
    const status = choice(one(opts, 'status'), ['done', 'paused', 'failed'], 'status');
    const last = readEvents(ctx.root, ctx.runId).filter((e) => e.type === 'pass').at(-1);
    if (status === 'done' && !['PASS', 'PASS+NOTES'].includes(last?.verdict)) {
      throw new TraceError('done needs a pass with verdict PASS or PASS+NOTES as the last pass; use paused or failed');
    }
    appendEvent(ctx.root, ctx.runId, { type: 'run_end', status });
    return { run_id: ctx.runId, ended: true };
  },

  report(ctx, opts) {
    const runIds = one(opts, 'all', { required: false, flag: true }) ? listRuns(ctx.root) : [one(opts, 'run', { required: false }) ?? currentRun(ctx.root)];
    const withheld = withheldByRole();
    const checkRequiredGates = fs.existsSync(PASS_FILE)
      ? Object.entries(parseGates(fs.readFileSync(PASS_FILE, 'utf8'))).filter(([, gate]) => gate.checkRequired).map(([number]) => Number(number))
      : [];
    const runs = runIds.map((id) => summarizeRun(readEvents(ctx.root, id), { today: today(), withheldByRole: withheld, checkRequiredGates }));
    const waivers = (loadProjectConfig(ctx.root).security?.waivers ?? []).map((w) => ({ check: w.check, expires: w.expires, ...waiverStatus(w, today()) }));
    return { runs, waivers };
  },

  prune(ctx) {
    const configured = loadProjectConfig(ctx.root).ledger?.retention_days ?? 30;
    const days = typeof configured === 'number' ? configured : Number.NaN;
    if (!Number.isInteger(days) || days < 1) throw new TraceError(`${CONFIG_FILE}: ledger.retention_days must be an integer of at least 1, not ${JSON.stringify(configured)}`);
    const cutoff = Date.now() - days * 86_400_000;
    const dir = runsDir(ctx.root);
    assertNoSymlink(ctx.root, dir);
    let deleted = 0;
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        for (const name of fs.readdirSync(path.join(dir, entry.name)).filter((n) => n.endsWith('.log'))) {
          const file = path.join(dir, entry.name, name);
          const stat = fs.lstatSync(file);
          if (stat.isFile() && stat.mtimeMs < cutoff) {
            fs.rmSync(file);
            deleted += 1;
          }
        }
      }
    }
    return { deleted, retention_days: days };
  },

  detect() {
    const candidates = fs.readdirSync(HARNESS_DIR).filter((f) => f.endsWith('.md'))
      .map((f) => loadHarnessMap(f.slice(0, -3), HARNESS_DIR))
      .filter((map) => map.detect_env && process.env[map.detect_env] !== undefined)
      .map((map) => map.harness);
    return { harness: candidates.length === 1 ? candidates[0] : null, candidates };
  },
};

export function main(argv, cwd = process.cwd()) {
  const { command, opts, tail } = parseCli(argv);
  const handler = commands[command];
  if (!handler) throw new TraceError(`unknown command: ${command ?? '(none)'}; use one of: ${Object.keys(commands).join(', ')}`);
  const root = command === 'detect' ? cwd : mainRoot(cwd);
  if (RUNLESS.has(command)) return handler({ cwd, root, runId: null }, opts, tail);
  const runId = one(opts, 'run', { required: false }) ?? currentRun(root);
  // readEvents throws for a run that was never started, so no handler can create a phantom ledger.
  const events = readEvents(root, runId);
  runStart(events);
  if (events.some((e) => e.type === 'run_end')) throw new TraceError(`run ${runId} has already ended`);
  return handler({ cwd, root, runId }, opts, tail);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = main(process.argv.slice(2));
    console.log(result.text ?? JSON.stringify(result));
    process.exitCode = result.exitCode ?? 0;
  } catch (error) {
    const label = error instanceof TraceError ? 'trace' : 'trace: internal error';
    console.error(`${label}: ${redact(String(error?.message ?? error))}`);
    process.exitCode = 2;
  }
}

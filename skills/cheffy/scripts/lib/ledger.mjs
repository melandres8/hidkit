import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact.mjs';

const SCHEMA_VERSION = 1;
export class TraceError extends Error {}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new TraceError(`not a git repository: ${cwd}`);
  }
}

export function mainRoot(cwd) {
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return path.basename(common) === '.git' ? path.dirname(common) : git(cwd, ['rev-parse', '--show-toplevel']);
}

export function ensureExcluded(cwd) {
  const file = git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude']);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes('.hidkit/')) return false;
  fs.appendFileSync(file, `${current === '' || current.endsWith('\n') ? '' : '\n'}.hidkit/\n`);
  return true;
}

export const hidkitDir = (root) => path.join(root, '.hidkit');
export const runsDir = (root) => path.join(hidkitDir(root), 'runs');

// Ids become path segments, so anything outside this shape could escape the runs directory.
const RUN_ID = /^r-[A-Za-z0-9-]+$/;
const CHECK_ID = /^c-[A-Za-z0-9-]+$/;

function validId(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TraceError(`invalid ${label} id: ${value}`);
  return value;
}

export const runFile = (root, runId) => path.join(runsDir(root), `${validId(runId, RUN_ID, 'run')}.jsonl`);
export const checkLogFile = (root, runId, checkId) => path.join(runsDir(root), validId(runId, RUN_ID, 'run'), `${validId(checkId, CHECK_ID, 'check')}.log`);
const currentRunFile = (root) => path.join(hidkitDir(root), 'current-run');

function assertIgnored(root, file) {
  const rel = path.relative(root, file);
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new TraceError(`${rel} is not ignored by git; run "trace setup" first`);
  }
}

// Refuses when .hidkit or any directory below it on the way to `dir` is a symlink, so no write or delete leaves the ledger.
export function assertNoSymlink(root, dir) {
  const parts = path.relative(hidkitDir(root), dir).split(path.sep).filter((p) => p && p !== '.');
  let current = hidkitDir(root);
  for (const part of ['', ...parts]) {
    current = part ? path.join(current, part) : current;
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    if (stat.isSymbolicLink()) throw new TraceError(`refusing to use a symlink: ${path.relative(root, current)}`);
  }
}

export function writeSecure(root, file, content, { append = false } = {}) {
  assertIgnored(root, file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let dir = path.dirname(file); dir.startsWith(hidkitDir(root)); dir = path.dirname(dir)) {
    if (fs.lstatSync(dir).isSymbolicLink()) throw new TraceError(`refusing to write through a symlink: ${path.relative(root, dir)}`);
    fs.chmodSync(dir, 0o700);
  }
  // O_NOFOLLOW makes the open itself refuse a symlink, so a check-then-open race cannot redirect the write.
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | (append ? fs.constants.O_APPEND : fs.constants.O_TRUNC) | (fs.constants.O_NOFOLLOW ?? 0);
  let fd;
  try {
    fd = fs.openSync(file, flags, 0o600);
  } catch (err) {
    if (err.code === 'ELOOP' || err.code === 'EMLINK') throw new TraceError(`refusing to write through a symlink: ${path.relative(root, file)}`);
    throw err;
  }
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

export const newId = (prefix) => `${prefix}-${crypto.randomBytes(3).toString('hex')}`;

export function newRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `r-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

const SECRET_KEY = /secret|token|key|password|passwd|authorization|credential|cookie/i;

// Under a secret-looking key every string leaf is replaced, whatever the nesting.
function redactValue(value, env, secret = false) {
  if (typeof value === 'string') return secret ? '[REDACTED:assignment]' : redact(value, env);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, env, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k, env), redactValue(v, env, secret || SECRET_KEY.test(k))]));
  }
  return value;
}

export function appendEvent(root, runId, event, env = process.env) {
  const record = { ...redactValue(event, env), schema_version: SCHEMA_VERSION, run_id: runId, at: new Date().toISOString() };
  writeSecure(root, runFile(root, runId), `${JSON.stringify(record)}\n`, { append: true });
  return record;
}

export function readEvents(root, runId) {
  const file = runFile(root, runId);
  if (!fs.existsSync(file)) throw new TraceError(`unknown run: ${runId}`);
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function listRuns(root) {
  const dir = runsDir(root);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)).filter((id) => RUN_ID.test(id)).sort() : [];
}

export const setCurrentRun = (root, runId) => writeSecure(root, currentRunFile(root), `${validId(runId, RUN_ID, 'run')}\n`);

export function currentRun(root) {
  const file = currentRunFile(root);
  if (!fs.existsSync(file)) throw new TraceError('no current run; pass --run or run "trace start"');
  return fs.readFileSync(file, 'utf8').trim();
}

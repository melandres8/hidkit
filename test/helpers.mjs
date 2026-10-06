import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRACE = fileURLToPath(new URL('../skills/cheffy/scripts/trace.mjs', import.meta.url));
export const FIXTURE_PLUGIN = fileURLToPath(new URL('./fixtures/plugin/', import.meta.url));

const tempRepos = [];

// Removes every dir made by tempRepo() or tempDir() plus its siblings such as `<repo>-wt` (linked worktrees, outside dirs).
export function cleanupTempRepos() {
  for (const dir of tempRepos.splice(0)) {
    const parent = path.dirname(dir);
    const prefix = `${path.basename(dir)}-`;
    for (const name of fs.readdirSync(parent)) {
      if (name.startsWith(prefix)) fs.rmSync(path.join(parent, name), { recursive: true, force: true });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A plain temp dir that cleanupTempRepos() removes.
export function tempDir(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempRepos.push(dir);
  return dir;
}

export function tempRepo() {
  const dir = tempDir('hidkit-repo-');
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=test@example.com', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

export function trace(cwd, args, env = {}) {
  const res = spawnSync(process.execPath, [TRACE, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HIDKIT_PLUGIN_ROOT: FIXTURE_PLUGIN, ...env },
  });
  return { code: res.status, out: res.stdout, err: res.stderr, json: () => JSON.parse(res.stdout.trim().split('\n').at(-1)) };
}

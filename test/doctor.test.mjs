import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, platformKey } from '../skills/cheffy/scripts/doctor.mjs';
import { parseYaml } from '../skills/cheffy/scripts/lib/yaml.mjs';

test('reports ok, missing, and mismatched tools with install steps', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hidkit-doctor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  const registry = {
    tools: {
      a: { version: '1.0.0', version_command: ['a'], install: { 'darwin-arm64': { command: 'install a' } } },
      b: { version: '2.0.0', version_command: ['b'], install: { 'darwin-arm64': { command: 'install b' } } },
      c: { version: '3.0.0', version_command: ['c'], install: { 'darwin-arm64': { command: 'install c' } } },
    },
    ecosystems: { node: ['package-lock.json'], go: ['go.sum'] },
  };
  const versions = { a: '1.0.0', b: null, c: '3.1.0', claude: '2.1.262' };
  const result = diagnose({
    registry, versionOf: (cmd) => versions[cmd[0]] ?? null, platform: 'darwin-arm64', root,
    harnessMaps: [{ harness: 'claude-code', verified_with: { version: '2.1.261' }, version_command: ['claude'] }],
  });
  assert.deepEqual(result, {
    tools: [
      { name: 'a', pinned: '1.0.0', installed: '1.0.0', status: 'ok', install: null },
      { name: 'b', pinned: '2.0.0', installed: null, status: 'missing', install: { command: 'install b' } },
      { name: 'c', pinned: '3.0.0', installed: '3.1.0', status: 'mismatch', install: { command: 'install c' } },
    ],
    harnesses: [{ harness: 'claude-code', verified_with: '2.1.261', installed: '2.1.262', status: 'unverified' }],
    ecosystems: ['node'],
    ok: false,
  });
  assert.equal(platformKey('darwin', 'arm64'), 'darwin-arm64');
  assert.equal(platformKey('linux', 'x64'), 'linux-x64');
});

test('the real registry pins and verifies every install on the four supported platforms', () => {
  const registry = parseYaml(fs.readFileSync(new URL('../skills/cheffy/security-tools.yaml', import.meta.url), 'utf8'));
  for (const name of ['secrets', 'dependencies', 'sast']) {
    const check = registry.checks[name];
    assert.ok(Array.isArray(check.command) && check.command.length > 0, `${name} command`);
    const tool = registry.tools[check.tool];
    assert.match(String(tool.version), /^\d+\.\d+\.\d+$/, `${check.tool} version`);
    for (const platform of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64']) {
      const install = tool.install[platform];
      assert.ok(install?.command, `${check.tool} ${platform} command`);
      assert.match(String(install.sha256), /^[0-9a-f]{64}$/, `${check.tool} ${platform} sha256`);
      // The command itself verifies the download: a checksum of the artifact, or pip with hashes for every package.
      assert.ok(install.command.includes(install.sha256) || install.command.includes('--require-hashes'), `${check.tool} ${platform} verifies`);
      assert.ok(!/pipx install|pip install(?!.*--require-hashes)/.test(install.command), `${check.tool} ${platform} has no unverified pip install`);
    }
  }
});

test('the real registry scans ignore allowlists that the scanned repository controls', () => {
  const registry = parseYaml(fs.readFileSync(new URL('../skills/cheffy/security-tools.yaml', import.meta.url), 'utf8'));
  const { secrets, dependencies, sast } = registry.checks;
  const configOf = (command) => command[command.indexOf('--config') + 1];
  assert.equal(configOf(secrets.command), '{skill-dir}/gitleaks.toml');
  assert.ok(secrets.command.includes('--ignore-gitleaks-allow'));
  assert.deepEqual(secrets.suppression_files, ['.gitleaksignore']);
  assert.equal(configOf(dependencies.command), '{skill-dir}/osv-scanner.toml');
  assert.ok(sast.command.includes('--disable-nosem'));
  assert.deepEqual(sast.suppression_files, ['**/.semgrepignore']);
  const settings = (file) => fs.readFileSync(new URL(`../skills/cheffy/${file}`, import.meta.url), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  assert.deepEqual(settings('gitleaks.toml'), ['title = "Hidkit"', '[extend]', 'useDefault = true']);
  assert.deepEqual(settings('osv-scanner.toml'), []);
});

test('the semgrep lock pins the registry version with hashes for every package', () => {
  const registry = parseYaml(fs.readFileSync(new URL('../skills/cheffy/security-tools.yaml', import.meta.url), 'utf8'));
  const lock = fs.readFileSync(new URL('../skills/cheffy/semgrep-requirements.txt', import.meta.url), 'utf8');
  assert.match(lock, new RegExp(`^semgrep==${registry.tools.semgrep.version.replaceAll('.', '\\.')} \\\\$`, 'm'));
  const pins = lock.split('\n').filter((l) => /^[a-z0-9]/i.test(l));
  assert.ok(pins.length > 1);
  for (const pin of pins) assert.match(pin, /^[\w.-]+==[\w.]+( ;.*)? \\$/, `${pin} is pinned and has hashes`);
  assert.ok(lock.includes(`--hash=sha256:${registry.tools.semgrep.install['linux-x64'].sha256}`));
});

test('doctor resolves {skill-dir} in an install command', () => {
  const registry = { tools: { s: { version: '1.0.0', version_command: ['s'], install: { 'linux-x64': { command: 'pip install -r "{skill-dir}/req.txt"' } } } } };
  const result = diagnose({ registry, versionOf: () => null, platform: 'linux-x64', skillDir: '/plugin/skills/cheffy' });
  assert.equal(result.tools[0].install.command, 'pip install -r "/plugin/skills/cheffy/req.txt"');
});

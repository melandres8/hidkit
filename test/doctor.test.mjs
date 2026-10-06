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

test('the real registry is complete for both supported platforms', () => {
  const registry = parseYaml(fs.readFileSync(new URL('../skills/cheffy/security-tools.yaml', import.meta.url), 'utf8'));
  for (const name of ['secrets', 'dependencies', 'sast']) {
    const check = registry.checks[name];
    assert.ok(Array.isArray(check.command) && check.command.length > 0, `${name} command`);
    const tool = registry.tools[check.tool];
    assert.match(String(tool.version), /^\d+\.\d+\.\d+$/, `${check.tool} version`);
    for (const platform of ['darwin-arm64', 'linux-x64']) {
      const install = tool.install[platform];
      assert.ok(install?.command, `${check.tool} ${platform} command`);
      assert.match(String(install.sha256), /^[0-9a-f]{64}$/, `${check.tool} ${platform} sha256`);
    }
  }
});

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterVerified, installedVersion, loadHarnessMap } from './lib/config.mjs';
import { HARNESS_DIR, SECURITY_TOOLS_FILE } from './lib/paths.mjs';
import { parseYaml } from './lib/yaml.mjs';

export const platformKey = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`;

// An install command can name a file next to the registry, such as a hash-locked requirements file, as {skill-dir}.
const withSkillDir = (install, skillDir) => (install ? { ...install, command: install.command.replaceAll('{skill-dir}', skillDir) } : null);

export function diagnose({ registry, versionOf = installedVersion, platform = platformKey(), harnessMaps = [], root = process.cwd(), skillDir = path.dirname(SECURITY_TOOLS_FILE) }) {
  const tools = Object.entries(registry.tools ?? {}).map(([name, tool]) => {
    const installed = versionOf(tool.version_command) ?? null;
    const pinned = String(tool.version);
    const status = installed === null ? 'missing' : installed === pinned ? 'ok' : 'mismatch';
    return { name, pinned, installed, status, install: status === 'ok' ? null : withSkillDir(tool.install?.[platform] ?? null, skillDir) };
  });
  const harnesses = harnessMaps.map((map) => {
    const { installed, verified } = adapterVerified(map, versionOf);
    return { harness: map.harness, verified_with: String(map.verified_with?.version), installed, status: installed === null ? 'missing' : verified ? 'ok' : 'unverified' };
  });
  const ecosystems = Object.entries(registry.ecosystems ?? {})
    .filter(([, files]) => files.some((f) => fs.existsSync(path.join(root, f))))
    .map(([name]) => name);
  return { tools, harnesses, ecosystems, ok: tools.every((t) => t.status === 'ok') };
}

function print(result) {
  for (const t of result.tools) {
    console.log(`${t.name} ${t.pinned}: ${t.status}${t.installed && t.status !== 'ok' ? ` (installed ${t.installed})` : ''}`);
    if (t.install) console.log(`  run yourself: ${t.install.command}\n  sha256: ${t.install.sha256}`);
    else if (t.status !== 'ok') console.log(`  no pinned install step for ${platformKey()}`);
  }
  for (const h of result.harnesses) console.log(`harness ${h.harness}: ${h.status} (verified with ${h.verified_with}, installed ${h.installed ?? 'none'})`);
  console.log(`ecosystems: ${result.ecosystems.join(', ') || 'none detected'}`);
  console.log(result.ok ? 'doctor: ok' : 'doctor: action needed. Cheffy does not install tools; run the commands above yourself.');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = parseYaml(fs.readFileSync(SECURITY_TOOLS_FILE, 'utf8'));
  const harnessMaps = fs.readdirSync(HARNESS_DIR).filter((f) => f.endsWith('.md')).map((f) => loadHarnessMap(f.slice(0, -3), HARNESS_DIR));
  const result = diagnose({ registry, harnessMaps });
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else print(result);
  process.exitCode = result.ok ? 0 : 1;
}

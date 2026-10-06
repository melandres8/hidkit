import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from './frontmatter.mjs';
import { TraceError } from './ledger.mjs';
import { YamlError, parseYaml } from './yaml.mjs';

const SEMVER = /\d+\.\d+\.\d+/;
export const CONFIG_FILE = 'hidkit.config.yaml';

// The hash covers the exact bytes that the parser reads. It is null when the file is absent.
export function readProjectConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return { config: {}, sha256: null };
  const bytes = fs.readFileSync(file);
  let config;
  try {
    config = parseYaml(bytes.toString('utf8')) ?? {};
  } catch (error) {
    if (error instanceof YamlError) throw new TraceError(`${CONFIG_FILE}: ${error.message}`);
    throw error;
  }
  // An external role command needs a run step that phase 1 does not have, so refuse it before any work starts.
  for (const [role, override] of Object.entries(config.roles ?? {})) {
    if (override?.external !== undefined) {
      throw new TraceError(`${CONFIG_FILE}: roles.${role}.external is not available in phase 1; remove it or set roles.${role}.model`);
    }
  }
  return { config, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

export const loadProjectConfig = (root) => readProjectConfig(root).config;

export function loadHarnessMap(name, harnessDir) {
  const file = path.join(harnessDir, `${name}.md`);
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) throw new TraceError(`unknown harness: ${name}`);
  const { data } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!data) throw new TraceError(`harness map ${name} has no frontmatter`);
  return data;
}

export function installedVersion(command) {
  try {
    const out = execFileSync(command[0], command.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.match(SEMVER)?.[0] ?? null;
  } catch {
    return null;
  }
}

export function adapterVerified(map, versionOf = installedVersion) {
  const installed = versionOf(map.version_command) ?? null;
  return { installed, verified: installed !== null && installed === String(map.verified_with?.version) };
}

export function resolveModel({ role, tier, config, map }) {
  const override = config.roles?.[role] ?? {};
  if (override.model) return { model: override.model, source: 'config' };
  if (config.tiers?.[tier]) return { model: config.tiers[tier], source: 'config' };
  if (map.model_selection && map.tiers?.[tier]) return { model: map.tiers[tier], source: 'harness-map' };
  return { model: 'inherit', source: 'inherited' };
}

import path from 'node:path';
import { installedVersion } from './config.mjs';
import { TraceError } from './ledger.mjs';
import { SECURITY_TOOLS_FILE } from './paths.mjs';

const WAIVER_KEYS = ['check', 'reason', 'approved_by', 'approved_on', 'expires'];
const MAX_WAIVER_DAYS = 90;

// Returns epoch ms for a real ISO calendar date, or an error string. The UTC round trip rejects 2026-02-30.
function parseIsoDate(label, value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: `${label} "${value}" is not an ISO date (YYYY-MM-DD)` };
  const [y, m, d] = value.split('-').map(Number);
  const time = Date.UTC(y, m - 1, d);
  if (new Date(time).toISOString().slice(0, 10) !== value) return { error: `${label} "${value}" is not a real calendar date` };
  return { time };
}

export function waiverStatus(waiver, today) {
  const errors = WAIVER_KEYS.filter((key) => !waiver?.[key]).map((key) => `waiver is missing ${key}`);
  if (errors.length) return { active: false, errors };
  const approved = parseIsoDate('waiver approved_on', waiver.approved_on);
  const expires = parseIsoDate('waiver expires', waiver.expires);
  const now = parseIsoDate('today', today);
  for (const date of [approved, expires, now]) if (date.error) errors.push(date.error);
  if (errors.length) return { active: false, errors };
  if (approved.time > now.time) errors.push(`waiver for ${waiver.check} was approved on ${waiver.approved_on}, which is after today (${today})`);
  const days = (expires.time - approved.time) / 86_400_000;
  if (days < 0) errors.push(`waiver for ${waiver.check} expires before it was approved`);
  else if (days > MAX_WAIVER_DAYS) errors.push(`waiver for ${waiver.check} spans ${days} days; the maximum is ${MAX_WAIVER_DAYS}`);
  if (now.time > expires.time) errors.push(`waiver for ${waiver.check} expired on ${waiver.expires}`);
  return { active: errors.length === 0, errors };
}

// A registry command names Hidkit config files as {skill-dir}: the directory of the registry file.
export function resolveSecurityCheck(name, config, registry, versionOf = installedVersion, skillDir = path.dirname(SECURITY_TOOLS_FILE)) {
  const override = config.security?.checks?.[name];
  const definition = registry.checks?.[name];
  if (!override && !definition) throw new TraceError(`unknown security check: ${name}`);
  const waiver = (config.security?.waivers ?? []).find((w) => w.check === name) ?? null;
  if (override) {
    if (!Array.isArray(override) || override.length === 0) throw new TraceError(`security.checks.${name} must be a command list`);
    return { command: override, source: 'config', toolName: null, installed: null, pinned: null, versionOk: null, waiver };
  }
  const tool = registry.tools?.[definition.tool];
  if (!tool) throw new TraceError(`security-tools.yaml has no tool "${definition.tool}"`);
  const installed = versionOf(tool.version_command);
  const pinned = String(tool.version);
  const command = definition.command.map((arg) => String(arg).replaceAll('{skill-dir}', skillDir));
  const suppressionFiles = (definition.suppression_files ?? []).map(String);
  return { command, source: 'registry', toolName: definition.tool, installed, pinned, versionOk: installed === null ? null : installed === pinned, waiver, suppressionFiles };
}

// A registry scan with delta_args reports only findings that are new since <base>: the args go before the scan target.
// Without a base, or for a config override, the command stays as it is.
export function deltaCommand(security, deltaArgs, base) {
  const command = security.command.map(String);
  if (!base || security.source !== 'registry' || !Array.isArray(deltaArgs) || deltaArgs.length === 0) return { command, deltaBase: null };
  const args = deltaArgs.map((arg) => String(arg).replaceAll('{base}', base));
  return { command: [...command.slice(0, -1), ...args, command.at(-1)], deltaBase: base };
}

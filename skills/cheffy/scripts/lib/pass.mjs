import { TraceError } from './ledger.mjs';
import { waiverStatus } from './security.mjs';

const GATE_ROW = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*((?:MUST|SHOULD)[^|]*?)\s*\|\s*(yes|no)\s*\|/;
const PROFILE_ROW = /^\|\s*`([a-z-]+)`\s*\|\s*([\d,\s]+?)\s*\|/;
const RESULT = /^(\d+)=(PASS|FAIL|NA)(?::([\s\S]*))?$/;
const SECURITY_GATE_NAME = /^Security\b/;
export const SECURITY_CHECKS = ['secrets', 'dependencies', 'sast'];

const section = (markdown, title) => markdown.split(/^## /m).find((s) => s.startsWith(title)) ?? '';
const ids = (evidence) => evidence.split(',').map((s) => s.trim()).filter(Boolean);

export function parseGates(markdown) {
  const gates = {};
  for (const line of section(markdown, 'Gates').split('\n')) {
    const m = line.match(GATE_ROW);
    if (m) gates[Number(m[1])] = { name: m[2], level: m[3], checkRequired: m[4] === 'yes', naAllowed: m[3] !== 'MUST' };
  }
  return gates;
}

export function parseProfiles(markdown) {
  const profiles = {};
  for (const line of section(markdown, 'Profiles').split('\n')) {
    const m = line.match(PROFILE_ROW);
    if (m) profiles[m[1]] = m[2].split(',').map((s) => Number(s.trim()));
  }
  return profiles;
}

export function parseGateArgs(args) {
  const results = {};
  for (const arg of args) {
    const m = RESULT.exec(arg);
    if (!m || (m[1].length > 1 && m[1].startsWith('0'))) throw new TraceError(`bad --gate "${arg}"; use N=PASS:<check ids>, N=FAIL:<reason>, or N=NA:<reason>`);
    if (Number(m[1]) in results) throw new TraceError(`duplicate --gate for gate ${Number(m[1])}`);
    results[Number(m[1])] = { result: m[2], evidence: (m[3] ?? '').trim() };
  }
  return results;
}

const passedOnItsOwn = (check) => check.exit_code === 0 && check.version_ok !== false;

// A waiver covers only the security check it names; it never excuses a repo gate.
const waiverCovers = (check, today) => Boolean(check.security_check) && check.waiver?.check === check.security_check && waiverStatus(check.waiver, today).active;

export const checkPassed = (check, today) => passedOnItsOwn(check) || waiverCovers(check, today);

// True when the check passed only because of its waiver.
export const usedWaiver = (check, today) => !passedOnItsOwn(check) && waiverCovers(check, today);

export function validatePass({ events, gates, profileGates, results, profile, verdict, verifierId, today }) {
  const errors = [];
  const checks = new Map(events.filter((e) => e.type === 'check').map((e) => [e.check_id, e]));
  const closeEvents = events.filter((e) => e.type === 'delegation_close');
  const closes = new Map(closeEvents.map((e) => [e.delegation_id, e]));
  const delegations = events.filter((e) => e.type === 'delegation');
  for (const n of profileGates) if (!results[n]) errors.push(`gate ${n} has no result`);
  for (const [key, { result, evidence }] of Object.entries(results)) {
    const n = Number(key);
    const gate = gates[n];
    if (!gate) {
      errors.push(`gate ${n} is not defined in pass.md`);
      continue;
    }
    if (!profileGates.includes(n)) errors.push(`gate ${n} is not in profile ${profile}`);
    if (result === 'NA' && !gate.naAllowed) errors.push(`gate ${n} cannot be NA`);
    if (result !== 'PASS' && !evidence) errors.push(`gate ${n} ${result} needs a reason`);
    if (result === 'PASS' && gate.checkRequired) {
      if (ids(evidence).length === 0) errors.push(`gate ${n} PASS needs check ids`);
      for (const id of ids(evidence)) {
        const check = checks.get(id);
        if (!check) errors.push(`gate ${n} cites unknown check ${id}`);
        else if (!checkPassed(check, today)) errors.push(`gate ${n} cites check ${id}, which did not pass`);
      }
      if (SECURITY_GATE_NAME.test(gate.name)) {
        const covered = new Set(ids(evidence).map((id) => checks.get(id)).filter((c) => c && checkPassed(c, today)).map((c) => c.security_check));
        for (const name of SECURITY_CHECKS) if (!covered.has(name)) errors.push(`gate ${n} PASS needs a passing ${name} check`);
      }
    }
  }
  if (verdict !== 'FAIL') {
    if (Object.values(results).some((r) => r.result === 'FAIL')) errors.push(`verdict ${verdict} with a FAIL gate`);
    for (const d of delegations) if (!closes.has(d.delegation_id)) errors.push(`delegation ${d.delegation_id} (${d.role}) is open`);
    const closeCounts = new Map();
    for (const c of closeEvents) closeCounts.set(c.delegation_id, (closeCounts.get(c.delegation_id) ?? 0) + 1);
    for (const [id, count] of closeCounts) if (count > 1) errors.push(`delegation ${id} has more than one close`);
    const runIds = [...new Set(events.map((e) => e.run_id).filter(Boolean))];
    if (runIds.length > 1) errors.push(`events carry more than one run_id: ${runIds.join(', ')}`);
    if (profile === 'code') {
      const lastVerifier = delegations.filter((d) => d.role === 'verifier').at(-1);
      const verifier = delegations.find((d) => d.delegation_id === verifierId && d.role === 'verifier');
      if (!['PASS', 'PASS+NOTES'].includes(verifier && closes.get(verifier.delegation_id)?.verdict)) {
        errors.push('profile code needs a closed verifier delegation with verdict PASS or PASS+NOTES (--verifier)');
      } else if (verifier !== lastVerifier) {
        errors.push(`--verifier ${verifierId} is not the last verifier delegation of the run (${lastVerifier.delegation_id})`);
      }
    }
  }
  return errors;
}

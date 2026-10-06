import { checkPassed, usedWaiver } from './pass.mjs';

const evidenceIds = (evidence) => evidence.split(',').map((s) => s.trim()).filter((s) => /^c-[0-9a-z]+$/i.test(s));

export function summarizeRun(events, { today, withheldByRole = {}, checkRequiredGates = [] }) {
  const start = events.find((e) => e.type === 'run_start');
  const end = events.find((e) => e.type === 'run_end');
  const delegations = events.filter((e) => e.type === 'delegation');
  const closes = new Map(events.filter((e) => e.type === 'delegation_close').map((e) => [e.delegation_id, e]));
  const checks = new Map(events.filter((e) => e.type === 'check').map((e) => [e.check_id, e]));
  const passes = events.filter((e) => e.type === 'pass');
  const flags = [];
  if (!start) flags.push('missing run_start');
  if (!end) flags.push('missing run_end');
  for (const d of delegations) if (!closes.has(d.delegation_id)) flags.push(`open delegation ${d.delegation_id} (${d.role})`);
  for (const d of delegations) {
    const withheld = Object.hasOwn(withheldByRole, d.role) ? withheldByRole[d.role] : [];
    const bad = (d.brief_fields ?? []).map((f) => f.name).filter((n) => withheld.includes(n));
    if (bad.length) flags.push(`delegation ${d.delegation_id} brief contains withheld fields: ${bad.join(', ')}`);
  }
  const streaks = Object.create(null);
  for (const pass of passes) {
    for (const [gate, { result }] of Object.entries(pass.gates)) {
      streaks[gate] = result === 'FAIL' ? (streaks[gate] ?? 0) + 1 : 0;
      if (streaks[gate] === 3) flags.push(`gate ${gate} failed 3 passes in a row: apply Attack the Premise`);
    }
  }
  for (const pass of passes) {
    for (const [gate, { result, evidence }] of Object.entries(pass.gates)) {
      if (result !== 'PASS') continue;
      if (checkRequiredGates.includes(Number(gate)) && evidenceIds(evidence).length === 0) flags.push(`pass gate ${gate} has no check evidence`);
      for (const id of evidenceIds(evidence)) {
        const check = checks.get(id);
        if (!check) flags.push(`pass gate ${gate} cites missing check ${id}`);
        else if (!checkPassed(check, today)) flags.push(`pass gate ${gate} cites check ${id}, which did not pass`);
        else if (check.exit_code !== 0) flags.push(`pass gate ${gate} relies on a waiver for ${check.security_check}`);
      }
    }
  }
  for (const check of checks.values()) {
    if (!check.security_check) continue;
    const label = `check ${check.check_id} (${check.security_check})`;
    if (start && Object.hasOwn(start, 'config_sha256') && Object.hasOwn(check, 'config_sha256') && check.config_sha256 !== start.config_sha256) {
      flags.push(`${label} saw a hidkit.config.yaml that differs from run_start`);
    }
    if (check.security_source === 'config') flags.push(`${label} ran a config override, not the pinned registry tool`);
    const { changed = [], unchanged = [] } = check.suppression_files ?? {};
    if (changed.length) flags.push(`${label} did not run: suppression files changed since the run base: ${changed.join(', ')}`);
    if (unchanged.length) flags.push(`${label} applied suppression files from the repository: ${unchanged.join(', ')}`);
    if (check.ignored_targets?.length) flags.push(`${label} did not run: git ignores tracked scan targets: ${check.ignored_targets.join(', ')}`);
    if (usedWaiver(check, today)) {
      flags.push(`${label} passed only through its waiver: ${check.exit_code === 0 ? 'version mismatch' : `exit ${check.exit_code}`}`);
    }
  }
  const byRole = Object.create(null);
  for (const d of delegations) {
    const entry = (byRole[d.role] ??= { count: 0, models: Object.create(null), enforcement: Object.create(null) });
    entry.count += 1;
    entry.models[d.model_requested] = (entry.models[d.model_requested] ?? 0) + 1;
    entry.enforcement[d.enforcement] = (entry.enforcement[d.enforcement] ?? 0) + 1;
  }
  const measured = [...closes.values()].filter((c) => c.tokens_in != null || c.tokens_out != null).length;
  return {
    run_id: start?.run_id ?? events[0]?.run_id ?? null,
    recipe: start?.recipe ?? null,
    lane: start?.lane ?? null,
    adapter_verified: start?.adapter_verified ?? null,
    status: end?.status ?? 'open',
    delegations: delegations.length,
    by_role: Object.fromEntries(Object.entries(byRole).map(([role, e]) => [role, { count: e.count, models: { ...e.models }, enforcement: { ...e.enforcement } }])),
    checks: checks.size,
    failed_checks: [...checks.values()].filter((c) => c.exit_code !== 0).length,
    passes: passes.map((p) => ({ profile: p.profile, verdict: p.verdict, gates: p.gates })),
    usage_coverage: delegations.length ? measured / delegations.length : null,
    flags,
  };
}

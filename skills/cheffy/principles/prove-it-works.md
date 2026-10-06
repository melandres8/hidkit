---
name: prove-it-works
group: verification
---
# Prove It Works

## When

Apply this principle after you finish a task and before you declare it done. Also apply it when a role reports success.

## Rule

- Verify against the real artifact on the matching surface. Run the feature, read the actual value, or inspect the diff.
- MUST NOT accept a proxy as proof. Proxies are "it compiles", a file time, cached output, and a self-report.
- When a script can do the verification, write it. The same script gives the same comparison on every rerun.
- Run each verification command through `trace check`, so that the ledger holds a `check` event. Evidence comes from `check` events.
- Cite the check id for each claim of success. A claim with no check id has no evidence.
- If a check fails, doubt your way of observing before you doubt the system under test.
- Treat "inconclusive" as a failure.
- Read the actual value, not a derived or cached form of it.

## Why

Nobody knows whether unverified work is correct. A proxy looks cheaper than direct observation. A wrong inference costs more than the direct check. A script that a reviewer can rerun replaces trust with a result. See [Sequence Work into Verifiable Units](sequence-verifiable-units.md) for the order of checks.

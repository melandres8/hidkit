---
name: feature
profile: code
roles: [investigator, implementer, critic, verifier]
---
# Feature

Cheffy owns the design of the change, the decomposition of the work, and the evidence that the new behavior works.

## Steps

1. `<base>` is the commit that `trace begin` printed. Delegate to the Investigator in `how` mode over the affected subsystem. Set `scope` to its files. In the same turn, read the README and each doc that it links for this area. List each project rule that governs the change, with `file:line`.
2. Name the data shape and its organizing structure, as [Model the Domain](../principles/model-the-domain.md) requires. Keep each rule in one place, as [Single Source of Truth](../principles/single-source-of-truth.md) requires.
3. When the change crosses a function boundary, explore 2 or 3 designs, as [Exhaust the Design Space](../principles/exhaust-the-design-space.md) requires. Record the choice with `trace decision`.
4. Write the throughput checkpoint: blocking first steps, independent workstreams, shared mutable state, and the smallest safe decomposition. See [Separate Before Serializing Shared State](../principles/separate-before-serializing-shared-state.md). Record it with `trace decision`.
5. Delegate to one Implementer for each independent workstream, each in its own worktree, as the fan-out of [SKILL.md](../SKILL.md) says. Require tests first. Put the project rules in `success-criteria`, and derive the rest from [Laziness Protocol](../principles/laziness-protocol.md) and [Secure by Default](../principles/secure-by-default.md). Require commits in small ordered units. Merge each worker branch into the run branch, in the order of step 4. The merged tip is `<head>`.
6. At head, run `trace verify-head -- <test command>` with the new tests and the repo gates of [pass.md](../pass.md). Keep its ids as the head checks.
7. When gate 7 of [pass.md](../pass.md) requires the Critic, delegate to it in `quality` mode. Run the deep review of [security.md](../security.md) when it applies.
8. Act on each finding, as gate 7 says. Re-run the head checks after each fix.
9. Run the security baseline once, as gate 11 of [pass.md](../pass.md) says.
10. Run the new tests on base through `trace check`, in a worktree at `<base>` that holds the new test files. Expect a failure. Keep that id as the base check.
11. Delegate to the Verifier on the matching surface. Pass the base check id and the head check ids in `checks`. After a fix for a `FAIL`, apply the gate 11 rerun rule.
12. Run the pass (profile: code).

## Reply

- In the summary, name each open decision for the user.

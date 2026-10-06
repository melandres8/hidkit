---
name: bug-fix
profile: code
roles: [investigator, implementer, critic, verifier]
---
# Bug fix

Cheffy owns the proof of the defect, its root cause, and the evidence that the fix removes it.

## Steps

1. `<base>` is the commit that `trace begin` printed. Reproduce the defect on the matching surface, with `trace check --step repro -- <command>`. Keep the failing check id as the base check.
2. Delegate to the Investigator once. Use `how` mode when the cause area is too large to read inline. Use `why` mode only when the suspect code looks intentional. Give `request`, `mode`, and `scope`. Ask for facts that bear on the repro. In the same turn, read the README and each doc that it links for this area. List each project rule that governs the change, with `file:line`.
3. Form hypotheses from those facts. Binary-search the cause with runtime evidence, as [Fix Root Causes](../principles/fix-root-causes.md) requires. Record the surviving mechanism with `trace decision`.
4. Write a failing repro test for the behavior, as [Test Behavior, Not Implementation](../principles/test-behavior-not-implementation.md) requires. Run it with `trace check`. Commit it before the fix.
5. Delegate the fix to the Implementer. Create its worktree from the repro commit. Name the data shape in `data-shape`. Give the repro test and the project rules in `success-criteria`. Merge its branch into the run branch. The merged tip is `<head>`.
6. At head, run `trace verify-head -- <test command>` with the repro test and the repo gates of [pass.md](../pass.md). Also run `trace check -- git log --oneline <base>..<head>` to show the repro commit before the fix commit. Keep the passing ids as the head checks.
7. When gate 7 of [pass.md](../pass.md) requires the Critic, delegate to it in `quality` mode. Run the deep review of [security.md](../security.md) when it applies.
8. Act on each finding, as gate 7 says. Re-run the head checks after each fix.
9. Run the security baseline once, as gate 11 of [pass.md](../pass.md) says.
10. Delegate to the Verifier, as [Prove It Works](../principles/prove-it-works.md) requires. Pass the base check id from step 1 and the head check ids in `checks`. After a fix for a `FAIL`, apply the gate 11 rerun rule.
11. Run the pass (profile: code).

## Reply

- In the summary, name the root cause in plain words.

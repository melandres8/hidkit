---
name: fix-root-causes
group: verification
---
# Fix Root Causes

## When

Apply this principle when you debug a failure, a failing test, or an unexpected result.

## Rule

- Reproduce the failure first. Keep the reproduction as a test.
- Ask "why" until you reach the cause that you can change.
- MUST NOT add a guard that only silences the symptom. A null check that hides a crash is a symptom fix.
- A workaround that needs a long justification is a defect. Fix the code instead of explaining it.
- Search for the same pattern. Fix every instance, not only the one that failed.
- When you are stuck, add logging or instrumentation and read the real error message. Do not guess.
- When a failure appears after a restart, suspect stale state first. Check config files, caches, lock files, and serialized state before the code.
- If fixes keep failing on one gate, apply [Attack the Premise](attack-the-premise.md).

## Why

Symptom fixes pile up and hide the real defect. Each workaround adds one more thing for a reader to understand. A root-cause fix takes longer now and saves debugging time later. Prove each fix with [Prove It Works](prove-it-works.md).

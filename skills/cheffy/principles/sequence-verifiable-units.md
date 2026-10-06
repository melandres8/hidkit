---
name: sequence-verifiable-units
group: verification
---
# Sequence Work into Verifiable Units

## When

Apply this principle to multi-step work, such as sweeps, migrations, and runs of similar edits. Also apply it when you stack commits and PRs.

## Rule

- Split the work into small units. Each unit MUST end in a state that you can check.
- Verify each unit before you start the next. Treat each unit as a bracket. Start from a known-good state, make one change, run the check, and only then continue.
- Do not advance while the current unit fails.
- Start from a clean baseline, so that each check measures against the real state.
- Run the per-unit check even when a tool made the edits and the check is cheap. See [Build the Lever](build-the-lever.md).
- Order the delivery so that the sequence proves the work. Commit the failing test first and the fix after it.
- Other orders also prove work: removal before reshaping, a baseline before the change, scaffolding before features.
- Make each commit land on its own.

## Why

A failure found in the unit that caused it is easy to locate. After a batch, the cause hides among many changes and later work already rests on it. A sequence that a reviewer can replay shows the work go red and then green. Each check follows [Prove It Works](prove-it-works.md).

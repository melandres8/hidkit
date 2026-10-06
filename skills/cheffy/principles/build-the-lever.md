---
name: build-the-lever
group: core
---
# Build the Lever

## When

Apply this principle to any work that is not trivial. Examples are edits, migrations, analyses, and checks. Skip it only for a few obvious edits that you can see at a glance.

## Rule

- Build the tool that does the work or proves it. Examples are a codemod, a script, a generator, or a rerunnable check.
- Work the first unit manually, so that you learn the steps. Then build the tool and rerun it on that unit.
- Compare the tool output with the hand result before you trust the tool.
- Make the tool safe to run twice.
- When one tool covers every unit, run it over all units yourself. MUST NOT split such work among delegates when a script covers it.
- When you fan out, write the recipe once as a file that every delegate reads. Keep that file outside the write scope of the delegates.
- Keep the tool small, as [Laziness Protocol](laziness-protocol.md) requires.
- Keep the tool in version control if the work will outlast this session.

## Why

A tool treats every unit the same way and costs nothing to rerun. A reviewer can also read it and run it. The reviewer then checks the result and does not rely on your word. If you cite this principle and the diff has no tool, you did not apply it. For the proof itself, see [Prove It Works](prove-it-works.md).

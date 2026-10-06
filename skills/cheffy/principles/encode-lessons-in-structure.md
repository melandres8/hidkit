---
name: encode-lessons-in-structure
group: meta
---
# Encode Lessons in Structure

## When

Apply this principle when you write the same instruction a second time. Also apply it when a correction recurs or an error teaches a lesson.

## Rule

1. Ask whether a tool can enforce the rule without the reader. Options are a lint, a type, a flag, a runtime check, or a script.
2. If one can, build it and delete the instruction.
3. If several can, choose the strongest. Rank them: a state that cannot compile, a lint that fails CI, a canonical helper, a runtime check.
4. When a rule needs human judgment, state it prominently and show one example of how it fails.
5. When a human corrects you or a test fails, classify the event as a one-off or a pattern.
6. Route a pattern to a lint, a skill, or a principle. Close the loop now or write a concrete todo.
7. MUST NOT write "I will keep that in mind". That sentence does not persist.
8. MUST NOT fix one instance and leave the pattern in place.

## Why

A written rule works only if the reader sees it, remembers it, and obeys it. A mechanism enforces the rule without cooperation. Agents copy the code around them, so a weak guard becomes the next template. Build the smallest mechanism, as [Build the Lever](build-the-lever.md) and [Laziness Protocol](laziness-protocol.md) require.

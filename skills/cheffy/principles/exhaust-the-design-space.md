---
name: exhaust-the-design-space
group: core
---
# Exhaust the Design Space

## When

Apply this principle when a decision has no precedent in the codebase and the right answer is not clear. Typical cases are a new interaction, a new interface, and an architecture choice with several viable paths.

Skip it when the pattern is established, when the target state is clear, or when constraints allow one option.

## Rule

- Produce 2 or 3 competing designs before you commit. Build a prototype or a sketch of each one.
- Make the designs differ in shape. Two variants of one shape count as one design.
- Compare the designs side by side against the success criteria.
- Record the options that you rejected and the reason for each, in the reply.
- Commit to one design only after the comparison.

## Why

A wrong design costs more to build and to undo than three cheap sketches cost to compare. The first idea is often the nearest one, not the best one. Side-by-side comparison exposes trade-offs that a single design hides, especially where the result depends on feel and not on logic.

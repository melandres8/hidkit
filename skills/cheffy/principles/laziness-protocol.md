---
name: laziness-protocol
group: core
---
# Laziness Protocol

## When

Apply this principle when you plan a change, a refactor, or a new abstraction, layer, or option.

## Rule

- Delete first. Remove dead code, unused options, and stub references before you add anything.
- Choose the smallest change that still solves the stated problem.
- Cut to the minimum before you polish.
- Leave the design simpler than you found it.
- Flatten deep call chains and remove pass-throughs, as [Minimize Reader Load](minimize-reader-load.md) describes. Leave alone an interface that hides substantial work behind a rich surface. Hidden work is not chain depth.
- Keep each decision in one place, as [Single Source of Truth](single-source-of-truth.md) describes.
- Question any task that threads a new signal through types, schemas, or layers. Look for a direct path first.
- Design for observed use. MUST NOT add a speculative check inside the system, beyond the boundary parse that [Boundary Discipline](boundary-discipline.md) requires.
- Reject a result that a human maintainer would find tiring to maintain.

## Why

Each addition raises the cost of every later change. Removing first shows the core structure and often settles the next design. Tiny leaks that nobody removes grow into lasting coordination costs. A smaller diff is also easier to review and to prove.

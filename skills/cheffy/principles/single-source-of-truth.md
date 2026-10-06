---
name: single-source-of-truth
group: core
---
# Single Source of Truth

## When

Apply this principle when the same fact, rule, or shape appears in two places. Also apply it when you consider an abstraction over code that looks alike.

## Rule

- Give each fact one owner. Derive every other copy from the owner.
- Derive docs, tables, and other copies from the schema, the migration, or the config that defines them. For types, see [Type System Discipline](type-system-discipline.md).
- Test whether two pieces of code that look alike hold the same knowledge. If they change for different reasons, keep them apart.
- MUST NOT abstract before the third use. Two similar blocks are cheaper than a wrong abstraction.
- At the third use, extract the shared knowledge and delete the copies.
- Do not keep a copy in sync by hand. Replace it with a derivation or delete it.

## Why

A fact with two owners drifts, and the drift shows up as a defect. Merging code that only looks alike couples two ideas that change apart. The third use proves that the knowledge is shared and shows its real shape. Fewer copies also mean less code to maintain, as [Laziness Protocol](laziness-protocol.md) requires.

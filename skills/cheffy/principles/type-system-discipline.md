---
name: type-system-discipline
group: architecture
---
# Type System Discipline

## When

Apply this principle when you design types, review a function signature, or write code in a statically typed language.

## Rule

- Make illegal states unrepresentable. Model variants as sum types, not as bags of optional fields.
- Build a type from the values that you want. Do not carve it out of a looser type with checks.
- Brand primitives that mean different things, such as a user id and an order id. Validate once at creation.
- MUST NOT bypass the compiler with casts, unsafe coercions, or assertion helpers. Prove the fact or change the model.
- Match on variants exhaustively. A new variant MUST fail compilation until each match handles it.
- Derive each type from the schema, spec, or migration that owns the shape. Do not hand-write a parallel type. [Single Source of Truth](single-source-of-truth.md) states the general rule.
- Tighten a type only at a spot where partiality shows, such as a null check or an impossible-case throw. Then stop.
- Prefer total functions. Parsing of external data belongs to [Boundary Discipline](boundary-discipline.md).

## Why

The compiler checks each fact that the types state. A case that the types let you skip turns into a failure at run time. A comment that explains when a field combination is valid shows a loose type. Replace that type with a sum type.

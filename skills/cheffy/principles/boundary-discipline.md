---
name: boundary-discipline
group: architecture
---
# Boundary Discipline

## When

Apply this principle when you wire validation, error handling, parsing, or a framework adapter.

## Rule

- Parse external data at the boundary. Turn raw bytes, arguments, config, and responses into typed domain values there.
- At a boundary, validate, return errors, and handle failure defensively.
- Inside the system, trust the types. MUST NOT re-validate data that a boundary already parsed.
- State each invariant once, here at the boundary. Do not repeat it in each consumer.
- Write business rules as pure functions that need no framework. Let the outer shell only call them and translate.
- Expose domain concepts across the boundary. Do not re-export transport, storage, or framework types.
- Keep general mechanism inside. Put special-purpose policy at the edge.
- Before you add a check, find where the data came from. Drop the check if the data did not cross a boundary at this point. Move logic into a pure function if the shell can call it.

## Why

Checks spread through the code add noise and give a false sense of safety. One parse point keeps failure handling visible and testable. Pure logic runs in tests without the framework. [Type System Discipline](type-system-discipline.md) builds on this rule, and [Secure by Default](secure-by-default.md) relies on it for hostile input.

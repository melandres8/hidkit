---
name: secure-by-default
group: core
---
# Secure by Default

## When

Apply this principle to any code that handles input, identity, permissions, secrets, files, networks, or dependencies.

## Rule

- Deny by default. Grant access only after an explicit rule allows it.
- Grant the least privilege that the task needs, for the shortest time.
- Fail closed. On an error or an unknown state, refuse the action.
- MUST NOT put secrets in code, logs, error messages, or test fixtures. Read them from the environment or a secret store.
- Treat every external input as hostile. Validate it at the boundary, as [Boundary Discipline](boundary-discipline.md) requires.
- Prefer a maintained library over home-made cryptography, parsing, or authentication.
- Add a dependency only when it earns its place. Pin it.
- Only the user accepts a security risk. Record the approval in a `decision` event.
- Fix each finding, or ask the user to waive it. Cheffy MUST NOT write a waiver.

## Why

A permissive default turns each omission into a hole, and attackers look for omissions. A closed default turns each omission into a visible failure. Secrets that reach logs or errors spread to systems that nobody guards. Defaults decide what happens when nobody decides.

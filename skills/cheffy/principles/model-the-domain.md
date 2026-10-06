---
name: model-the-domain
group: architecture
---
# Model the Domain

## When

Apply this principle before you write logic. Also apply it when you write stateful code, when branches multiply, or when files repeat the same shape assumption.

## Rule

- Design the data structures first. Fix the core types, list how the data is accessed, and pick structures that suit the common paths.
- Put the domain in a data structure, not in scattered conditionals. Choose the fit:
  - a state machine for phases, flags, and lifecycle checks
  - a typed model for loose parameters
  - a map, registry, or union for branching spread across files
  - a queue, an index, a graph, or a normalized collection that fits how the data is read
- Group code by the knowledge that it owns, not by the order in which its steps run.
- Ask which states the code has to forbid. Choose the structure that forbids exactly those states.
- Make each increment land one coherent abstraction. Never scatter one capability over many callers as special cases.
- Before actors share state, ask what a concurrent change by another actor would do. Unless the answer is "nothing", isolate the state. See [Separate Before Serializing Shared State](separate-before-serializing-shared-state.md).
- Keep boring code when the current shape is clear, local, and stable.

## Why

Flags and shape assumptions that spread across files add complexity that the domain does not require. A fitting structure rules out invalid states and removes branches. It costs little to choose while you write. Later it looks like a refactor, and teams postpone it. Warning signs: a new branch on a long if-chain, or a second flag that has to match the first.

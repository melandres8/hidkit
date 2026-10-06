---
name: minimize-reader-load
group: core
---
# Minimize Reader Load

## When

Apply this principle when you review or shape code that is hard to trace. Also apply it before you add a layer or a piece of state.

## Rule

- Count two things: the layers between a question and its answer, and the state that a reader holds in mind.
- Inline a layer when it costs more than it saves. A wrapper with one caller is one case. An adapter with one implementation is another.
- Collapse a layer that repeats the methods and arguments of the layer below it.
- Favor an interface whose hidden part is a real design decision. Reject a broad interface that hides little.
- Shrink the scope of state. Prefer returns over mutations, then locals, then fields, then module state, and globals last.
- Derive a value instead of syncing a copy, as [Single Source of Truth](single-source-of-truth.md) describes.
- State an invariant once, at the boundary, as [Boundary Discipline](boundary-discipline.md) describes.
- Add a layer or state only if it removes at least as much load elsewhere.
- Test the result with a new reader. In 30 seconds, the reader MUST find where a value comes from and what can change it.

## Why

Code is read many times and written once. Line count and cyclomatic complexity only approximate the effort of a reader. Reader load measures it. Layers and state add load separately. Dozens of globals in one flat file can burden a reader as heavily as a deep stack of adapters.

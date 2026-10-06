---
name: separate-before-serializing-shared-state
group: architecture
---
# Separate Before Serializing Shared State

## When

Apply this principle when concurrent actors can write to the same file, branch, key, or state object. Workers and parallel delegations are such actors.

## Rule

1. List the shared mutable state. Include files that actors both read and write, and branches that both push to.
2. Ask whether the actors need one object, or whether each publishes an independent fact.
3. By default, remove the sharing. Give each actor its own file, key, branch, worktree, or directory. Merge only where results are read.
4. Example: two workers that each write one field into the same JSON file still share state. Two files, one per worker, do not.
5. Serialize access only when one shared writer is a real invariant. Use structure: a lock file, sequential phases, a single writer, or atomic compare-and-swap.
6. MUST NOT rely on a written convention as concurrency control.
7. When a lock looks necessary, first ask whether the design is wrong. A lock is not the default answer.

## Why

Concurrent writes to shared state cause races. These races appear at random and resist reproduction. Separate state cannot race. A lock adds waiting and failure modes. Structure holds when an actor forgets the rule.

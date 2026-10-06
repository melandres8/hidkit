---
name: make-operations-idempotent
group: architecture
---
# Make Operations Idempotent

## When

Apply this principle to commands, lifecycle steps, jobs, and retries that run where crashes and restarts happen. Gate 12 reliability cites it.

## Rule

- For each operation that changes state, answer three questions:
  1. Which state follows two runs in a row?
  2. Which state follows a run that crashed at any point?
  3. Does a rerun end in the same state as a clean run?
- Add a reconciliation step whenever the outcome depends on leftovers from an earlier run.
- On startup, look for leftover state, remove stale artifacts, and take over work that is still live.
- Compare artifacts by content, not by creation order.
- Detect stale locks from the owner process, so that a crashed owner does not block the next run.
- Give each retried request a key, so that the receiver applies it once.
- Let failed work restart cleanly, with fresh input.

## Why

Crashes, restarts, and retries happen in normal use. When leftover state changes the next outcome, each restart needs a human to investigate. An operation that converges makes retries safe and lets the system heal itself.

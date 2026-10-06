---
name: attack-the-premise
group: core
---
# Attack the Premise

## When

Apply this principle when 2 or more fixes with a common premise fail the same gate. Also apply it after 3 FAIL verdicts in a row on one gate.

## Rule

1. Name the belief behind every failed fix, in one sentence. That belief is the premise.
2. MUST NOT begin another fix until the premise is on record and the census is finished.
3. Take a census. Count how much of the imbalance each actor holds. Write the count as a script that anyone can rerun, as [Build the Lever](build-the-lever.md) describes.
4. Read the distribution. When one small group carries the load in every run, a mechanism puts it there.
   Find that mechanism, as [Fix Root Causes](fix-root-causes.md) describes.
5. Remove the cause of the uneven load. Change who gets the role from run to run, assign it by chance, or relocate it.
6. MUST NOT add compensating machinery, such as a queue back to the origin or a pooled buffer. It leaves the cause in place and costs work on each run.
7. A flat distribution clears the premise. Keep the census as evidence and search for the cause somewhere else.
8. If the failures have no actors, question the premise directly.
9. After 3 FAIL verdicts in a row on one gate, report the premise and the census to the user.

## Why

When fixes share a premise, they fail for one reason, and each failure is a test of that premise. A new fix on the same premise only repeats the failure. The census shows where the imbalance sits, so the next change aims at the cause.

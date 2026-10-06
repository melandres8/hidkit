---
name: explain-the-number
group: verification
---
# Explain the Number

## When

Apply this principle before you trust, report, or act on a measurement. Examples are a speedup and an eval result.

## Rule

State the claim in the form that you plan to publish, before you run anything. Support each answer with a run, not with code reading.

1. Limiter: ask why the result is not twice as good. Find what bounds it: the CPU, a lock, I/O, or the load generator. Profile in a separate run that you do not report.
2. Tuning: configure each side the way production configures it. If one side keeps defaults, do not pick a winner.
3. Limits: compare the rates with hardware limits. Deleting a part that takes 10 percent of the time makes the run at most about 11 percent faster.
4. Errors: tally failed requests and verify that the outputs have the right content.
5. Repeatability: measure each side in at least 5 runs. Alternate the sides. Give the median and how widely the runs vary. Treat a smaller difference as noise.
6. Relevance: compare each micro result with the whole operation that a user waits on.
7. Execution: confirm that the timed region did the work.

The report carries the verdict, the value with its unit, the run count, the spread, and the limiter. The result is inconclusive when:
- you cannot name the limiter
- a side ran untuned
- the work count or the error count went unchecked
- the timed region could include other work

For an eval result, confirm that every trial did the task and that the gap holds across trials.

## Why

A failed run can still print a believable number. A number with no named limiter is a guess. For output checks, see [Prove It Works](prove-it-works.md).

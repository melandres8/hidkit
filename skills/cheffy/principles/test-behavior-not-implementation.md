---
name: test-behavior-not-implementation
group: verification
---
# Test Behavior, Not Implementation

## When

Apply this principle when you write, change, or keep a test.

## Rule

- Call the code the way its users call it. Assert the result that they observe, against a literal expected value.
- Apply the stub rule to each test. Replace the code under test with a stub that returns a default value. A test that still passes against the stub MUST be rewritten or deleted.
- MUST NOT write these shapes, because each passes against a stub:
  - an assertion that is missing or weak, such as "exists" or "does not throw"
  - an assertion on calls only, or on emptiness or absence only
  - an expected value that the code under test computes
  - a restated constant, config default, or prompt string
  - an assertion on data that the test itself built
- To test an absence, also assert the presence on a second input.
- A constant needs no test of its value. Test the code that reads it, with one input.
- When a mock is involved, assert on the payload that it got or on the state afterward.
- A test of a relation across table rows is valid. So is a compile-time check.

## Why

A test that passes against a stub proves nothing, yet it still takes CI time and reviewer attention. A constant pin also blocks a legitimate edit. Gate 2 of the pass applies the stub rule to each new behavior.

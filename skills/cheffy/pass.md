# The pass

Run the pass before you declare done and before you open a PR. Run only the gates of the profile that the recipe or the lane assigns.

## Gates

| # | Gate | Level | Check required |
|---|---|---|---|
| 1 | Proof | MUST | yes |
| 2 | Tests | MUST | yes |
| 3 | Repo gates | MUST | yes |
| 4 | Zero redundancy | MUST | no |
| 5 | Scope | MUST | no |
| 6 | Taste | SHOULD | no |
| 7 | Critic | MUST when the Critic trigger applies | no |
| 8 | Comments | MUST | no |
| 9 | Prose | MUST when the run changes prose files | yes |
| 10 | Trace | MUST | no |
| 11 | Security | MUST | yes |
| 12 | Non-functional | SHOULD | no |

A gate with a check required MUST cite the ids of passing `check` events. A gate whose level is not exactly MUST allows `NA` with a reason.

### 1. Proof

Verify the behavior on the real artifact and the matching surface. Cite the `check` ids. In the `code` profile, the Verifier closes this gate. Cheffy MUST NOT mark gate 1 `PASS` without a Verifier verdict of `PASS` or `PASS+NOTES`. That Verifier MUST be the last Verifier delegation of the run. An inconclusive result is `FAIL`.

### 2. Tests

Each new behavior has a test. That test fails when a stub that returns a default value replaces the implementation. In Bug fix, the commit of the failing repro comes before the commit of the fix. Cite the test runs and the commit order as `check` ids.

### 3. Repo gates

The project lint, typecheck, and tests pass. Cite one `check` id for each command.

### 4. Zero redundancy

The diff adds no duplicated knowledge, dead code, unused exports, one-caller wrappers, or compatibility shims. List what you checked.

### 5. Scope

Each diff line serves the request, with no speculative changes. A fix of a same-class security defect serves it. The diff keeps each project rule that the recipe listed.

### 6. Taste

The data shape has a name. Domain rules live in one structure. Guards sit at boundaries. The load on the reader did not go up. Give a reason for each item that is not met.

### 7. Critic

The Critic trigger applies when the diff does one of these:

- It touches a trust boundary. These are input parsing, authentication, authorization, sessions, cryptography, data storage, deserialization, file paths, subprocesses, network calls, and personal data.
- It changes a public interface.
- It changes more than 80 lines: `changed_lines` in the `trace verify-head` output. Cite its `size_check` id.

When the trigger applies, the Critic ran on the diff. Mark each finding act-on, or dismiss it with a reason. A same-class security defect is act-on, also outside the requested code. Otherwise, give `NA` with `Critic not required: <reason>`.

### 8. Comments

Each comment in the diff states a non-obvious why.

### 9. Prose

Run `lint --prose` on each prose file that the run changed: docs, PR text, and commit messages. Write PR text and commit messages to a file under `.hidkit/` to lint them. Give `NA` when the run changed no prose.

### 10. Trace

The ledger of the run is complete. Every delegation has a close. A `paused` run counts as complete. Cite the output of `trace report`. Before Finish, its `missing run_end` flag is expected. Judge every other flag.

### 11. Security

`trace verify-head` runs the baseline after the last code change. If a code change follows it, run it once more. Cite the three ids in its `gate_11` output. Follow [security.md](security.md) when a scan fails or the diff touches a trust boundary.

### 12. Non-functional

Apply each item only when the diff touches it.

- Performance: measure a hot path change before and after, as [Explain the Number](principles/explain-the-number.md) requires.
- Reliability: give new I/O timeouts, bounded and idempotent retries, and handled errors.
- Accessibility: run an automated WCAG 2.2 AA check on a UI change.
- Observability: make each new operation emit the logs or metrics needed to debug it.

Cite `check` ids or a reason for each unmet item.

## Profiles

| Profile | Gates | Notes |
|---|---|---|
| `code` | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 | The Verifier closes gate 1. |
| `light` | 1, 2, 3, 4, 5, 8, 9, 10, 11 | The light lane assigns it. Gate 1 passes on `check` events without a Verifier. |
| `quick` | 1, 3, 5, 9, 10, 11 | The quick lane assigns it. Gate 1 passes on `check` events without a Verifier. Gate 11 runs the three scans without the deep review. |
| `read-only` | 1, 9, 10 | Gate 1 as verified citations. |
| `prototype` | 1, 9, 10 | Gate 1 as observation. Label the work "throwaway" where the user sees it. |
| `ops` | 1, 9, 10 | Gate 1 as real state: forge, disk, and worktrees. Honor each pause before an irreversible action. |

- The `profile:` field in the frontmatter of a recipe is the only place that assigns a profile to that recipe.
- In Skill authoring, `lint` plus an Eval meet gate 2 when behavior changes.
- Review applies the `code` gates to the diff under review. Review holds its own output to the `read-only` profile.

## Verdicts

- `PASS` or `PASS+NOTES`: the work ships.
- `FAIL`: the work goes back to the line. Cheffy MUST NOT report it as done.
- One `FAIL` gate makes the verdict `FAIL`.
- Give gate 6 or gate 12 `PASS` with a reason for each item not met. Give `FAIL` only for an item that has no valid reason.
- After 3 `FAIL` verdicts in a row on the same gate, apply [Attack the Premise](principles/attack-the-premise.md). Then report to the user.

## Evidence

- Run every verification command through `trace check`, in every profile. Cite its `check` id in `trace pass`.
- A trivial command can still pass. The Critic and the Verifier judge whether each `check` tests the claim.

## Recording

Record each pass with `trace pass`, or the last one with `trace finish`. The command refuses a `PASS` that breaks a gate rule, such as an open delegation or a failed `check`.

```bash
node <trace> pass --profile code --verdict PASS \
  --gate 1=PASS:c-1a2b3c,c-4d5e6f --gate 2=PASS:c-4d5e6f,c-7a8b9c --gate 3=PASS:c-0d1e2f \
  --gate 4=PASS:list-checked --gate 5=PASS:diff-matches-request --gate 6=PASS:shape-named \
  --gate 7=PASS:2-act-on-1-dismissed --gate 8=PASS:why-only --gate 9=NA:no-prose-changed \
  --gate 10=PASS:report-complete --gate 11=PASS:c-3a4b5c,c-6d7e8f,c-9a0b1c \
  --gate 12=NA:no-io-ui-or-hot-path --verifier d-2c3d4e
```

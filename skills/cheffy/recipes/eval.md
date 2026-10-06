---
name: eval
profile: read-only
roles: [judge]
---
# Eval

Cheffy owns the design of a small blind comparison of variants. A variant is one version of a skill, a prompt, a role, or a recipe. The result is a judgment, not a measurement. A release gate needs the measurement eval, with repeats, hidden tests, and a noise check.

## Steps

1. Frame the comparison. Name the variants and the behavior that counts as success. Write 3 to 6 concrete claims as the rubric. Keep the rubric from the candidates. Record the frame with `trace decision`.
2. Write one organic prompt: the request that a user would type. State the goal, not the comparison. Do not ask the candidate to list the skills, principles, or files that it used.
3. Make one sanitized directory for each candidate, outside the repository. Put in it the variant and the context that a real task has, such as a project skeleton. Use names that a user could choose.
4. Keep these words out of the prompt and out of the names that you choose: eval, test, judge, experiment, rubric, score, compare, benchmark, candidate, arena. Do not tell a candidate that other candidates exist.
5. Run at least two candidates for each variant, in parallel, with the same prompt and the same model. Then the variant is the only difference. Start each candidate as a fresh session of the harness in its directory, with no Hidkit context. When the harness cannot start one, use the `delegate` action without `trace brief`, because a brief header shows the comparison. Record each candidate, its variant, and its directory with `trace decision`.
6. Collect each output: the final reply, the diff, and the transcript. Give each output a neutral label, such as A, B, or C. Keep the map from label to variant out of every brief.
7. Delegate to the Judge. Give `rubric` and `outputs`. One Judge grades all outputs in one pass, on one scale. Use a Judge model family that differs from the candidates, if the harness allows.
8. Check how each candidate worked from its transcript, not from its reply. Find the files that it read and the commands that it ran, with the `transcripts` action. Read only the transcripts of this comparison.
9. Read each output yourself, from start to end. Compare your reading with the Judge verdict. A disagreement shows a biased Judge or an unclear claim. Record it with `trace decision`.
10. Run the pass (profile: read-only).

## Reply

- Name the variants and the rubric. Give a note for each candidate, the Judge verdict, and your synthesis.
- Recommend to promote the variant or not. Say that a small comparison cannot show a gain above noise.

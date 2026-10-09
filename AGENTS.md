# Rules for agents in this repository

## Evals

This repository is public. Every eval file goes in the private eval repository, `hidkit-eval`. Its checkout is next to the Hidkit checkout, at `../hidkit-eval` by default.

This rule applies to every eval of Hidkit, whoever runs it and with any tool. It covers the measurement eval, the skill evals, the eval recipe of Cheffy, and each eval that skill-creator or another skill starts.

- An eval file is a case, a fixture, a session transcript, a runner, a result, a report, a benchmark, or a skill-creator workspace.
- When a tool or a skill proposes a place for eval files inside this repository, use the eval repository instead.
- Put the cases of a skill in `hidkit-eval/eval/skills/<skill>/evals.json`, in the skill-creator schema. Put their input files in `files/` next to it.
- Run the skill evals from the eval repository: `HIDKIT_DIR=<hidkit-checkout> node eval/skills/run.mjs --skill <skill>`. Run `--dry-run` first. Every other run spends subscription tokens, so ask the user first.
- Write the catalog and the reports in `hidkit-eval/docs/evals/`.
- Never create an `eval/` directory, an `evals/` directory, an `evals.json` file, or a `*-workspace/` directory in this repository. `npm run lint` fails on each of them.
- When the eval repository is not next to this checkout, ask the user for its path. Do not fall back to this repository.

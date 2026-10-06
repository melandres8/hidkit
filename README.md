# Hidkit

Hidkit is a quality-first software delivery harness for coding agents. Its head agent, Cheffy, routes each task to a recipe and gives isolated judgment to roles. Before it reports a task as done, it checks the result against a pass of 12 gates. Each run writes a ledger. The ledger records what Cheffy delegated, verified, and decided.

## Status

Phase 1 is in progress. It is not a release.

- The plugin works in Claude Code.
- The exit criterion of phase 1 is quality above plain Claude Code, at a cost of 2 times the baseline or less. That criterion is **not met yet**.
- In the last measurement, Cheffy had no regression on any task. Its quality gain (0.10) was below the noise (0.20). Its cost was 3.6 to 4.5 times the baseline.

## Install

Hidkit runs as a Claude Code plugin. Clone the repository, then start Claude Code with the plugin directory:

```bash
claude --plugin-dir /path/to/hidkit
```

Check the security tools that the pass uses (gitleaks, osv-scanner, semgrep):

```bash
node /path/to/hidkit/skills/cheffy/scripts/doctor.mjs
```

The doctor prints the pinned version and an install command for each missing tool.

## Usage

```text
/hidkit:cheffy <task>
```

Cheffy picks a recipe and a lane, does the work, runs the pass, and replies with a short summary and one evidence line.

| Recipe | Use it for |
|---|---|
| `bug-fix` | A reported defect: repro test first, root cause, fix, independent verification. |
| `feature` | New or changed behavior. |
| `eval` | A small blind comparison of variants of a skill, a prompt, a role, or a recipe. |

| Lane | When |
|---|---|
| Quick | One file, 20 lines or fewer. |
| Light | 3 files or fewer, 80 lines or fewer, no trust boundary. No Critic or Verifier subagents. |
| Full | Every other task. The recipe runs with its roles. |

To change models, the security level, or waivers, copy `hidkit.config.example.yaml` to `hidkit.config.yaml` at the root of your project.

## Security

Security has the highest priority in Hidkit.

- Gate 11 of the pass runs a secret scan, a dependency scan, and a SAST scan on every change.
- A change that touches a trust boundary gets a deep review against OWASP ASVS (level 2 by default).
- When Cheffy finds a security defect of the same class as the one in the task, it fixes it in the same change and reports it.
- Only a person can approve a waiver. Cheffy never writes one.

## Layout

| Path | Content |
|---|---|
| `skills/cheffy/` | Cheffy: `SKILL.md`, the pass, recipes, principles, security rules, and harness maps. |
| `skills/cheffy/scripts/` | `trace.mjs` (the ledger and the checks), `lint.mjs`, and `doctor.mjs`. |
| `skills/plating/` | The writing standard for every reply and prose file. |
| `agents/` | The roles: investigator, implementer, critic, verifier, and judge. |
| `docs/specs/` | The design of Cheffy and the decisions behind it. |
| `GLOSSARY.md` | The defined terms. |
| `test/` | Unit tests. |
| `scripts/` | A smoke test that runs Cheffy in Claude Code. It spends subscription tokens. |

## Development

Node.js 20 or later. No dependencies.

```bash
npm test
```

```bash
npm run lint
```

The measurement eval (baseline against Cheffy, with hidden tests, blind judges, and a noise check) is in a separate private repository. Its tests and reference patches must not become public.

## Credits

Hidkit derives the Cheffy principles, recipes, and pass rules from [pstack](https://github.com/cursor/plugins/tree/main/pstack), under the MIT License. See [NOTICE](NOTICE).

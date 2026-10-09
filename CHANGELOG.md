# Changelog

This file records each notable change to Hidkit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is 0.x, the behavior of Cheffy and the ledger format can change in a minor version. A change to the behavior of Cheffy or to the ledger format increments the minor version. A fix increments the patch version.

## [Unreleased]

### Added

- Fill-me-in, a skill that briefs the user on the work of the session. It states the idea of the change, groups the files into parts, and shows the key moves as phases. A script, `map.mjs`, finds the parts and the code that refers to them. A second script, `render.mjs`, builds the briefing as one self-contained HTML page and opens it in the browser. The page shows a diagram of the connections, with a detail panel for each part. The chat reply holds only the idea, a short summary, and the path of the page.
- Doodle, a skill that draws a black and white illustration for a Substack post from an idea or a description. The model writes an SVG with the rules of a style guide. A script, `ink.mjs`, checks that the drawing has no color, adds a hand-drawn ink filter with a second pen line, puts the drawing on textured paper (`newsprint` by default, or `sketchbook`, `kraft`, or `white`), adds marks of a used sketchbook page (`--material`), and exports a PNG with headless Chrome. The drawings can use stipple and hatch fills from the script and a recurring character: a man with dark skin, a short afro, a mustache and goatee, and round glasses, with 5 faces.
- `AGENTS.md` (and `CLAUDE.md`, which imports it) tells each agent that eval files go in the private eval repository. `npm run lint` fails when this repository holds an `eval/` or `evals/` directory, an `evals.json` file, or a `*-workspace/` directory.

### Security

- The scanned repository can no longer hide a finding from the security baseline with its own allowlist.
  - gitleaks reads `gitleaks.toml` from the Hidkit skill directory, not `.gitleaks.toml` from the repository. It also ignores `gitleaks:allow` comments.
  - osv-scanner reads `osv-scanner.toml` from the Hidkit skill directory. It ignores each `osv-scanner.toml` file in the repository.
  - semgrep ignores `nosemgrep` comments.
- gitleaks always reads `.gitleaksignore`, and semgrep always reads each `.semgrepignore`. No flag turns this off. When such a file changed since the run base, the scan does not run and fails.
  - Untracked and symlinked files count as changed. In a run with no base, each such file counts as changed.
  - A file that git ignores counts only when its directory has tracked files. Then a `.semgrepignore` in `node_modules` does not fail the scan.
  - semgrep reads each `.semgrepignore` in the repository, also from a subdirectory. The check covers the full repository.
- osv-scanner skips each file that git ignores. When git ignores a tracked lockfile, the `dependencies` scan does not run and fails.
- `trace report` flags each scan that applied a suppression file from the repository. It also flags each scan that a changed suppression file or an ignored lockfile stopped.
- The `secrets` scan also runs `gitleaks git` on each commit since the run base. It finds a secret that a later commit removed. The work-tree scan does not find that secret. In a run with no base, it scans each commit.
- A registry command can name a file next to the registry as `{skill-dir}`.

## [0.1.0] - 2026-10-06

First pre-release. Phase 1 is in progress. The exit criterion of phase 1 is quality above plain Claude Code at a cost of 2 times the baseline or less. That criterion is not met yet. The last measurement showed no regression. The quality gain was below the noise, and the cost was 3.6 to 4.5 times the baseline.

### Added

- Cheffy, the head agent, as a Claude Code plugin (`/hidkit:cheffy <task>`).
- Three recipes: `bug-fix`, `feature`, and `eval`, a small blind comparison of variants.
- Three lanes for recipes with profile `code`: quick, light, and full.
- Five roles: investigator, implementer, critic, verifier, and judge.
- The pass: 12 gates, with profiles `code`, `light`, `quick`, `read-only`, `prototype`, and `ops`.
- `trace.mjs`, which writes the ledger of each run and runs every check. Redaction on write.
- A security baseline: a secret scan, a dependency scan, and a SAST scan on each change. A change to a trust boundary also gets a deep review against OWASP ASVS.
- `doctor.mjs`, which checks the pinned security tools and the harness adapter.
- `lint.mjs`, which checks the structure and the prose of the plugin.
- Plating, the writing standard for each reply and prose file.
- 18 principles that the recipes, the roles, and the pass link.

### Security

- Each install command of a security tool checks the sha256 of every download, for macOS and Linux on arm64 and x64. Semgrep installs from a hash-locked requirements file.
- Cheffy fixes a security defect of the same class as the one in the task, in the same change, and reports it.
- Only a person can approve a waiver.

[Unreleased]: https://github.com/melandres8/hidkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/melandres8/hidkit/releases/tag/v0.1.0

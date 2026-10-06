# Security rules

Gate 11 of [the pass](pass.md) applies these rules.

## Baseline

The baseline is three scans: `secrets`, `dependencies`, and `sast`. One call runs all three and records one `check` for each scan. On a clean work tree, `sast` reports only findings that are new since `<base>`. With uncommitted changes, it scans the whole repository.

```bash
node <trace> check --step pass --security all
```

- The call exits nonzero when a scan fails, a tool is missing, or a tool version does not match. It prints the output of each failed scan. A waived scan also exits nonzero, and gate 11 accepts its id.

- The security registry, `security-tools.yaml`, maps each scan to a pinned tool. The `security.checks` key in `hidkit.config.yaml` overrides it with a command list. An override has no version pinning, so its `version_ok` is null.
- Each security `check` records `tool_version`. A version that does not match the registry fails gate 11.
- A missing tool fails gate 11.
- A suppression file, such as `.gitleaksignore`, that changed since `<base>` fails the scan.
- `node <skill-dir>/scripts/doctor.mjs` lists missing tools and prints pinned install commands for the user.
- Cheffy MUST NOT install or download tools. Propose the tool. The user installs it or writes a waiver.
- Each install command checks the sha256 of each download. For semgrep, pip checks every package against `semgrep-requirements.txt`.

## Deep review

Run the deep review when the diff touches a trust boundary. Gate 7 of [the pass](pass.md) lists the trust boundaries.

In a deep review, follow these rules:

- Delegate to the Critic with `mode` set to `security`.
- The Critic applies the OWASP ASVS level in `security.asvs_level` of `hidkit.config.yaml`. The default level is 2.
- The Critic records a short STRIDE threat model.

## Waivers

- Fix or waive each security finding.
- Only the user writes a waiver. Cheffy MUST NOT write one.
- A waiver lives in `security.waivers` of `hidkit.config.yaml`. It has the fields `check`, `reason`, `approved_by`, `approved_on`, and `expires`.
- The `expires` date MUST be at most 90 days after `approved_on`. An expired waiver fails gate 11.
- A waiver covers only the security check that it names.
- A high or critical finding MUST NOT ship with a waiver unless the user approves it in the same run.
- The `trace check` command records a `decision` event for each waiver that the run uses.
- The reply names each waiver that the run used. The `trace report` command lists the active waivers.
- The reply names each `trace report` flag on a security check, such as a config override.

## References

- OWASP ASVS sets the verification depth.
- OWASP Top 10 and CWE Top 25 form the checklist of the Critic.
- NIST SSDF (SP 800-218) lists the practices that the recipes follow.

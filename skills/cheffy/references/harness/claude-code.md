---
harness: claude-code
verified_with:
  version: "2.1.289"
  date: "2026-10-04"
  docs: [https://code.claude.com/docs/en/plugins/manifest-reference.md, https://code.claude.com/docs/en/sub-agents.md, https://code.claude.com/docs/en/skills.md, https://code.claude.com/docs/en/hooks.md, https://code.claude.com/docs/en/headless.md, https://code.claude.com/docs/en/tools-reference.md, https://code.claude.com/docs/en/env-vars.md, https://code.claude.com/docs/en/sessions.md]
version_command: [claude, --version]
detect_env: CLAUDECODE
invocation: /hidkit:cheffy
role_prefix: "hidkit:"
model_selection: true
family: claude
tiers:
  strong: opus
  fast: sonnet
shell_tools: [Bash]
enforcement:
  tool_allowlist: true
lifecycle_hooks: false
usage_source: null
---

# Claude Code harness map

This map translates Cheffy actions into Claude Code tools. Each row comes from the docs listed in the frontmatter.

| Action | Claude Code |
|---|---|
| `delegate` | Tool `Agent`. Before version 2.1.63 it was named `Task`, and `Task(...)` still works as an alias. Parameter `subagent_type` is required. Parameter `model` is optional per call. Address plugin agents as `hidkit:<role>`. |
| `resolve-tier` | Pass `model` as an alias: `opus` for strong, `sonnet` for fast. The docs list the aliases `sonnet`, `opus`, `haiku`, and `fable`. Full model IDs and `inherit` also work. Model selection is possible. The family is `claude`. |
| `ask-human` | Tool `AskUserQuestion`. It asks multiple-choice questions. Claude Code removes it under `--permission-prompts none`. Fall back to a plain reply when it is absent. |
| `todo` | Tools `TaskCreate`, `TaskGet`, `TaskList`, and `TaskUpdate`. `TodoWrite` replaces them when `CLAUDE_CODE_ENABLE_TASKS=0`. Newer models omit these tools unless the user opts in. When the tools are absent, use the `TODO.md` fallback. |
| `read-file` | Tool `Read`. |
| `run-shell` | Tool `Bash`. |
| `create-worktree` | Tools `EnterWorktree` and `ExitWorktree`. Fall back to `git worktree`. |
| `drive-surface` | The tools reference lists no built-in browser or simulator tool. Use MCP browser or simulator tools when they are connected. Otherwise use `Bash`. |
| `open-pr` | The tools reference lists no PR tool. Use `gh` through `Bash`. |
| `transcripts` | JSONL files at `~/.claude/projects/<project>/<session-id>.jsonl`. Subagent transcripts are `agent-{agentId}.jsonl` under `~/.claude/projects/{project}/{sessionId}/subagents/`. Hooks receive `transcript_path`. The docs call the entry format internal and say it changes between versions. Use transcripts only as a fallback. |
| `lifecycle-hooks` | `false` in phase 1. Plugins can ship hooks in `hooks/hooks.json`. The hooks page lists `SubagentStart` and `SubagentStop`. Phase 1 uses none of them. |
| `usage-source` | `null`. The docs do not describe per-subagent token totals or a usage field in transcripts. |
| `invocation-only` | The skills page documents the frontmatter field `disable-model-invocation: true`. It blocks automatic loading. The user can still run `/hidkit:cheffy`. |

## Notes

- Parallel calls: put several tool calls in one assistant message. Claude Code runs independent calls from one message together, and `Agent` calls run as parallel subagents.

- Delegate with `subagent_type: hidkit:<role>`. Pass the model from `trace brief` in the `model` parameter.
- The docs say the `tools` list in an agent definition limits that subagent to the listed tools. This is why `enforcement.tool_allowlist` is `true`. `scripts/smoke-claude-code.mjs` checks it: the `init` event of `--agent hidkit:critic` lists no write or shell tool.
- The skills page documents `${CLAUDE_SKILL_DIR}`. It is the directory that holds the skill's `SKILL.md`. For a plugin skill, it is the skill's own subdirectory, not the plugin root. Use it in the skill body. Scripts are at `${CLAUDE_SKILL_DIR}/scripts/`.
- The skills page does not document a "Base directory for this skill" line. Treat that line as unverified. Prefer `${CLAUDE_SKILL_DIR}`.
- Permission rules match single commands. Cheffy runs one command in each `Bash` call, so each call matches an allow rule such as `Bash(node *)`.
- The docs name the plugin skill `/hidkit:cheffy`. They name plugin agents `hidkit:<role>`.
- `usage_source` is null. Per-delegation tokens stay `null` (spec 12).
- `detect_env` is a fallback only. Claude Code sets `CLAUDECODE=1` in subprocesses it spawns, such as `Bash` and hook commands. Prefer the harness named in your system context.
- On 2.1.289 the `init` tool list of a role omits `Grep` and `Glob`, even when the role declares them. A role then searches with `Read`, and with `Bash` when it has a shell.
- Run one Cheffy session per repository. All worktrees share one `.hidkit/current-run` pointer, so two sessions write to each other's run.
- The `tools` frontmatter of each role in `agents/` names Claude Code tools, because Claude Code reads that field. It is the one place outside this map that names harness tools.

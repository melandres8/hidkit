---
name: fill-me-in
description: Use this skill when the user wants a briefing on the work of this session. It explains the general idea of the change, how it connects to the existing code, and the key moves, in an HTML page with a diagram. Use it for "fill me in", "catch me up", "what did you do", "walk me through the changes", "ponme al tanto", "qué se hizo", "qué hiciste", "cómo se conecta con lo que ya existe", or "explícame los movimientos", even when the user does not name the skill.
---
# Fill me in

Brief the user on the work of this session in one HTML page. The goal is understanding, not an inventory. Explain the idea and the reason of each change, and show how it fits the existing code.

A reader holds about 4 items at a time. Use 4 parts, 4 phases, and 6 diagram nodes at most.

## Source

- Take what changed only from this session: the messages, the tool calls, and their results.
- Do not use git history, the ledger, or other sessions to find changes. They can hold work that this session did not do.
- If the context holds a summary of earlier turns, use it. Say which parts the summary does not cover.
- If the session holds no work, tell the user that you found nothing to report. Then stop. Do not invent changes.

## Map

Run the map script with `run-shell`. Give it every file that the session touched, from the git root:

```text
node <skill-dir>/scripts/map.mjs --base <commit> <file>...
```

- `<skill-dir>` is the directory of this file.
- `<commit>` is the commit at the start of the session. Omit `--base` when the session made no commit.
- The script prints JSON with the parts, their states, the existing code that refers to each part, and the edges.
- Use the edges as the connections. Read a sample line of an edge only when its relation is not plain.
- The script finds only the code that refers to a part. Add the code that a part uses when the session shows it.
- `paths` appears only when the session touched 10 files or fewer.

## Parts

A part is a group of touched files with one purpose.

- Name each part by its purpose, not by its directory.
- Merge two parts when they serve one purpose.
- Explain the change by parts, never file by file.

## Moves

A move is one action that changed the state of the work. Tell the moves as a short story of phases, such as setup, build, and verification.

- Write one line for each phase.
- In each phase, name only the key moves: branch operations, commits, user decisions, and agent decisions with their reason.
- Always name each failed or denied command, and what the session did instead.
- Leave out reads, searches, and routine edits.
- Put each decision in the phase where it happened.

## Page

The page holds the briefing: the diagram, the parts, the moves, and the open items. Build it with the render script. Pipe the page data to it as JSON. Use a quoted heredoc, so that the shell does not expand `$` or backticks:

```text
node <skill-dir>/scripts/render.mjs --out <dir> [--base <commit>] <file>... <<'EOF'
{
  "lang": "es",
  "idea": "One sentence.",
  "summary": ["Line 1", "Line 2"],
  "parts": [
    { "id": "skill", "label": "Skill", "purpose": "...", "reason": "...",
      "from": ["part:skills/fill-me-in", "part:skills/fill-me-in/scripts"] }
  ],
  "existing": [{ "id": "docs", "label": "Docs", "from": ["existing:."] }],
  "edges": [{ "from": "skill", "to": "docs", "label": "updates" }],
  "phases": [{ "name": "Build", "moves": ["..."] }],
  "open": { "pending": ["..."], "unverified": ["..."], "next": "..." }
}
EOF
```

- Give the same files and `--base` as to the map script.
- `<dir>` is the scratchpad directory of the session. Omit `--out` when the harness gives no scratchpad.
- Put each map part in the `from` list of exactly one part.
- `existing`, `edges`, and `open` are optional. Use `existing` to merge and name the groups of existing code. Use `edges` for code that a part uses, and to label an edge whose relation is not plain.
- Write the text in the language of the user. Keep code names as they are.
- The script writes the page, prints its path, and opens it in the browser.

If the script exits with 2, it lists each problem in the page data. Fix those fields and run it again, one time. If it fails again, reply with the full briefing in chat. Do the same when Node or git is not available. Draw the diagram as a tree with `├─`, `└─`, and `→` in a fenced `text` block. Put the state in brackets before each node. Tell the user why the page failed.

## Reply

Follow [plating](../plating/SKILL.md) for the English and Spanish rules. Reply in the language of the user. Write only these lines:

1. **Idea.** One sentence that states the idea of the change.
2. **Summary.** 3 lines or fewer. State whether the work is done, and what the user needs to do.
3. **Page.** The path of the page.

- Mark each claim that the session does not show as not verified, on the page and in chat.
- Do not repeat file contents or long command output.

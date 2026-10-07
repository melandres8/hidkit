---
name: fill-me-in
description: Use this skill when the user wants a briefing on the work of this session. It explains the general idea of the change, how it connects to the existing code, and the key moves, with a diagram. Use it for "fill me in", "catch me up", "what did you do", "walk me through the changes", "ponme al tanto", "qué se hizo", "qué hiciste", "cómo se conecta con lo que ya existe", or "explícame los movimientos", even when the user does not name the skill.
---
# Fill me in

Brief the user on the work of this session. The goal is understanding, not an inventory. Explain the idea and the reason of each change, and show how it fits the existing code.

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

## Diagram

The diagram shows how the change connects. Do not repeat the connections as a list of sentences.

- Draw the parts and the existing code from the map as nodes.
- Mark each node as new, modified, or existing. Use one color for each state, and add a legend.
- Label an edge only when its source and target do not make the relation plain.
- Write the node labels in the language of the user. Keep code names as they are.

The harness is the one that your system context names. Read the `show-diagram` row of its harness map, at `../cheffy/references/harness/<harness>.md`. Then pick the form:

- **Visual tool.** Use it whenever the harness has one. Draw only the overview. Make each part node request its detail on click, if the tool allows it.
- **Text diagram.** Use it when the harness has no visual tool. Draw a tree with `├─`, `└─`, and `→` in a fenced `text` block. Put the state in brackets before each node.
- **Mermaid.** Use a fenced `mermaid` block only in a file or a PR that GitHub renders.

When the user asks for the detail of a part, draw one diagram of the files of that part.

## Reply

Follow [plating](../plating/SKILL.md) for the English and Spanish rules. Reply in the language of the user. Use these sections in this order:

1. **Idea.** Write one sentence that states the idea of the change.
2. **Summary.** Write 3 lines or fewer. State whether the work is done, and what the user needs to do.
3. **Diagram.** Show the diagram. Under it, explain only the connections that it cannot show, in 3 sentences or fewer.
4. **Parts.** For each part, give its purpose and the reason for the change, in 2 sentences or fewer.
5. **Moves.** Show the phases.
6. **Open items.** List the work that is not done, the claims that nothing verified, and the next step.

- Mark each claim that the session does not show as not verified.
- Do not repeat file contents or long command output.

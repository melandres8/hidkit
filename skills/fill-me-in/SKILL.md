---
name: fill-me-in
description: Use this skill when the user wants a briefing on the work of this session. It explains what changed, how the change connects to the existing code, and which moves happened, with a diagram. Use it for "fill me in", "catch me up", "what did you do", "walk me through the changes", "ponme al tanto", "qué se hizo", "qué hiciste", "cómo se conecta con lo que ya existe", or "explícame los movimientos", even when the user does not name the skill.
---
# Fill me in

Brief the user on the work of this session. Show what changed, how it connects to the existing code, and every move. The goal is understanding, so explain the reason for each change, not only its location.

## Source

- Take what changed only from this session: the messages, the tool calls, and their results.
- Do not use git history, the ledger, or other sessions to find changes. They can hold work that this session did not do.
- A direct neighbour is a file that imports, calls, tests, configures, or documents a touched file.
- Use the content of the touched files that the session already holds. Read a touched file again only when the session does not show its final state.
- To find the neighbours, search the repository for the names of the touched files and their exported names. Use `git grep -n -i` with `run-shell`.
- Read only the matching lines and a few lines around them. Do not read a full neighbour file.
- If the context holds a summary of earlier turns, use it. Say which parts the summary does not cover.
- If the session holds no work, tell the user that you found nothing to report. Then stop. Do not invent changes.

## Moves

A move is one action of the session that changed the state of the work. List more than file edits:

- Branch operations, such as create, switch, merge, rebase, push, and pull.
- Commits, with their short hash and subject.
- Commands that failed or that the user denied, and what the session did instead.
- Decisions that the user made, such as an answer to a question, an approval, or a correction.
- Decisions that the agent made without the user, with the reason.

Put each move at the point where it happened. A decision inside an edit goes with that edit, not at the end.

## Diagram

Draw a diagram of the change and its connections.

- Mark each node as new, modified, or existing. Use one color for each state, and add a legend.
- Draw the edges from the changed parts to the existing code.
- Label an edge only when its source and target do not make the relation plain. Use one or two words, such as "calls" or "tests".
- Group small files into one node when the diagram has too many nodes.
- Write the node labels in the language of the user. Keep file names and code names as they are.

The harness is the one that your system context names. Read the `show-diagram` row of its harness map, at `../cheffy/references/harness/<harness>.md`. Then pick the form:

- **Visual tool.** Use it whenever the harness has one. Use 6 nodes or fewer in each diagram. For more nodes, draw one overview diagram, then one detail diagram for each part.
- **Text diagram.** Use it when the harness has no visual tool. Draw a tree with `├─`, `└─`, and `→` in a fenced `text` block. Put the state in brackets before each node, such as `[new]`.
- **Mermaid.** Use a fenced `mermaid` block only in a file or a PR that GitHub renders. Use `classDef` for the states, and put the legend in a `subgraph`.

## Reply

Follow [plating](../plating/SKILL.md) for the English and Spanish rules. Reply in the language of the user. Use these sections in this order:

1. **Summary.** Write 3 lines or fewer. State what changed, whether the work is done, and what the user needs to do.
2. **Diagram.** Show the diagram, as the Diagram section states.
3. **What changed.** For each new or modified part, give the path, the state, the purpose, and the reason.
4. **How it connects.** For each edge in the diagram, explain the relation in one sentence. Name the existing part by its path.
5. **Moves.** List the moves in the order that they happened. Mark each failed or denied move.
6. **Open items.** List the work that is not done, the claims that nothing verified, and the next step.

- Put a claim in the reply only when the session shows its evidence. Evidence is a tool result or a file that you read.
- If you cannot verify a claim, mark it as not verified.
- Do not repeat full file contents or long command output. Cite the path and the line instead.

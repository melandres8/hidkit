# Fill-me-in: HTML output (version 1)

Date: 2026-10-08. Status: approved by the user in chat.

## Goal

The fill-me-in briefing becomes one self-contained HTML page that opens in the browser. The chat reply keeps only the idea, a summary of 3 lines or fewer, and the path of the page.

## Decisions

- The page is a local file. The script writes it and opens it. It does not publish anything.
- A script builds the page. The model writes only the content that needs judgment. This keeps the output tokens low, the page consistent, and the code testable.
- No intermediate file. The model pipes the content to the script on stdin. The only file that stays is the HTML page.
- Version 1 adds a diagram with states, light and dark themes, and a detail panel for each part. It does not show diffs.

## Flow

1. The model runs `map.mjs` as before and reads its JSON. The output does not go to a file.
2. The model pipes the brief to `render.mjs` with a quoted heredoc (`<<'EOF'`), so the shell does not expand `$` or backticks:

   ```text
   node <skill-dir>/scripts/render.mjs [--base <commit>] [--out <dir>] [--no-open] <file>... <<'EOF'
   { ...brief... }
   EOF
   ```

3. `render.mjs` calls `mapChange` again, validates the brief against the map, builds the page, writes it, prints its path, and tries to open it.
4. The model replies in chat with the idea, the summary, and the path.

## Units

- `map.mjs`: unchanged, except that it exports `resolveBase(root, base)`. The function holds the current `--base` guard: it refuses a value that starts with `-` and resolves the value with `rev-parse --verify --quiet --end-of-options <base>^{commit}`. The CLI of both scripts uses it.
- `render.mjs` exports pure functions for the tests:
  - `validateBrief(brief, map)` returns a list of problems. It is empty when the brief is valid.
  - `buildModel(brief, map)` returns the nodes, the edges, and the notes.
  - `layout(model)` returns the positions.
  - `renderHtml(brief, map)` returns the page as a string. It is deterministic: the same input gives the same output. The page holds no timestamp.
  - The CLI block parses the arguments, reads stdin, writes the file, and opens it.

## Brief

```json
{
  "lang": "es",
  "idea": "One sentence.",
  "summary": ["Line 1", "Line 2"],
  "parts": [
    { "id": "skill", "label": "Skill fill-me-in", "purpose": "...", "reason": "...",
      "from": ["part:skills/fill-me-in", "part:skills/fill-me-in/scripts"] }
  ],
  "existing": [{ "id": "docs", "label": "Root docs", "from": ["existing:."] }],
  "edges": [{ "from": "skill", "to": "docs", "label": "updates" }],
  "phases": [{ "name": "Build", "moves": ["..."] }],
  "open": { "pending": ["..."], "unverified": ["..."], "next": "..." }
}
```

Rules:

- Required: `idea` (text), `summary` (1 to 3 lines), `parts` (1 to 4), `phases` (1 to 4, each with 1 or more moves).
- Optional: `lang` (`en` when missing), `existing`, `edges`, `open`.
- Each id is unique and matches `^[a-z0-9][a-z0-9-]*$`.
- Each part has `label`, `purpose`, `reason`, and `from`. The `from` list holds map part ids. Each map part is in exactly one brief part. A map part in no brief part is an error, because its content would be lost.
- `existing` merges and names map existing groups. When it is missing, each map existing group is one node, and its label is its directory.
- `edges` adds a connection that the map cannot see, such as code that a part uses. When an edge of the brief has the same ends as an edge of the map, it only adds the label. The ends are node ids.
- The diagram has 6 nodes or fewer. When `existing` is missing and the nodes are more than 6, the script keeps the existing groups with the most references and adds a note to the page: "N more groups of existing code are not shown". When `existing` is present, more than 6 nodes is an error.

## Node state

The legend has 3 states: new, modified, existing.

- A brief part is new when each file in its map parts is new.
- A brief part is existing when each file is unchanged.
- Each other brief part is modified. This includes a part with only deleted files. Its detail panel shows the count of each state.
- An existing node is always existing.

## Edges

- Each map edge goes to the brief nodes that hold its ends. Edges with the same ends add their references. An edge from a node to itself is dropped. An edge to a hidden node is dropped.
- An arrow means "refers to or uses".

## Page

Order: idea and summary, diagram with legend, detail panel, parts, phases, open items.

- Diagram: inline SVG. The layout puts each node in a column by the longest path from the nodes that refer to it. The script breaks cycles. The nodes in a column keep the order of the brief. Labels wrap to 3 lines.
- Each state has a color and a border: solid for new, dashed for modified, faint for existing. The state is clear without color.
- A part node is a button (`role="button"`, `tabindex="0"`). A click, Enter, or Space shows its detail panel. A second click or Esc hides it.
- Detail panel: purpose, reason, state counts, files (when the map lists them), and each connection with its sample lines.
- Open items: 3 groups: pending, not verified, next step. Empty groups do not show.
- Themes: `prefers-color-scheme`.
- Labels from the script (headings, legend, state names, the note) come from an `es` and `en` table. The `lang` field picks the table. An unknown `lang` uses `en`.

## Security

- The page loads nothing from the network. A CSP meta: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`.
- Each text is HTML-escaped. No brief text goes inside a `<script>` block. The detail panels are hidden HTML, and the script only toggles them.

## Output and opening

- `--out <dir>` sets the directory. The skill tells the model to pass the session scratchpad when the harness gives one. The default is `os.tmpdir()/hidkit-fill-me-in`.
- File name: `brief-YYYYMMDD-HHMMSS.html`. The script does not overwrite an earlier page.
- When the write to `--out` fails, the script writes to the default directory and says so on stderr.
- Open: `open` on macOS, `cmd /c start "" <file>` on Windows, `xdg-open` elsewhere. The child is detached, and its error is ignored. A failure to open is not an error: the script prints the path and exits with 0.
- `--no-open` writes the page and does not open it.

## Errors

Content errors: the model can fix them.

- `render.mjs` checks the full brief and reports each problem at once, so one retry is enough. Exit code 2.
- Each problem names the field, what it found, and what it expects. When possible, it lists the valid values:

  ```text
  render.mjs: 2 problems in the brief
    parts: found 5, the maximum is 4. Merge two parts with "from".
    parts[1].from[0]: "part:skill" is not in the map. Valid ids: part:skills/fill-me-in, part:test
  ```

- The model fixes those fields and retries once. If the second try fails, it replies in chat as before, with a text diagram, and says why the page failed.
- Prevention: the model reads the map before it writes. The skill shows the brief shape. Labels wrap. Optional fields have defaults. The script never cuts content without a note.

Environment errors: a retry does not help.

| Case | Result |
|---|---|
| No Node, or not a git repository | Text reply as before, with the cause |
| `--base` is not a commit | Exit 2, as in `map.mjs`. The model runs without `--base` |
| No brief on stdin, or the brief is not JSON | Exit 2 with the cause |
| The write fails in both directories | Exit 1. Text reply as before |
| The browser does not open | Not an error. The path is printed |
| The session touched no files | No page. The model says that it found nothing to report |

## Skill changes

- `SKILL.md`: rewrite the Diagram and Reply sections for the page. Remove the `show_widget` and Mermaid branches. Keep the text diagram as the fallback. Keep Source, Parts, and Moves. Stay inside the lint budget of 700 words; code blocks do not count.
- `CHANGELOG.md`: fill-me-in is still under Unreleased, Added. Edit that entry. Do not add a Changed entry.
- `README.md`: update the fill-me-in row.

## Tests

`test/fill-me-in-render.test.mjs`, with `node --test`. Each test passes `--no-open`.

- Validation: limits, unknown ids, duplicate ids, missing fields, an uncovered map part, all problems in one report.
- Model: merged state, summed edges, no self-edges, label from a brief edge, hidden existing groups with a note.
- Security: the payload `</script><img src=x onerror=alert(1)>` appears only escaped. No `src`, `href`, or `url(` points outside the page.
- Determinism: the same input gives the same page.
- Language: `es` labels for `lang: "es"`, `en` for an unknown value.
- CLI: writes the page and prints its path; exit 2 for a bad brief, empty stdin, and a bad `--base` (also `--base --output=x`).

## Out of scope

Diffs, publication to a server, persistence of the page in the repository, and a change to `map.mjs` output.

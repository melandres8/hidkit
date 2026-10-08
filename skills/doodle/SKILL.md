---
name: doodle
description: Use this skill when the user wants an illustration, drawing, or image for a Substack post, a newsletter, or a blog. It draws a black and white doodle with good taste, and it delivers an SVG and a PNG. The user gives the idea of the post or a description of the drawing. Use it for "illustration for my post", "header image for Substack", "draw me", "doodle", "cover for my newsletter", "ilustración para mi post", "dibújame", "garabato", "portada para Substack", or "imagen para el newsletter", even when the user does not name the skill.
---
# Doodle

Draw an illustration for a Substack post: a black and white doodle with good taste. Deliver an SVG and a PNG.

## Input

The user gives the idea behind a post, or a description of the drawing. The full post is not necessary.

- When the user describes the drawing, draw that description.
- When the user gives an idea, find a visual concept. Think of 3 concepts, and pick the one that reads fastest.
- When the user names no format, use `cover`.
- Ask a question only when the subject is unclear. Do not ask about the format or the style.

## Formats

| Preset | Size in pixels | Use |
|---|---|---|
| `cover` | 1456 × 1048 | Post header and social preview |
| `wide` | 1200 × 630 | Wide social preview |
| `inline` | 1460 wide, free height | Drawing inside the text, such as a diagram |
| `spot` | 600 × 600 | Small icon between sections |

The sizes come from third-party guides, not from the Substack help pages. Not verified.

## Steps

1. Read [the style guide](references/style.md). It sets the idea, the composition, the line, and the shade.
2. Pick the concept.
3. Write the SVG to `<dir>/<slug>.svg`. Set the viewBox to the size of the preset, such as `0 0 1456 1048`.
4. Run the ink script with `run-shell`:

   ```text
   node <skill-dir>/scripts/ink.mjs --preset <preset> <dir>/<slug>.svg
   ```

5. If the script exits with 2, fix each problem that it lists. Then run it again.
6. Look at the PNG with `read-file`. Answer the taste check of the style guide.
7. If a check fails, fix the SVG one time and run the script again.

- `<skill-dir>` is the directory of this file.
- `<dir>` is the directory that the user names. Otherwise use the scratchpad directory of the session. Otherwise use `doodles/` in the working directory.
- The script checks the colors, adds the ink filter and a white sheet, and writes `<slug>.final.svg` and `<slug>.png`.
- The script adds a second, thinner pen line under the drawing. Add `--single` when the user wants cleaner lines.
- When the script finds no browser, it writes only the SVG. Tell the user that the PNG needs Chrome, Chromium, or Edge.

## Reply

Reply in the language of the user. Follow [plating](../plating/SKILL.md). Write only these lines:

1. **Concept.** One sentence about the drawing.
2. **Other concepts.** The 2 concepts that you did not pick, in one line. Leave out this line when the user described the drawing.
3. **Files.** The path of the PNG and the path of the final SVG.
4. **Next.** Tell the user to ask for a change or to pick another concept.

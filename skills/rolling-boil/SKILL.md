---
name: rolling-boil
description: Use this skill when the user wants to animate a doodle, bring an illustration to life, or make a drawing move. It animates a doodle SVG with motion in the hand-drawn style, such as line boil, a blink, steam, or a sway, and delivers a looping GIF for Substack and an animated SVG for the web. Use it for "animate my doodle", "make it move", "bring it to life", "add motion", "GIF for my post", "anima el doodle", "dale vida", "que se mueva", "ponle movimiento", "hazlo GIF", or "animación para Substack", even when the user does not name the skill. To draw a new still image, use doodle first.
---
# Rolling boil

Animate a doodle in the style of a hand-drawn cartoon. Deliver a looping GIF for Substack and an animated SVG for the web.

## Input

The input is the drawing SVG that the doodle skill wrote, `<slug>.svg`. A `<slug>.final.svg` also holds the clean drawing, inside `<g filter="url(#doodle-ink)">`.

- When the user names no drawing, use the last doodle of the session.
- When the user gives a final SVG and no drawing SVG, extract the drawing from the final SVG.
  - Copy the content of `<g filter="url(#doodle-ink)">` into a new `<svg>` with the same viewBox. Write it as the copy of step 4.
  - Do not use the `doodle-retrace` group. It is a second copy of the same lines, without the labels.
  - The user often keeps only the final SVG and the PNG, because the reply of doodle names only those files.
- When the user has only a PNG, ask for the drawing SVG. If there is none, draw the scene again with doodle first.
- When the user has no drawing, draw it with doodle first. Then animate it.
- When the user describes the motion, make that motion.
- Otherwise pick the motion. Ask a question only when the idea of the drawing is unclear.

## Steps

1. Read [the motion guide](references/motion.md). It lists the motions, the attributes, and the taste check.
2. Read the drawing SVG. Find the idea and the moment of the drawing.
3. Pick one main motion and at most 2 small ones.
4. Copy the drawing to `<dir>/<slug>.anim.svg`. Do not change the drawing SVG of doodle.
5. In the copy, wrap each moving part in a `<g>` with `data-motion` and its attributes.
6. Run the motion script with `run-shell`:

   ```text
   node <skill-dir>/scripts/motion.mjs --preset <preset> <dir>/<slug>.anim.svg
   ```

7. If the script exits with 2, fix each problem that it lists. Then run it again.
8. Look at `<slug>.frames.png` with `read-file`. It shows 4 frames of the loop. Answer the taste check of the motion guide.
   - Each frame of the sheet is at half size, so a small part is hard to see.
   - When a moving part is small, crop it from the sheet with ffmpeg and enlarge it 3 times. Look at the crop.
9. If a check fails, fix the copy one time and run the script again.

- `<skill-dir>` is the directory of this file.
- `<dir>` is the directory of the drawing SVG.
- Use the preset, `--paper`, `--material`, `--seed`, and `--single` of the doodle run, so the animation matches the still image. When you do not know them, use the defaults of doodle.
- The script takes 30 to 60 seconds. It renders each frame with headless Chrome.
- The script writes `<slug>.motion.svg`, `<slug>.gif`, and `<slug>.frames.png`. Its last line gives the size of the GIF.
- Add `--draw` only when the user asks to see the drawing being drawn.
- Add `--no-boil` when the user wants the lines to stay still.
- The GIF is 800 pixels wide by default. Set another width with `--gif-width`.
- When the GIF is larger than 5 MB, run the script again with `--gif-width 600`. The limit of Substack for a GIF is not verified.
- When the script finds no browser or no ffmpeg, it writes only the animated SVG. Tell the user what to install.

## Reply

Reply in the language of the user. Follow [plating](../plating/SKILL.md). Write only these lines:

1. **Motion.** One sentence about the main motion and why it helps the idea.
2. **Details.** The small motions, in one line. Leave out this line when there are none.
3. **Files.** The path of the GIF, with its size, and the path of the animated SVG.
4. **Use.** Put the GIF in the Substack post. Substack does not play an animated SVG. Use the SVG on a web page.
5. **Next.** Tell the user to ask for a change, such as less motion, no boil, or the draw mode.

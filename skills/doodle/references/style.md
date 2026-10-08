# Doodle style

The look is a quick pen sketch in black ink on white paper, by someone with a good eye. It looks loose, but each line has a job.

## Idea

- Show one idea per drawing. The reader MUST get it in 2 seconds, without the title.
- Prefer a twist on a familiar object to a literal scene. A small surprise makes the drawing memorable.
- Do not repeat the headline as text. The drawing adds a second layer of meaning.
- Avoid stock symbols: light bulb, rocket, puzzle pieces, handshake, gears, target with arrow, and mountain with flag. Use one only with a twist that changes its meaning.

| Input | Weak concept | Strong concept |
|---|---|---|
| The hidden cost of meetings | A clock and a group at a table | A calendar page with a bite out of it, and crumbs below |
| How technical debt piles up | A pile of money | A tower of boxes, the lower ones squashed, a small figure adds one more on top |
| Writing every day | A pen and paper | A pencil worn down to a stub, next to a tall stack of pages |

## Personality

A clean drawing of the right object is not enough. Each drawing needs a reason to look twice.

- Add one character detail. It can be a face on an object, a small observer who reacts, or an absurd detail.
- Draw the specific thing, not the generic one. Draw a chipped mug with a coffee drip, not "a cup".
- Exaggerate one property: size, angle, count, or emotion.
- Show a moment: the second before something happens, or the result right after it.
- Give a figure that carries the emotion a head of at least 8 percent of the shorter side. A small face cannot show feelings.
- Put one bold black shape in the drawing, such as hair, a screen, or a shadow. It gives the eye a place to land.

| Generic | With personality |
|---|---|
| A cup with steam | A mug with a chip in the rim, a coffee drip, sleepy eyes, and a coffee ring next to it |
| Four boxes in a loop | Four small objects in a loop, one arrow with a loop-the-loop, and a tiny figure on one of them |

## Composition

- Give the drawing one focal point. Put it off center, near a third of the sheet.
- Keep 40 to 60 percent of the sheet empty. White space is part of the drawing.
- Use 3 to 7 elements in total. Remove each element that does not help the idea.
- Anchor objects with a short ground line or a scribbled shadow. Do not draw full backgrounds or frames.
- Make the main subject fill about half of the shorter side of the sheet.
- For `spot`, draw one object only.
- For a diagram, use 2 to 5 nodes, hand-drawn arrows, and short labels.
- Draw each diagram node as a small object, not as a box. Put the label under the object.

## Line

- Use one pen with 3 weights. Set the normal stroke width to about 0.3 percent of the viewBox width, which is 4 at 1456.
- Use 1.4 times the normal width for the main outlines, and half of it for hatching and small details.
- Set `fill="none"`, `stroke="#000"`, `stroke-linecap="round"`, and `stroke-linejoin="round"` on the drawing group.
- Draw shapes as paths, not as `<rect>` or `<circle>`. A perfect shape looks like clip art.
- Give each straight line a small bow. Put its control points 1 to 2 percent off the straight line.
- Let lines pass the corners by a few units. Leave a small gap where a closed shape meets itself.
- The script adds a second pen line to the full drawing. Draw an extra path by hand only on 1 or 2 main outlines.
- Do not trace every edge. A broken outline lets the eye complete the shape.

## Shade and fill

- Show shade with hatching: short parallel strokes at about 45 degrees, 6 to 10 units apart.
- Cross the hatching for dark areas. Let hatch strokes end unevenly.
- For a dark area with energy, use a scribble fill: one zigzag line that goes back and forth.
- Use solid black only for small accents, such as pupils, a hat band, or a cast shadow. Use at most one large black shape.
- Use `fill="#fff"` to hide the lines behind an object.
- Do not use gray, color, gradients, or opacity. The script refuses them.

## Figures

- Draw a person with a round head, dot eyes, and a line for the mouth. Make the body a few lines or a soft sack shape.
- Show emotion with the eyebrows and the posture, not with detail.
- Draw hands as small loops. A big head is fine.

## Text

- Use at most 3 labels, each of 1 to 3 words. Many drawings need no label.
- Write labels in lowercase, in the language of the user.
- Use `font-family="'Bradley Hand', 'Segoe Print', 'Chalkboard', cursive"`, `fill="#000"`, and `stroke="none"`.
- Set the font size to about 2.5 percent of the viewBox width.
- Turn each label by 2 to 4 degrees, with `transform="rotate(...)"`. Labels on a straight baseline look typed.
- Point from a label to its object with a small curved arrow, not a straight line.

## Taste check

Look at the PNG and answer each question:

1. Does the idea read in 2 seconds without the title?
2. Can you remove an element and lose nothing? Then remove it.
3. Does it look like clip art or a corporate icon? Then loosen the lines and break the outlines.
4. Is the focal point off center, with room around it?
5. Does each line look drawn by hand?
6. Is a label cut, too small, or on top of a line?
7. Is there one detail that makes the reader smile or look twice? If not, add one.

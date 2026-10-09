# Motion guide

The motion makes a doodle feel alive, like a hand-drawn cartoon. It does not turn the doodle into a slick product animation. The idea of the drawing stays first. The motion makes the reader look twice.

## Idea

- Give the drawing one main motion. It MUST serve the idea of the drawing.
- Find the moment in the drawing, and move the part that tells it. A mug that steams says "the coffee is hot". A sweat drop that pulses says "the character is nervous".
- Add at most 2 small motions that support the main one. A blink or a breath makes the character feel alive.
- Leave most of the drawing still. A drawing where everything moves has no focal point.
- The line boil runs on the full drawing. It is not a motion that you add.

| Drawing | Weak motion | Strong motion |
|---|---|---|
| A calendar page with a bite out of it | The full page bobs up and down | Crumbs fall in 2 poses, and the page stays still |
| A tower of boxes, a figure adds one more | The tower spins | The top box wiggles, and the figure breathes and blinks |
| A tired character with a mug of coffee | The character, the mug, and the label all move | The steam flows, the character blinks |

## Motions

The script knows these motions. Put `data-motion="<name>"` on a `<g>` that wraps the part.

| Motion | What moves | Default period | Use for |
|---|---|---|---|
| `sway` | Turns 3° to each side around the bottom of the part | 2.4 s | Plants, a figure that hesitates, a sign on a post |
| `bob` | Goes up 6 units and comes back | 1.2 s | A floating object, a happy jump |
| `breathe` | Grows 1.5 % taller from the feet | 2.4 s | A full character, a sleeping object |
| `pulse` | Grows 5 % from the center | 1.2 s | A heart, a notification dot, a sweat drop |
| `float` | Drifts in a small figure eight | 2.4 s | A cloud, a balloon, a thought |
| `wiggle` | Shakes in 4 small steps | 0.8 s | Nerves, a phone that rings, a box that is about to fall |
| `spin` | Turns a full circle | 2.4 s | A wheel, a fan, a loading circle |
| `flow` | Dashes travel along each line, from the start of the path to the end | 1.6 s | Steam, wind, water, the arrows of a diagram |
| `blink` | Shows the closed face for 0.2 s | 4.8 s | The eyes of the character |
| `swap` | Shows one pose at a time | 0.4 s per pose | Hand-drawn poses, such as an arm that waves, or falling crumbs |

## Attributes

Each attribute goes on the same `<g>` as `data-motion`.

- `data-amount`: a number that scales the motion, from 0.2 to 4. The default is 1. A negative amount turns `spin` and `sway` the other way.
- `data-period`: the time of one cycle in seconds, in steps of 0.1. Use a value that divides 4.8: 0.4, 0.6, 0.8, 1.2, 1.6, 2.4, or 4.8. Other values can make the loop longer than 9.6 s, and the script refuses them.
- `data-delay`: the start offset in seconds, in steps of 0.1. Give 2 similar parts different delays, so they do not move together.
- `data-origin`: the point that the part turns or grows around, as 2 percentages of the part. The default of `sway` and `breathe` is `"50% 100%"`, the bottom center. The default of the others is `"50% 50%"`.
- `data-frame`: needed for `blink` and `swap`.
  - For `blink`, use `"open"` on the group with the open face and `"closed"` on the group with `#char-face-blink`.
  - For `swap`, use `"1/3"`, `"2/3"`, and `"3/3"` on 3 groups, one for each pose. All poses MUST have the same `data-period`.

## Rules for the groups

- Put `data-motion` only on a `<g>`. The script refuses it on other elements.
- The `<g>` MUST NOT have a `transform`. The animation replaces it. Wrap the part in a new `<g>` instead.
- You MAY nest groups. A `breathe` group can hold the 2 `blink` groups of the character.
- Keep the label of a moving part outside its group, unless the label is part of the object.
- For `flow`, draw each path in the direction of the flow. For steam, start at the cup and end at the top.
- For `flow`, use paths of at least 150 units. The dashes do not show on a short path.
- For `swap`, draw each pose as a full copy of the part. Change only what moves.

## The character

- Wrap the body, the head, and the face of the character in one `breathe` group.
- For a blink, put the open face in a `blink` group with `data-frame="open"`.
- Then add `#char-face-blink` with the same transform, in a `blink` group with `data-frame="closed"`.
- The blink face has the brows and the mouth of the neutral face. Use the blink with `char-face-neutral`. With another face, the brows and the mouth jump during the blink.
- Do not move the head apart from the body. A gap opens at the neck.

## Line boil

The script draws the drawing 3 times, each with a different ink wobble. It shows one copy at a time, 5 times per second. The lines then look alive, as in a hand-drawn cartoon. The boil is on by default. Turn it off with `--no-boil` when the user wants a calm drawing.

## Draw mode

With `--draw`, the pen draws the doodle line by line, in the order of the file. Then the drawing holds for at least 2 seconds, and the loop starts again. Use it only when the user asks for it.

- Write the SVG in the order that a person draws.
- Put the main outline first, then the details, then the hatching, and then the labels.
- The character parts and the labels appear at once. They do not draw line by line.
- A fill appears when the line around it is complete.

## Taste check

Look at the frame sheet and answer each question:

1. Does the main motion help the idea? If it only decorates, change it or remove it.
2. Is there one main motion, with most of the drawing still?
3. Is each motion small? A big motion looks like clip art. Lower `data-amount` first.
4. Does the turning point look right? A plant MUST sway from its pot, not from its middle.
5. Do 2 similar parts move together like robots? Give them different `data-delay` values.
6. Does a part leave the sheet, or cover a label, in some frame?

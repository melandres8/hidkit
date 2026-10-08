# Character

The doodles have one recurring character: a dark-skinned man with a short afro, a mustache, a goatee, and round glasses. The character makes each drawing recognizable as part of the same newsletter.

## When

- Use the character in each drawing that shows a person, unless the user asks for other people.
- Draw other people only as small background figures. Give them simple round heads without the afro and the glasses.

## Parts

The ink script adds these parts to the page when the drawing uses them. Do not copy their paths.

| Id | Content |
|---|---|
| `char-head` | Afro, ears, stippled face, mustache, goatee, glasses, and nose |
| `char-face-neutral` | Calm eyes, brows, and mouth |
| `char-face-happy` | Closed happy eyes and an open smile |
| `char-face-worried` | Raised inner brows, a wavy mouth, and a drop of sweat |
| `char-face-surprised` | Wide eyes and a round open mouth |
| `char-face-tired` | Half-closed eyes and a flat mouth |
| `char-body-standing` | Short sweater, arms down, stippled hands, trousers, and black shoes |

## Compose

The parts use one coordinate system. The feet are at `0 0`, the head center is at `0 -250`, and the full height is about 350 units.

Stack the body, the head, and one face with the same transform:

```xml
<use href="#char-body-standing" transform="translate(620 900) scale(1.1)"/>
<use href="#char-head" transform="translate(620 900) scale(1.1)"/>
<use href="#char-face-worried" transform="translate(620 900) scale(1.1)"/>
```

- Pick the scale so that the head is at least 8 percent of the shorter side. On `cover`, use a scale of 0.7 or more.
- Use `scale(-1.1 1.1)` to turn the character to the other side.
- For another pose, such as sitting or running, draw the body by hand. Keep `char-head` and a face part for the head.

## Hand-drawn parts

- Draw a hand-drawn body in the same style: a short ribbed sweater, trousers, black shoes, and round hands.
- Keep the sweater above the hips, and draw each trouser leg as a shape. A long sweater over thin legs reads as a skirt.
- Give each skin area a paper base first, with `fill="#fff"` and no stroke. Then draw the same shape with `fill="url(#doodle-stipple-dense)"`.
- Give each facial line on the skin a paper-colored halo. Draw the line first with `stroke="#fff"`, 4 units wider, and then in black.

## Respect

- Keep the facial features natural and in proportion. Do not exaggerate the lips, the nose, or other features.
- Keep the afro, the mustache, and the goatee from `char-head`. Do not change the hair to a stereotype.
- Laugh with the character, never at the character. The humor comes from the situation and the feelings, not from the looks.

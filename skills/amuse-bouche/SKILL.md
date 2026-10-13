---
name: amuse-bouche
description: Use this skill when the user wants to design a landing page, a home page, or a personal site, or to redesign one, with high taste. It finds the goal, studies the current site and the references, shows at least 3 visual directions to pick and mix, designs the page section by section, and writes a design spec with taste checks for the build. It does not build or deploy the page. Use it for "design my landing", "redesign this site", "make it not look like AI slop", "my portfolio site", "give me design directions", "diseña mi landing", "rediseña esta web", "que no parezca AI slop", "mi web personal", "dame direcciones de diseño", or "maximiza el taste", even when the user does not name the skill.
---
# Amuse-bouche

Design a landing page with high taste, and write a design spec that the build can follow. A chef sends an amuse-bouche before the meal: one small bite that sets the tone. A landing page does the same job for a product or a person.

This skill designs. It does not build, test, or deploy. Hand the approved spec to Cheffy or to another delivery skill.

## Output

- A design spec, approved by the user, at `docs/superpowers/specs/<date>-<slug>-design.md` in the project.
- When the user names another path, use that path.
- The prototypes of the directions, as HTML files and screenshots in the scratchpad directory of the session.

## Steps

1. Find the goal. Read [the goal questions](references/goal.md). Ask each open question with `ask-human`, one at a time.
2. Study the inputs. Read [the study guide](references/study.md). Study the current site, the references, and the brand assets.
3. Write back your understanding in 5 lines or fewer. Separate what the user said from your assumptions. Wait for a yes.
4. Make at least 3 directions. Read [the directions guide](references/directions.md). Show each one at desktop and mobile size.
5. Let the user pick, change, or mix the directions. Explain each element that the user questions.
6. Design the page section by section. Present one section. Wait for approval before the next one.
7. Run the taste check of [the taste guide](references/taste.md) on each screenshot before you show it.
8. Apply [the honesty rules](references/honesty.md) to each claim, number, and form.
9. Write the spec with [the spec template](references/spec.md). Copy the taste checks and the honesty rules into it.
10. Review the spec yourself: no placeholders, no contradictions, no claim without a source. Fix each problem.
11. Ask the user to review the spec. On approval, hand it off.

## Rules

- You MUST show at least 3 directions before you design the final page.
- Each element MUST have a reason to exist. State the reason in one sentence, or remove the element.
- The page MUST show proof, not decoration. Use the real content of the product or the person, such as real clips, real commits, or real metrics.
- The hero media MUST tell the same story as the rest of the page.
- Use the assets of the user and the brand first: the logo, the brand color, the photos, and the media.
- When the user gives references, take one move from each reference. Do not copy a full layout.
- When the user rejects every direction, find the cause of the rejection first. Do not make louder copies of the same ideas.
- Sign the work with the name that the user gives. Never sign with a company name unless the user asks for it.
- You MUST NOT publish a prototype. The user decides where each file goes.

## Reply

Reply in the language of the user. Follow [plating](../plating/SKILL.md).

- While you design, end each message with one question or one approval request.
- At the end, write only these lines:
  1. **Direction.** The name of the chosen direction, and one sentence about it.
  2. **Spec.** The path of the design spec.
  3. **Prototypes.** The path of the directory with the HTML files and the screenshots.
  4. **Next.** Tell the user to start the build with Cheffy or with another delivery skill.

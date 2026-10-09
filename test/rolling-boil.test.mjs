import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterDefs, inkSvg } from '../skills/doodle/scripts/ink.mjs';
import { animate, animationCss, BOIL, drawSlots, frameCss, lcm, loopLength, MAX_LOOP, tagDraw, tagMotion } from '../skills/rolling-boil/scripts/motion.mjs';
import { cleanupTempRepos, tempDir } from './helpers.mjs';

after(cleanupTempRepos);

const MOTION = fileURLToPath(new URL('../skills/rolling-boil/scripts/motion.mjs', import.meta.url));
const SHEET = fs.readFileSync(fileURLToPath(new URL('../skills/doodle/assets/character.svg', import.meta.url)), 'utf8');

const drawing = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">${body}</svg>`;
const CUP = '<path d="M100 100 C 120 300, 300 300, 320 100" fill="none" stroke="#000"/>';
const STEAM = '<g data-motion="flow" data-period="1.6"><path d="M200 90 C 180 40, 220 0, 200 -40"/></g>';

test('tagMotion gives each motion group a class and removes the data attributes', () => {
  const { svg, tracks, problems } = tagMotion(drawing(`<g data-motion="sway" data-amount="0.5" data-delay="0.3" data-origin="50% 80%">${CUP}</g>${STEAM}`));
  assert.deepEqual(problems, []);
  assert.match(svg, /<g class="m m-0">/);
  assert.match(svg, /<g class="m m-1">/);
  assert.ok(!svg.includes('data-'));
  assert.deepEqual(tracks.map((t) => [t.name, t.period, t.amount, t.shift, t.origin]), [
    ['sway', 24, 0.5, 3, '50% 80%'],
    ['flow', 16, 1, 0, undefined],
  ]);
});

test('tagMotion refuses a transform on the group, a motion on another element, and bad attributes', () => {
  const text = tagMotion(drawing([
    '<g data-motion="bob" transform="translate(5 5)"/>',
    '<path data-motion="bob" d="M0 0"/>',
    '<g data-motion="dance"/>',
    '<g data-motion="bob" data-amount="9"/>',
    '<g data-motion="bob" data-period="0.25"/>',
    '<g data-motion="blink"/>',
    '<g data-motion="swap" data-frame="3/2"/>',
    '<g data-motion="swap" data-frame="1/3" data-period="1"/>',
    '<g data-motion="flow" data-origin="50% 50%"/>',
  ].join(''))).problems.join('\n');
  for (const part of ['has a transform', '<path>: put data-motion on a <g>', 'unknown motion', 'data-amount="9"', 'data-period="0.25"', 'data-frame must be "open" or "closed"', 'data-frame must be "<pose>/<poses>"', 'split into 3 equal poses', 'data-origin works only']) {
    assert.ok(text.includes(part), part);
  }
});

test('the loop is the least common multiple of the periods, and draw mode adds a hold', () => {
  assert.equal(lcm([24, 16, 6]), 48);
  assert.equal(loopLength([24, 16, 6]), 48);
  assert.equal(loopLength([24, 6], 30), 72);
  const r = animate(drawing(`<g data-motion="bob" data-period="1.3">${CUP}</g><g data-motion="sway" data-period="0.7">${CUP}</g>`), { preset: 'cover' });
  assert.ok(lcm([13, 7, 6]) > MAX_LOOP);
  assert.match(r.problems.join('\n'), /repeat together only after 54\.6 s/);
});

test('inkSvg with boil repeats the drawing with its own filters and keeps each id once', () => {
  const svg = drawing('<path id="a" d="M0 0 L 9 9"/><text x="1" y="1">hi</text>');
  const out = inkSvg(svg, { preset: 'cover', paper: 'white', boil: 3 });
  for (let k = 0; k < 3; k += 1) assert.match(out, new RegExp(`<g class="doodle-boil doodle-boil-${k}">`));
  assert.match(out, /<filter id="doodle-ink-1"/);
  assert.match(out, /<filter id="doodle-retrace-2"/);
  assert.equal((out.match(/id="a"/g) ?? []).length, 1);
  assert.equal((out.match(/>hi</g) ?? []).length, 3);
  assert.ok(!inkSvg(svg, { preset: 'cover', paper: 'white' }).includes('doodle-boil'));
});

test('the motion classes reach the second pen line and each boil copy', () => {
  const r = animate(drawing(`<g data-motion="sway">${CUP}</g>`), { preset: 'cover', paper: 'white' });
  assert.deepEqual(r.problems, []);
  assert.equal((r.svg.match(/class="m m-0"/g) ?? []).length, 2 * BOIL.copies);
});

test('a frame shows one boil copy and holds the blink for 2 frames', () => {
  const svg = drawing('<g data-motion="blink" data-frame="open"><use href="#char-face-neutral"/></g><g data-motion="blink" data-frame="closed"><use href="#char-face-blink"/></g>');
  const r = animate(svg, { preset: 'cover', character: characterDefs(SHEET) });
  assert.deepEqual(r.problems, []);
  assert.equal(r.loop, 48);
  // The first line of the frame CSS is the base style. The lines after it set the frame.
  const rules = (f) => r.frame(f).match(/<style>([\s\S]*?)<\/style>/)[1].split('\n').slice(1).join('\n');
  for (const f of [0, 2, 5]) {
    assert.deepEqual(rules(f).match(/doodle-boil-\d(?=\{visibility:visible)/g), [`doodle-boil-${Math.floor(f / 2) % 3}`]);
  }
  const closed = (f) => /\.m-1\{visibility:visible\}/.test(rules(f));
  const blinks = Array.from({ length: 48 }, (_, f) => closed(f)).map((v, f) => (v ? f : -1)).filter((f) => f >= 0);
  assert.deepEqual(blinks, [29, 30]);
});

test('the animated SVG has keyframes for each track and respects reduced motion', () => {
  const r = animate(drawing(`<g data-motion="sway">${CUP}</g>${STEAM}`), { preset: 'cover' });
  assert.match(r.svg, /^<svg[^>]*><style>/);
  assert.match(r.svg, /@keyframes m-0\{0%\{transform:rotate\(0deg\)\}/);
  assert.match(r.svg, /\.m-1\{animation:m-1 1\.6s step-end/);
  assert.match(r.svg, /@keyframes doodle-boil/);
  assert.match(r.svg, /@media \(prefers-reduced-motion:reduce\)\{\.doodle-boil,\.m,\.d\{animation:none!important\}\}/);
  const css = animationCss({ tracks: [], slots: [], loop: 48, boil: false, unit: 1 });
  assert.ok(!css.includes('@keyframes doodle-boil'));
});

test('draw mode draws each line in the order of the file and then holds the drawing', () => {
  const { svg, items } = tagDraw(drawing(`${CUP}<text x="1" y="1">hi</text><use href="#a"/>`));
  assert.match(svg, /<path pathLength="1" class="d dl d-0"/);
  assert.match(svg, /<text class="d d-1"/);
  assert.ok(!/<use pathLength/.test(svg));
  const { frames, slots } = drawSlots(items);
  assert.equal(frames, 20);
  assert.ok(slots[0].s === 0 && slots[2].e <= 20 + 1e-9);
  const plan = { tracks: [], slots, loop: loopLength([6], frames), boil: false, unit: 1 };
  assert.equal(plan.loop, 42);
  assert.match(frameCss(plan, 1), /\.d-0\{visibility:inherit;stroke-dashoffset:0\.\d+;fill-opacity:0\}/);
  assert.match(frameCss(plan, 1), /\.d-2\{visibility:hidden\}/);
  assert.match(frameCss(plan, 41), /\.d-0\{visibility:inherit;stroke-dashoffset:0;fill-opacity:1\}/);
});

test('draw mode shows a flow group as one item and keeps its lines without pathLength', () => {
  const r = animate(drawing(`${CUP}${STEAM}`), { preset: 'cover', paper: 'white', boil: false, draw: true });
  assert.deepEqual(r.problems, []);
  assert.match(r.svg, /<g class="m m-0 d d-1">/);
  assert.match(r.svg, /<path d="M200 90/);
  assert.match(r.svg, /\.dl\{stroke-dasharray:1 1\}/);
  assert.ok(!/\.d\{stroke-dasharray/.test(r.svg));
  assert.ok(!/pathLength="1"[^>]*d="M200 90/.test(r.svg));
});

const run = (args, env = {}) => spawnSync(process.execPath, [MOTION, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('the CLI writes the animated SVG and refuses a bad drawing', () => {
  const dir = tempDir('motion-cli-');
  const ok = path.join(dir, 'cup.anim.svg');
  fs.writeFileSync(ok, drawing(`<g data-motion="wiggle">${CUP}</g>`));
  const r = run(['--preset', 'cover', ok], { DOODLE_CHROME: path.join(dir, 'missing') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(dir, 'cup.motion.svg'));
  assert.match(r.stderr, /GIF was not made/);

  const bad = path.join(dir, 'bad.anim.svg');
  fs.writeFileSync(bad, drawing('<g data-motion="bob" transform="scale(2)"/>'));
  const b = run(['--preset', 'cover', bad]);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /1 problem in .*has a transform/s);
  assert.equal(run(['--preset', 'huge', ok]).status, 2);
});

test('swap shows one pose at a time, and sway turns 3 degrees at a quarter of its period', () => {
  const r = animate(drawing(`<g data-motion="swap" data-frame="1/2">${CUP}</g><g data-motion="swap" data-frame="2/2">${CUP}</g><g data-motion="sway">${CUP}</g>`), { preset: 'cover', boil: false });
  assert.deepEqual(r.problems, []);
  const rules = (f) => r.frame(f).match(/<style>([\s\S]*?)<\/style>/)[1].split('\n').slice(1).join('\n');
  const pose2 = Array.from({ length: 8 }, (_, f) => /\.m-1\{visibility:visible\}/.test(rules(f)));
  assert.deepEqual(pose2, [false, false, false, false, true, true, true, true]);
  assert.match(rules(6), /\.m-2\{transform:rotate\(3deg\)\}/);
});

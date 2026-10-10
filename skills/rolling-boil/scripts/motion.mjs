#!/usr/bin/env node
// Animates a doodle SVG. The drawing marks the parts that move with data-motion attributes. The script inks the drawing
// with the doodle ink, adds the CSS animation, and writes an animated SVG. It then renders each frame with headless
// Chrome and joins the frames into a looping GIF with ffmpeg.
// Usage: node motion.mjs --preset <cover|wide|inline|spot> [--paper <name>] [--material <light|full|none>] [--seed <n>]
//   [--single] [--no-boil] [--draw] [--gif-width <px>] [--out <dir>] <drawing.anim.svg>
// Prints the path of the animated SVG, the GIF, and the frame sheet, one per line, then one line with the GIF size.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { characterDefs, checkSvg, findChrome, inkSvg, MATERIALS, PAPERS, PRESETS, sizeFor } from '../../doodle/scripts/ink.mjs';

// The animation runs at 10 frames per second. Every period is a whole number of frames, so the GIF loops without a jump.
export const FPS = 10;
export const MAX_LOOP = 96;
// Boil: 3 copies of the drawing, each visible for 2 frames, so the lines change 5 times per second.
export const BOIL = { copies: 3, hold: 2 };

const TAU = Math.PI * 2;
const r = (n) => Math.round(n * 1000) / 1000 || 0;

// The 4 frames of the frame sheet. Each pick is 1 frame later than a quarter of the loop, so a short swap or blink
// does not show the same pose in each pick.
export const sheetFrames = (loop) => [0, 1, 2, 3].map((k) => Math.min(loop - 1, Math.floor((k * loop) / 4) + k));
// A smooth 0 to 1 to 0 curve over one period.
const ease = (u) => 0.5 - 0.5 * Math.cos(TAU * u);
const WIGGLE = [-2, 1.5, -1, 2];

// Each motion has a kind, a default period in frames, and a default transform origin.
// `at` returns the CSS value for a phase u from 0 to 1, an amount a, and the drawing unit (viewBox width / 1000).
export const MOTIONS = {
  sway: { kind: 'transform', period: 24, origin: '50% 100%', at: (u, a) => `rotate(${r(3 * a * Math.sin(TAU * u))}deg)` },
  bob: { kind: 'transform', period: 12, origin: '50% 50%', at: (u, a, unit) => `translate(0px, ${r(-6 * a * unit * ease(u))}px)` },
  breathe: { kind: 'transform', period: 24, origin: '50% 100%', at: (u, a) => `scale(1, ${r(1 + 0.015 * a * ease(u))})` },
  pulse: { kind: 'transform', period: 12, origin: '50% 50%', at: (u, a) => `scale(${r(1 + 0.05 * a * ease(u))})` },
  float: { kind: 'transform', period: 24, origin: '50% 50%', at: (u, a, unit) => `translate(${r(4 * a * unit * Math.sin(TAU * u))}px, ${r(3 * a * unit * Math.sin(2 * TAU * u))}px)` },
  wiggle: { kind: 'transform', period: 8, origin: '50% 50%', at: (u, a) => `rotate(${r(WIGGLE[Math.floor(u * WIGGLE.length)] * a)}deg)` },
  spin: { kind: 'transform', period: 24, origin: '50% 50%', at: (u, a) => `rotate(${r(360 * u * (a < 0 ? -1 : 1))}deg)` },
  flow: { kind: 'flow', period: 16 },
  blink: { kind: 'show', period: 48 },
  swap: { kind: 'show', period: null },
};

const MOTION_ATTRS = ['data-motion', 'data-amount', 'data-period', 'data-delay', 'data-origin', 'data-frame'];
const DRAWABLE = /<(path|line|polyline|polygon|ellipse|circle|rect|text|use)\b([^>]*?)(\/?)>/i;

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/\s([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[3] ?? m[4];
  return out;
}

function addClass(tag, cls) {
  if (/\sclass\s*=\s*"/.test(tag)) return tag.replace(/\sclass\s*=\s*"([^"]*)"/, (_, v) => ` class="${`${v} ${cls}`.trim()}"`);
  return tag.replace(/^<([a-zA-Z]+)/, `<$1 class="${cls}"`);
}

// Converts seconds to frames. Returns null when the value is not a whole number of frames.
function frames(seconds) {
  const n = Number(seconds) * FPS;
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const lcm = (values) => values.reduce((acc, v) => (acc * v) / gcd(acc, v), 1);

// Finds each <g> with data-motion and turns it into a track. Returns the drawing with the classes m and m-<n>,
// the tracks, and each problem.
export function tagMotion(svg) {
  const problems = [];
  const tracks = [];
  for (const m of svg.matchAll(/<([a-zA-Z]+)\b[^>]*\sdata-motion\s*=/g)) {
    if (m[1] !== 'g') problems.push(`<${m[1]}>: put data-motion on a <g> that wraps the part.`);
  }
  const out = svg.replace(/<g\b[^>]*\sdata-motion\s*=[^>]*>/g, (tag) => {
    const a = attrs(tag);
    const name = a['data-motion'];
    const where = `<g data-motion="${name}">`;
    const spec = MOTIONS[name];
    if (!spec) {
      problems.push(`${where}: unknown motion. Use one of ${Object.keys(MOTIONS).join(', ')}.`);
      return tag;
    }
    if (a.transform !== undefined) problems.push(`${where}: the group has a transform, and the animation replaces it. Wrap the part in a new <g> without a transform.`);
    const track = { i: tracks.length, name, kind: spec.kind, amount: 1, shift: 0, origin: spec.origin };
    if (a['data-amount'] !== undefined) {
      const v = Number(a['data-amount']);
      if (!Number.isFinite(v) || Math.abs(v) < 0.2 || Math.abs(v) > 4) problems.push(`${where}: data-amount="${a['data-amount']}" must be a number from 0.2 to 4, or from -4 to -0.2.`);
      else track.amount = v;
    }
    if (a['data-origin'] !== undefined) {
      if (spec.kind !== 'transform') problems.push(`${where}: data-origin works only with a motion that moves the part.`);
      else if (!/^\s*-?\d+(\.\d+)?%\s+-?\d+(\.\d+)?%\s*$/.test(a['data-origin'])) problems.push(`${where}: data-origin="${a['data-origin']}" must be 2 percentages of the part, such as "50% 100%".`);
      else track.origin = a['data-origin'].trim();
    }
    if (name === 'blink') {
      if (!['open', 'closed'].includes(a['data-frame'])) problems.push(`${where}: data-frame must be "open" or "closed".`);
      track.frame = a['data-frame'];
    }
    let poses = 0;
    if (name === 'swap') {
      const f = (a['data-frame'] ?? '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (!f || Number(f[1]) < 1 || Number(f[1]) > Number(f[2]) || Number(f[2]) < 2 || Number(f[2]) > 8) {
        problems.push(`${where}: data-frame must be "<pose>/<poses>", such as "1/2", with 2 to 8 poses.`);
      } else {
        track.pose = Number(f[1]);
        poses = Number(f[2]);
        track.poses = poses;
      }
    }
    track.period = spec.period ?? 4 * Math.max(poses, 1);
    if (a['data-period'] !== undefined) {
      const p = frames(a['data-period']);
      if (p === null || p < 4 || p > MAX_LOOP) problems.push(`${where}: data-period="${a['data-period']}" must be from 0.4 to ${MAX_LOOP / FPS} seconds, in steps of 0.1.`);
      else track.period = p;
    }
    if (poses && track.period % poses !== 0) problems.push(`${where}: the period must split into ${poses} equal poses of whole frames (0.1 s each).`);
    if (a['data-delay'] !== undefined) {
      const d = frames(a['data-delay']);
      if (d === null || d < 0) problems.push(`${where}: data-delay="${a['data-delay']}" must be 0 or more seconds, in steps of 0.1.`);
      else track.shift = d;
    }
    tracks.push(track);
    let next = addClass(tag, `m m-${track.i}`);
    // Replace each attribute with a space, so the text around it cannot join into a new attribute.
    for (const key of MOTION_ATTRS) next = next.replace(new RegExp(`\\s${key}\\s*=\\s*("[^"]*"|'[^']*')`, 'i'), ' ');
    return next.replace(/\s+(\/?>)$/, '$1');
  });
  return { svg: out, tracks, problems };
}

// Gives each element that draws the classes d and d-<n>, and each line also the class dl, in the order of the file. Lines get pathLength="1",
// so the dash animation does not need the length of each line. Each element gets a share of the drawing time.
// A flow group appears as one item, because its dashes need the real length of its lines.
export function tagDraw(svg, flowClasses = []) {
  const items = [];
  const flows = new Set(flowClasses);
  const stack = [];
  const out = svg.replace(/<g\b[^>]*?(\/?)>|<\/g\s*>|<(path|line|polyline|polygon|ellipse|circle|rect|text|use)\b[^>]*>/gi, (tag, selfClose) => {
    if (/^<\/g/i.test(tag)) {
      stack.pop();
      return tag;
    }
    const insideFlow = stack.includes(true);
    if (/^<g\b/i.test(tag)) {
      const cls = (attrs(tag).class ?? '').split(/\s+/);
      const flow = !insideFlow && cls.some((c) => flows.has(c));
      if (!selfClose) stack.push(flow || insideFlow);
      if (!flow) return tag;
      items.push({ i: items.length, appear: true, weight: 6 });
      return addClass(tag, `d d-${items.length - 1}`);
    }
    if (insideFlow) return tag;
    const [, name, rest, close] = tag.match(DRAWABLE);
    const a = attrs(tag);
    const appear = /^(text|use)$/i.test(name);
    // A longer path gets more time. The square root keeps a long hatch from taking all the time.
    const weight = appear ? 3 : Math.min(30, Math.max(3, Math.sqrt((a.d ?? a.points ?? '').length || 9)));
    items.push({ i: items.length, appear, weight });
    let next = addClass(`<${name}${rest}${close}>`, appear ? `d d-${items.length - 1}` : `d dl d-${items.length - 1}`);
    if (!appear && a.pathlength === undefined) next = next.replace(/^<([a-zA-Z]+)/, '<$1 pathLength="1"');
    return next;
  });
  return { svg: out, items };
}

// Picks the loop length in frames. Draw mode needs the drawing time plus a hold of at least 2 seconds.
export function loopLength(periods, drawFrames = 0) {
  const base = lcm(periods.length ? periods : [1]);
  if (!drawFrames) return base;
  return Math.ceil((drawFrames + 20) / base) * base;
}

const phase = (f, track) => ((((f - track.shift) % track.period) + track.period) % track.period);

// Returns the CSS declarations of a track at local frame g.
function trackAt(track, g, unit) {
  const u = g / track.period;
  const spec = MOTIONS[track.name];
  if (track.kind === 'transform') return `transform:${spec.at(u, track.amount, unit)}`;
  if (track.kind === 'flow') return `stroke-dashoffset:${r(-flowCycle(track, unit) * u)}px`;
  if (track.name === 'blink') {
    const start = Math.round(0.6 * track.period);
    const closed = g >= start && g < start + Math.max(1, Math.round(track.period / 24));
    return `visibility:${closed === (track.frame === 'closed') ? 'visible' : 'hidden'}`;
  }
  const size = track.period / track.poses;
  return `visibility:${Math.floor(g / size) === track.pose - 1 ? 'visible' : 'hidden'}`;
}

const flowCycle = (track, unit) => 40 * unit * Math.abs(track.amount);

// The style that holds when no animation runs: with reduced motion, and under the animation.
function baseCss(tracks, unit) {
  const rules = ['.doodle-boil{visibility:hidden}.doodle-boil-0{visibility:visible}'];
  for (const t of tracks) {
    if (t.kind === 'transform') rules.push(`.m-${t.i}{transform-box:fill-box;transform-origin:${t.origin}}`);
    if (t.kind === 'flow') rules.push(`.m-${t.i}{stroke-dasharray:${r(26 * unit * Math.abs(t.amount))}px ${r(14 * unit * Math.abs(t.amount))}px}`);
    if (t.name === 'blink' && t.frame === 'closed') rules.push(`.m-${t.i}{visibility:hidden}`);
    if (t.name === 'swap' && t.pose !== 1) rules.push(`.m-${t.i}{visibility:hidden}`);
  }
  // Only the lines get the dash. A flow group keeps its own dash.
  rules.push('.dl{stroke-dasharray:1 1}');
  return rules.join('');
}

// Places each element of the draw mode on the timeline. Returns the start and end frame of each element.
export function drawSlots(items) {
  const frames = Math.min(50, Math.max(20, Math.round(items.length * 0.6)));
  const total = items.reduce((s, it) => s + it.weight, 0) || 1;
  let at = 0;
  const slots = items.map((it) => {
    const s = at;
    at += (it.weight / total) * frames;
    return { ...it, s, e: at };
  });
  return { frames, slots };
}

function drawAt(slot, f) {
  if (f < slot.s) return 'visibility:hidden';
  // After its start, an element takes the visibility of its group, so a hidden blink or swap pose stays hidden.
  if (slot.appear) return 'visibility:inherit';
  const p = Math.min(1, (f - slot.s) / Math.max(slot.e - slot.s, 1e-6));
  return `visibility:inherit;stroke-dashoffset:${r(1 - p)};fill-opacity:${p < 1 ? 0 : 1}`;
}

// Returns the CSS of the animated SVG.
export function animationCss({ tracks, slots, loop, boil, unit }) {
  const rules = [baseCss(tracks, unit)];
  const delay = (shift, period) => `${r(-(((period - shift) % period) + period) % period / FPS)}s`;
  if (boil) {
    const period = BOIL.copies * BOIL.hold;
    rules.push(`@keyframes doodle-boil{0%{visibility:visible}${r((100 * BOIL.hold) / period)}%,100%{visibility:hidden}}`);
    for (let k = 0; k < BOIL.copies; k += 1) {
      rules.push(`.doodle-boil-${k}{animation:doodle-boil ${r(period / FPS)}s step-end ${delay(k * BOIL.hold, period)} infinite}`);
    }
  }
  for (const t of tracks) {
    const steps = Array.from({ length: t.period }, (_, g) => `${r((100 * g) / t.period)}%{${trackAt(t, g, unit)}}`);
    steps.push(`100%{${trackAt(t, 0, unit)}}`);
    rules.push(`@keyframes m-${t.i}{${steps.join('')}}`);
    rules.push(`.m-${t.i}{animation:m-${t.i} ${r(t.period / FPS)}s step-end ${delay(t.shift, t.period)} infinite}`);
  }
  for (const s of slots) {
    // A tiny gap before each change keeps visibility and fill from fading between 2 keyframes.
    const pct = (f) => r((100 * f) / loop);
    const eps = 0.01;
    const steps = [`0%{visibility:hidden}`, `${Math.max(0, pct(s.s) - eps)}%{visibility:hidden}`];
    if (s.appear) steps.push(`${pct(s.s)}%,100%{visibility:inherit}`);
    else {
      steps[0] = '0%{visibility:hidden;stroke-dashoffset:1;fill-opacity:0}';
      steps[1] = `${Math.max(0, pct(s.s) - eps)}%{visibility:hidden;stroke-dashoffset:1;fill-opacity:0}`;
      steps.push(`${pct(s.s)}%{visibility:inherit;stroke-dashoffset:1;fill-opacity:0}`, `${pct(s.e)}%{stroke-dashoffset:0;fill-opacity:0}`, `${Math.min(100, pct(s.e) + eps)}%,100%{visibility:inherit;stroke-dashoffset:0;fill-opacity:1}`);
    }
    rules.push(`@keyframes d-${s.i}{${steps.join('')}}`);
    rules.push(`.d-${s.i}{animation:d-${s.i} ${r(loop / FPS)}s linear infinite}`);
  }
  rules.push('@media (prefers-reduced-motion:reduce){.doodle-boil,.m,.d{animation:none!important}}');
  return rules.join('\n');
}

// Returns the CSS of one frame, with no animation. The GIF uses it, so the GIF and the SVG come from one timeline.
export function frameCss({ tracks, slots, boil, unit }, f) {
  const rules = [baseCss(tracks, unit)];
  if (boil) {
    const shown = Math.floor(f / BOIL.hold) % BOIL.copies;
    for (let k = 0; k < BOIL.copies; k += 1) rules.push(`.doodle-boil-${k}{visibility:${k === shown ? 'visible' : 'hidden'}}`);
  }
  for (const t of tracks) rules.push(`.m-${t.i}{${trackAt(t, phase(f, t), unit)}}`);
  for (const s of slots) rules.push(`.d-${s.i}{${drawAt(s, f)}}`);
  return rules.join('\n');
}

const withStyle = (svg, css) => svg.replace(/^(<svg\b[^>]*>)/i, `$1<style>${css}</style>`);

// Builds the animation. Returns the animated SVG, a function that returns the SVG of frame f, the loop length in
// frames, and each problem. The list of problems is empty when the drawing is valid.
export function animate(svg, { preset, seed = 1, retrace = true, paper = 'newsprint', material = 'light', character = '', boil = true, draw = false }) {
  const problems = checkSvg(svg);
  if (problems.length) return { problems };
  const tagged = tagMotion(svg);
  if (tagged.problems.length) return { problems: tagged.problems };
  let drawing = tagged.svg;
  let items = [];
  if (draw) ({ svg: drawing, items } = tagDraw(drawing, tagged.tracks.filter((t) => t.kind === 'flow').map((t) => `m-${t.i}`)));
  // Check the drawing again after the changes. A tag that the first check read in one way can read in another way
  // after an attribute is removed or added.
  const after = checkSvg(drawing);
  if (after.length) return { problems: after };
  const periods = tagged.tracks.map((t) => t.period);
  if (boil) periods.push(BOIL.copies * BOIL.hold);
  const { frames: drawFrames, slots } = draw ? drawSlots(items) : { frames: 0, slots: [] };
  const loop = loopLength(periods, drawFrames);
  if (loop > MAX_LOOP) {
    const list = [...new Set(periods)].map((p) => `${r(p / FPS)} s`).join(', ');
    return { problems: [`loop: the periods ${list} repeat together only after ${r(loop / FPS)} s. The limit is ${MAX_LOOP / FPS} s. Use periods that divide 4.8 s, such as 0.8, 1.2, 1.6, 2.4, or 4.8.`] };
  }
  if (!tagged.tracks.length && !boil && !draw) return { problems: ['motion: nothing moves. Add data-motion to a <g>, or remove --no-boil, or add --draw.'] };
  const inked = inkSvg(drawing, { preset, seed, retrace, paper, material, character, boil: boil ? BOIL.copies : 1 });
  const box = inked.match(/<svg\b[^>]*\sviewBox\s*=\s*["']([^"']+)["']/i)[1].trim().split(/[\s,]+/).map(Number);
  const plan = { tracks: tagged.tracks, slots, loop, boil, unit: box[2] / 1000 };
  return {
    problems: [],
    loop,
    tracks: tagged.tracks,
    svg: withStyle(inked, animationCss(plan)),
    frame: (f) => withStyle(inked, frameCss(plan, f)),
  };
}

function screenshot(chrome, svgFile, pngFile, { width, height }) {
  return new Promise((resolve) => {
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--window-size=${width},${height}`, `--screenshot=${pngFile}`, pathToFileURL(svgFile).href,
    ], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill(), 60000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && fs.existsSync(pngFile) && fs.statSync(pngFile).size > 0);
    });
  });
}

// Renders each frame with a pool of browsers. Returns false when a frame fails.
async function renderFrames(chrome, result, dir, size, workers = 4) {
  const name = (f) => path.join(dir, `f${String(f).padStart(3, '0')}`);
  let next = 0;
  let ok = true;
  // Headless Chrome makes its own temporary profile for each run. A fixed --user-data-dir makes the first start slow.
  const worker = async () => {
    while (ok && next < result.loop) {
      const f = next;
      next += 1;
      fs.writeFileSync(`${name(f)}.svg`, result.frame(f));
      if (!(await screenshot(chrome, `${name(f)}.svg`, `${name(f)}.png`, size))) ok = false;
    }
  };
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ok;
}

function ffmpeg(args) {
  const r2 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  return r2.status === 0 ? '' : (r2.stderr || r2.error?.message || 'ffmpeg failed').trim();
}

export function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opts = { seed: 1, retrace: true, paper: 'newsprint', material: 'light', boil: true, draw: false };
  let preset;
  let out;
  let gifWidth = 800;
  const files = [];
  const usage = (reason) => {
    console.error(`motion.mjs: ${reason}\nusage: motion.mjs --preset <${Object.keys(PRESETS).join('|')}> [--paper <${Object.keys(PAPERS).join('|')}>] [--material <${MATERIALS.join('|')}>] [--seed <n>] [--single] [--no-boil] [--draw] [--gif-width <px>] [--out <dir>] <drawing.anim.svg>`);
    process.exit(2);
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--preset') preset = args[++i];
    else if (args[i] === '--out') out = args[++i] ?? usage('--out needs a directory');
    else if (args[i] === '--seed') opts.seed = Number(args[++i]);
    else if (args[i] === '--single') opts.retrace = false;
    else if (args[i] === '--paper') opts.paper = args[++i];
    else if (args[i] === '--material') opts.material = args[++i];
    else if (args[i] === '--no-boil') opts.boil = false;
    else if (args[i] === '--draw') opts.draw = true;
    else if (args[i] === '--gif-width') gifWidth = Number(args[++i]);
    else files.push(args[i]);
  }
  if (!Object.hasOwn(PRESETS, preset ?? '')) usage(`--preset must be one of ${Object.keys(PRESETS).join(', ')}`);
  if (!Object.hasOwn(PAPERS, opts.paper ?? '')) usage(`--paper must be one of ${Object.keys(PAPERS).join(', ')}`);
  if (!MATERIALS.includes(opts.material)) usage(`--material must be one of ${MATERIALS.join(', ')}`);
  if (!Number.isInteger(opts.seed) || opts.seed < 0) usage('--seed must be an integer of 0 or more');
  if (!Number.isInteger(gifWidth) || gifWidth < 200 || gifWidth > 2000) usage('--gif-width must be an integer from 200 to 2000');
  if (files.length !== 1) usage('give exactly one SVG file');
  const input = files[0];
  if (!fs.existsSync(input)) usage(`${input} does not exist`);

  const svg = fs.readFileSync(input, 'utf8').replace(/^﻿/, '').replace(/^<\?xml[^>]*\?>\s*/, '').trim();
  const sheet = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'doodle', 'assets', 'character.svg');
  const character = fs.existsSync(sheet) ? characterDefs(fs.readFileSync(sheet, 'utf8')) : '';
  const result = animate(svg, { ...opts, preset, character });
  if (result.problems.length) {
    const n = result.problems.length;
    console.error(`motion.mjs: ${n} ${n === 1 ? 'problem' : 'problems'} in ${input}\n${result.problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(2);
  }

  const dir = path.resolve(out ?? path.dirname(input));
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(input).replace(/\.svg$/i, '').replace(/\.anim$/i, '');
  const motionSvg = path.join(dir, `${name}.motion.svg`);
  fs.writeFileSync(motionSvg, result.svg);
  console.log(motionSvg);

  const chrome = findChrome();
  if (!chrome) {
    console.error('motion.mjs: no Chrome, Chromium, or Edge found, so the GIF was not made. Set DOODLE_CHROME to a browser binary.');
    process.exit(0);
  }
  if (!hasFfmpeg()) {
    console.error('motion.mjs: ffmpeg was not found, so the GIF was not made. Install ffmpeg.');
    process.exit(0);
  }
  const box = result.svg.match(/<svg\b[^>]*\sviewBox\s*=\s*["']([^"']+)["']/i)[1].trim().split(/[\s,]+/).map(Number);
  const size = sizeFor(preset, { w: box[2], h: box[3] });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-frames-'));
  try {
    if (!(await renderFrames(chrome, result, work, size))) {
      console.error('motion.mjs: the browser did not render every frame.');
      process.exit(1);
    }
    const gif = path.join(dir, `${name}.gif`);
    const pattern = path.join(work, 'f%03d.png');
    let err = ffmpeg(['-framerate', String(FPS), '-i', pattern, '-vf',
      `scale=${gifWidth}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', gif]);
    if (err) {
      console.error(`motion.mjs: ffmpeg did not write the GIF: ${err}`);
      process.exit(1);
    }
    // A sheet of 4 frames, so the model can look at the motion as one image.
    const picks = sheetFrames(result.loop).map((f) => path.join(work, `f${String(f).padStart(3, '0')}.png`));
    const framesPng = path.join(dir, `${name}.frames.png`);
    err = ffmpeg([...picks.flatMap((p) => ['-i', p]), '-filter_complex',
      '[0][1]hstack[t];[2][3]hstack[b];[t][b]vstack,scale=1456:-2:flags=lanczos', '-frames:v', '1', '-update', '1', framesPng]);
    if (err) console.error(`motion.mjs: ffmpeg did not write the frame sheet: ${err}`);
    console.log(gif);
    if (!err) console.log(framesPng);
    const mb = fs.statSync(gif).size / 1048576;
    console.log(`gif: ${mb.toFixed(1)} MB, ${result.loop} frames, ${r(result.loop / FPS)} s loop, ${gifWidth} px wide`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

#!/usr/bin/env node
// Checks a doodle SVG, adds the ink filter and a white sheet, and exports a PNG with headless Chrome.
// Usage: node ink.mjs --preset <cover|wide|inline|spot> [--out <dir>] [--seed <n>] <drawing.svg>
// Prints the path of the final SVG and of the PNG, one per line.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Sizes from third-party Substack guides. `inline` takes its height from the viewBox.
export const PRESETS = {
  cover: { width: 1456, height: 1048 },
  wide: { width: 1200, height: 630 },
  inline: { width: 1460, height: null },
  spot: { width: 600, height: 600 },
};

const INKS = new Set(['none', 'black', 'white', '#000', '#000000', '#fff', '#ffffff', 'currentcolor', 'transparent', 'inherit']);
const FORBIDDEN_TAGS = ['script', 'image', 'foreignObject', 'iframe', 'linearGradient', 'radialGradient', 'pattern', 'style'];
const PAINT = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color'];
const OPACITY = ['opacity', 'fill-opacity', 'stroke-opacity'];

const isInk = (value) => {
  const v = value.trim().toLowerCase();
  return INKS.has(v) || /^url\(#[^)]+\)$/.test(v);
};

// Reads the paint and opacity declarations from the attributes and the style attributes of the SVG.
function declarations(svg) {
  const out = [];
  for (const m of svg.matchAll(/\s([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4];
    if (name === 'style') {
      for (const part of value.split(';')) {
        const [key, ...rest] = part.split(':');
        if (key && rest.length) out.push([key.trim().toLowerCase(), rest.join(':').trim()]);
      }
    } else out.push([name, value]);
  }
  return out;
}

// Returns each problem of the drawing. The list is empty when the drawing is valid.
export function checkSvg(svg) {
  const problems = [];
  const root = svg.match(/<svg\b[^>]*>/i);
  if (!root || !/<\/svg>\s*$/i.test(svg)) return ['svg: found no <svg> root element that closes at the end of the file.'];
  if (!viewBox(root[0])) problems.push('svg: the root needs a viewBox with 4 numbers, such as viewBox="0 0 1456 1048".');
  for (const tag of FORBIDDEN_TAGS) {
    if (new RegExp(`<${tag}\\b`, 'i').test(svg)) problems.push(`<${tag}>: not allowed. Draw with paths, lines, shapes, and text only.`);
  }
  const bad = new Set();
  for (const [name, value] of declarations(svg)) {
    if (name.startsWith('on')) bad.add(`${name}: event attributes are not allowed.`);
    else if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) bad.add(`${name}="${value}": only links inside the file (#id) are allowed.`);
    else if (PAINT.includes(name) && !isInk(value)) bad.add(`${name}="${value}": use only black, white, or none. Show shade with hatching.`);
    else if (OPACITY.includes(name) && !['0', '1'].includes(value.trim())) bad.add(`${name}="${value}": opacity makes gray. Use 0, 1, or hatching.`);
  }
  for (const m of svg.matchAll(/url\(\s*['"]?([^'")\s]+)/gi)) {
    if (!m[1].startsWith('#')) bad.add(`url(${m[1]}): only links inside the file (#id) are allowed.`);
  }
  return [...problems, ...bad];
}

function viewBox(rootTag) {
  const m = rootTag.match(/\sviewBox\s*=\s*["']([^"']+)["']/i);
  if (!m) return null;
  const nums = m[1].trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

// Returns the pixel size of the PNG for a preset and a viewBox.
export function sizeFor(preset, box) {
  const p = PRESETS[preset];
  return { width: p.width, height: p.height ?? Math.round((p.width * box.h) / box.w) };
}

// Returns the final SVG: the root gets the pixel size, a white sheet, and the ink filter around the drawing.
// The filter moves each line by a small random offset, so the strokes wobble like a pen on paper.
export function inkSvg(svg, { preset, seed = 1 }) {
  const rootTag = svg.match(/<svg\b[^>]*>/i)[0];
  const box = viewBox(rootTag);
  const { width, height } = sizeFor(preset, box);
  let root = rootTag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  root = root.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  if (!/\sxmlns\s*=/.test(root)) root = root.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const unit = box.w / 1000;
  const r = (n) => Math.round(n * 1000) / 1000;
  const defs = `<defs><filter id="doodle-ink" x="-5%" y="-5%" width="110%" height="110%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${r(0.02 / unit)}" numOctaves="3" seed="${seed}" result="noise"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="noise" scale="${r(6 * unit)}" xChannelSelector="R" yChannelSelector="G"/>`
    + '</filter></defs>';
  const sheet = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#fff"/>`;
  const start = svg.indexOf(rootTag);
  const end = svg.lastIndexOf('</svg>');
  const body = svg.slice(start + rootTag.length, end);
  return `${root}${defs}${sheet}<g filter="url(#doodle-ink)">${body}</g></svg>\n`;
}

// Finds a Chrome, Chromium, or Edge binary. DOODLE_CHROME overrides the search.
export function findChrome(env = process.env) {
  if (env.DOODLE_CHROME) return fs.existsSync(env.DOODLE_CHROME) ? env.DOODLE_CHROME : null;
  const apps = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const app of apps) if (fs.existsSync(app)) return app;
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (dir && fs.existsSync(file)) return file;
    }
  }
  return null;
}

function exportPng(chrome, svgFile, pngFile, { width, height }) {
  const r = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--window-size=${width},${height}`, `--screenshot=${pngFile}`, pathToFileURL(svgFile).href,
  ], { stdio: 'ignore', timeout: 60000 });
  return r.status === 0 && fs.existsSync(pngFile) && fs.statSync(pngFile).size > 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let preset;
  let out;
  let seed = 1;
  const files = [];
  const usage = (reason) => {
    console.error(`ink.mjs: ${reason}\nusage: ink.mjs --preset <${Object.keys(PRESETS).join('|')}> [--out <dir>] [--seed <n>] <drawing.svg>`);
    process.exit(2);
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--preset') preset = args[++i];
    else if (args[i] === '--out') out = args[++i] ?? usage('--out needs a directory');
    else if (args[i] === '--seed') seed = Number(args[++i]);
    else files.push(args[i]);
  }
  if (!Object.hasOwn(PRESETS, preset ?? '')) usage(`--preset must be one of ${Object.keys(PRESETS).join(', ')}`);
  if (!Number.isInteger(seed) || seed < 0) usage('--seed must be an integer of 0 or more');
  if (files.length !== 1) usage('give exactly one SVG file');
  const input = files[0];
  if (!fs.existsSync(input)) usage(`${input} does not exist`);

  const svg = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*\?>\s*/, '').trim();
  const problems = checkSvg(svg);
  if (problems.length > 0) {
    console.error(`ink.mjs: ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} in ${input}\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(2);
  }

  const dir = out ?? path.dirname(input);
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(input).replace(/\.svg$/i, '');
  const finalSvg = path.resolve(dir, `${name}.final.svg`);
  const png = path.resolve(dir, `${name}.png`);
  const inked = inkSvg(svg, { preset, seed });
  fs.writeFileSync(finalSvg, inked);
  console.log(finalSvg);

  const chrome = findChrome();
  if (!chrome) {
    console.error('ink.mjs: no Chrome, Chromium, or Edge found, so the PNG was not made. Set DOODLE_CHROME to a browser binary.');
    process.exit(0);
  }
  const size = sizeFor(preset, viewBox(inked.match(/<svg\b[^>]*>/i)[0]));
  if (!exportPng(chrome, finalSvg, png, size)) {
    console.error(`ink.mjs: the browser did not write ${png}`);
    process.exit(1);
  }
  console.log(png);
}

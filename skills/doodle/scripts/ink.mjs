#!/usr/bin/env node
// Checks a doodle SVG, adds the ink filter and a white sheet, and exports a PNG with headless Chrome.
// Usage: node ink.mjs --preset <cover|wide|inline|spot> [--paper <sketchbook|kraft|newsprint|white>] [--out <dir>] [--seed <n>] [--single] <drawing.svg>
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

// Paper tones and textures. `paper` is the sheet color, `ink` the line color. The other values set the strength of
// each texture from 0 to 1: grain (fine specks), mottle (uneven tone), fibers (short streaks), and vignette (darker edges).
export const PAPERS = {
  sketchbook: { paper: '#f4eee2', ink: '#1c1a17', grain: 0.6, mottle: 0.5, fibers: 0.2, vignette: 0.5 },
  kraft: { paper: '#d6c09b', ink: '#1f1810', grain: 0.8, mottle: 0.9, fibers: 0.6, vignette: 0.8 },
  newsprint: { paper: '#e7e4dc', ink: '#1a1a1a', grain: 1, mottle: 0.5, fibers: 0.2, vignette: 0.4 },
  white: { paper: '#ffffff', ink: '#000000', grain: 0, mottle: 0, fibers: 0, vignette: 0 },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// Returns the final SVG: the root gets the pixel size, a paper sheet, and the ink filter around the drawing.
// The filter moves each line by a small random offset, so the strokes wobble like a pen on paper. With `retrace`,
// a second copy of the lines sits under the drawing with other offsets, like a pen that goes over a line twice.
// The second copy leaves out the text, so labels stay sharp. A tone filter maps black to the ink color and white to
// the paper color, so white fills match the sheet. The paper textures lie on top of the drawing, so they also cover
// the fills and the ink.
export function inkSvg(svg, { preset, seed = 1, retrace = true, paper = 'sketchbook' }) {
  const rootTag = svg.match(/<svg\b[^>]*>/i)[0];
  const box = viewBox(rootTag);
  const { width, height } = sizeFor(preset, box);
  let root = rootTag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  root = root.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  if (!/\sxmlns\s*=/.test(root)) root = root.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const unit = box.w / 1000;
  const px = width / box.w;
  const r = (n) => Math.round(n * 1000) / 1000;
  const noise = (frequency, octaves, scale, s) =>
    `<feTurbulence type="fractalNoise" baseFrequency="${r(frequency / unit)}" numOctaves="${octaves}" seed="${s}" result="noise"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="noise" scale="${r(scale * unit)}" xChannelSelector="R" yChannelSelector="G"/>`;
  const region = 'x="-5%" y="-5%" width="110%" height="110%"';
  const filters = [`<filter id="doodle-ink" ${region}>${noise(0.02, 3, 6, seed)}</filter>`];
  // The second pen line is thinner (erode) and sits a little off the first one (offset).
  if (retrace) {
    filters.push(`<filter id="doodle-retrace" ${region}>${noise(0.008, 2, 16, seed + 101)}`
      + `<feMorphology operator="erode" radius="${r(0.6 * unit)}"/><feOffset dx="${r(2 * unit)}" dy="${r(-1.5 * unit)}"/></filter>`);
  }

  const p = PAPERS[paper];
  const sheet = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${p.paper}"/>`;
  const overlays = [];
  const toned = paper !== 'white';
  if (toned) {
    const [pr, pg, pb] = rgb(p.paper);
    const [ir, ig, ib] = rgb(p.ink);
    filters.push(`<filter id="doodle-tone" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${r(pr - ir)} 0 0 0 ${r(ir)} 0 ${r(pg - ig)} 0 0 ${r(ig)} 0 0 ${r(pb - ib)} 0 ${r(ib)} 0 0 0 1 0"/></filter>`);
    // Each texture is a noise field. The color matrix turns the red channel of the noise into the alpha of a dark color.
    const texture = (id, turbulence, color, gain, bias) => {
      const [cr, cg, cb] = color;
      filters.push(`<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">${turbulence}`
        + `<feColorMatrix type="matrix" values="0 0 0 0 ${r(cr)} 0 0 0 0 ${r(cg)} 0 0 0 0 ${r(cb)} ${r(gain)} 0 0 0 ${r(bias)}"/></filter>`);
      overlays.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#000" filter="url(#${id})"/>`);
    };
    const brown = [0.42, 0.3, 0.17];
    if (p.mottle) texture('doodle-mottle', `<feTurbulence type="fractalNoise" baseFrequency="${r(0.004 * px)}" numOctaves="3" seed="${seed + 7}"/>`, brown, 0.5 * p.mottle, -0.2 * p.mottle);
    if (p.fibers) texture('doodle-fibers', `<feTurbulence type="turbulence" baseFrequency="${r(0.04 * px)} ${r(0.12 * px)}" numOctaves="2" seed="${seed + 13}"/>`, brown, 0.35 * p.fibers, -0.08 * p.fibers);
    if (p.grain) texture('doodle-grain', `<feTurbulence type="fractalNoise" baseFrequency="${r(0.8 * px)}" numOctaves="2" seed="${seed + 29}"/>`, rgb(p.ink), 0.9 * p.grain, -0.42 * p.grain);
    if (p.vignette) {
      filters.push(`<radialGradient id="doodle-vignette" cx="50%" cy="50%" r="72%"><stop offset="0.6" stop-color="#5a4128" stop-opacity="0"/><stop offset="1" stop-color="#5a4128" stop-opacity="${r(0.22 * p.vignette)}"/></radialGradient>`);
      overlays.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#doodle-vignette)"/>`);
    }
  }

  const start = svg.indexOf(rootTag);
  const end = svg.lastIndexOf('</svg>');
  const body = svg.slice(start + rootTag.length, end);
  const under = retrace
    ? `<g filter="url(#doodle-retrace)">${body.replace(/<text\b[\s\S]*?<\/text>/gi, '').replace(/\sid\s*=\s*("[^"]*"|'[^']*')/gi, '')}</g>`
    : '';
  const drawing = `${under}<g filter="url(#doodle-ink)">${body}</g>`;
  return `${root}<defs>${filters.join('')}</defs>${sheet}${toned ? `<g filter="url(#doodle-tone)">${drawing}</g>` : drawing}${overlays.join('')}</svg>\n`;
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
  let retrace = true;
  let paper = 'sketchbook';
  const files = [];
  const usage = (reason) => {
    console.error(`ink.mjs: ${reason}\nusage: ink.mjs --preset <${Object.keys(PRESETS).join('|')}> [--paper <${Object.keys(PAPERS).join('|')}>] [--out <dir>] [--seed <n>] [--single] <drawing.svg>`);
    process.exit(2);
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--preset') preset = args[++i];
    else if (args[i] === '--out') out = args[++i] ?? usage('--out needs a directory');
    else if (args[i] === '--seed') seed = Number(args[++i]);
    else if (args[i] === '--single') retrace = false;
    else if (args[i] === '--paper') paper = args[++i];
    else files.push(args[i]);
  }
  if (!Object.hasOwn(PRESETS, preset ?? '')) usage(`--preset must be one of ${Object.keys(PRESETS).join(', ')}`);
  if (!Object.hasOwn(PAPERS, paper ?? '')) usage(`--paper must be one of ${Object.keys(PAPERS).join(', ')}`);
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
  const inked = inkSvg(svg, { preset, seed, retrace, paper });
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

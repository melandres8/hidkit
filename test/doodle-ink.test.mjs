import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterDefs, checkSvg, findChrome, inkSvg, sizeFor } from '../skills/doodle/scripts/ink.mjs';
import { cleanupTempRepos, tempDir } from './helpers.mjs';

after(cleanupTempRepos);

const INK = fileURLToPath(new URL('../skills/doodle/scripts/ink.mjs', import.meta.url));

const drawing = (body, root = 'viewBox="0 0 1456 1048"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

const CUP = '<path d="M100 100 C 120 300, 300 300, 320 100" fill="none" stroke="#000" stroke-width="4"/><text x="10" y="20" font-family="cursive">coffee</text>';

test('checkSvg accepts a black and white drawing', () => {
  assert.deepEqual(checkSvg(drawing(CUP)), []);
  assert.deepEqual(checkSvg(drawing('<rect width="10" height="10" style="fill: white; stroke: black"/><use href="#a"/>')), []);
});

test('checkSvg refuses color, gray, and opacity, and names the attribute', () => {
  const text = checkSvg(drawing('<circle r="5" fill="#ff0000"/><path stroke="gray"/><g opacity="0.5"/><rect style="fill:#333"/>')).join('\n');
  assert.match(text, /fill="#ff0000": use only black, white, or none/);
  assert.match(text, /stroke="gray"/);
  assert.match(text, /opacity="0.5": opacity makes gray/);
  assert.match(text, /fill="#333"/);
});

test('checkSvg refuses scripts, images, gradients, event attributes, and outside links', () => {
  const svg = drawing('<script>x()</script><image href="http://x/a.png"/><linearGradient id="g"/><rect onclick="x()"/><path fill="url(http://x/f)"/>');
  const text = checkSvg(svg).join('\n');
  for (const part of ['<script>', '<image>', '<linearGradient>', 'onclick', 'href="http://x/a.png"', 'url(http://x/f)']) {
    assert.ok(text.includes(part), part);
  }
});

test('checkSvg needs a root with a viewBox', () => {
  assert.match(checkSvg('<g/>').join('\n'), /no <svg> root/);
  assert.match(checkSvg(drawing(CUP, 'width="10"')).join('\n'), /viewBox/);
});

test('sizeFor uses the preset size and takes the inline height from the viewBox', () => {
  assert.deepEqual(sizeFor('cover', { w: 1456, h: 1048 }), { width: 1456, height: 1048 });
  assert.deepEqual(sizeFor('inline', { w: 1000, h: 500 }), { width: 1460, height: 730 });
});

test('inkSvg sets the size, adds a white sheet, and wraps the drawing in the ink filter', () => {
  const out = inkSvg(drawing(CUP, 'viewBox="0 0 1456 1048" width="50" height="50"'), { preset: 'cover', seed: 7, retrace: false, paper: 'white' });
  assert.match(out, /^<svg width="1456" height="1048" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1456 1048">/);
  assert.ok(!out.includes('width="50"'));
  assert.match(out, /<filter id="doodle-ink"[^>]*>.*seed="7"/);
  assert.match(out, /<rect x="0" y="0" width="1456" height="1048" fill="#ffffff"\/><g filter="url\(#doodle-ink\)"><path d="M100 100/);
  assert.match(out, /<\/g><\/svg>\n$/);
  for (const id of ['doodle-stipple', 'doodle-stipple-dense', 'doodle-hatch', 'doodle-crosshatch']) assert.match(out, new RegExp(`<pattern id="${id}"`));
});

test('inkSvg adds a second pen line without the text and without duplicate ids', () => {
  const out = inkSvg(drawing(`<path id="a" d="M0 0 L 9 9"/>${CUP}`), { preset: 'cover', seed: 7, paper: 'white' });
  assert.match(out, /<filter id="doodle-retrace"[^>]*>.*seed="108".*feMorphology operator="erode"/);
  const under = out.match(/<g filter="url\(#doodle-retrace\)">(.*?)<\/g><g filter="url\(#doodle-ink\)">/s);
  assert.ok(under, 'the second line sits under the drawing');
  assert.ok(under[1].includes('M100 100'));
  assert.ok(!under[1].includes('<text'));
  assert.equal((out.match(/id="a"/g) ?? []).length, 1);
  assert.equal((out.match(/coffee/g) ?? []).length, 1);
});

test('inkSvg puts the drawing on a paper tone and lays the textures on top', () => {
  const out = inkSvg(drawing(CUP), { preset: 'cover', paper: 'kraft', material: 'none' });
  assert.match(out, /<rect x="0" y="0" width="1456" height="1048" fill="#d6c09b"\/><g filter="url\(#doodle-tone\)">/);
  assert.match(out, /<filter id="doodle-tone" color-interpolation-filters="sRGB">/);
  for (const id of ['doodle-mottle', 'doodle-fibers', 'doodle-grain']) {
    assert.match(out, new RegExp(`<rect [^>]*filter="url\\(#${id}\\)"/>`), id);
  }
  assert.ok(out.indexOf('filter="url(#doodle-grain)"') > out.indexOf('M100 100'), 'textures sit on top of the drawing');
  assert.match(out, /fill="url\(#doodle-vignette\)"\/><\/svg>\n$/);
  const white = inkSvg(drawing(CUP), { preset: 'cover', paper: 'white' });
  assert.ok(!white.includes('doodle-tone') && !white.includes('doodle-grain'));
});

test('inkSvg adds tape and ink specks by default, a coffee ring with full, and nothing with none', () => {
  const light = inkSvg(drawing(CUP), { preset: 'cover', seed: 3 });
  assert.equal((light.match(/fill="#fdfcf7" fill-opacity="0.8"/g) ?? []).length, 2);
  assert.ok(!light.includes('doodle-stain'));
  assert.equal(light, inkSvg(drawing(CUP), { preset: 'cover', seed: 3 }));
  assert.match(inkSvg(drawing(CUP), { preset: 'cover', material: 'full' }), /<g filter="url\(#doodle-stain\)"/);
  const none = inkSvg(drawing(CUP), { preset: 'cover', material: 'none' });
  assert.ok(!none.includes('#fdfcf7') && !none.includes('doodle-stain'));
});

test('checkSvg accepts a drawing that uses the fills of the script', () => {
  assert.deepEqual(checkSvg(drawing('<path d="M0 0 L 9 9 Z" fill="url(#doodle-stipple)"/>')), []);
});

const SHEET = fs.readFileSync(fileURLToPath(new URL('../skills/doodle/assets/character.svg', import.meta.url)), 'utf8');

test('the character sheet is a valid drawing with a head, a body, and 5 faces', () => {
  assert.deepEqual(checkSvg(SHEET.trim()), []);
  const defs = characterDefs(SHEET);
  for (const id of ['char-head', 'char-body-standing', 'char-face-neutral', 'char-face-happy', 'char-face-worried', 'char-face-surprised', 'char-face-tired']) {
    assert.match(defs, new RegExp(`<g id="${id}"`), id);
  }
});

test('inkSvg adds the character parts only when the drawing uses them', () => {
  const character = characterDefs(SHEET);
  const used = inkSvg(drawing('<use href="#char-head" transform="translate(500 900)"/>'), { preset: 'cover', character });
  assert.match(used, /<defs>.*<g id="char-head"/s);
  const unused = inkSvg(drawing(CUP), { preset: 'cover', character });
  assert.ok(!unused.includes('id="char-head"'));
});

test('findChrome honors DOODLE_CHROME and returns null when nothing is found', () => {
  const dir = tempDir('doodle-chrome-');
  const fake = path.join(dir, 'chrome');
  fs.writeFileSync(fake, '');
  assert.equal(findChrome({ DOODLE_CHROME: fake }), fake);
  assert.equal(findChrome({ DOODLE_CHROME: path.join(dir, 'missing') }), null);
});

const run = (args, env = {}) => spawnSync(process.execPath, [INK, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('the CLI writes the final SVG and refuses a bad drawing or preset', () => {
  const dir = tempDir('doodle-cli-');
  const ok = path.join(dir, 'cup.svg');
  fs.writeFileSync(ok, `<?xml version="1.0"?>\n${drawing(CUP)}\n`);
  const r = run(['--preset', 'cover', ok], { DOODLE_CHROME: path.join(dir, 'missing') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(dir, 'cup.final.svg'));
  assert.match(r.stderr, /PNG was not made/);
  assert.match(fs.readFileSync(path.join(dir, 'cup.final.svg'), 'utf8'), /doodle-retrace/);

  const single = run(['--preset', 'cover', '--single', ok], { DOODLE_CHROME: path.join(dir, 'missing') });
  assert.equal(single.status, 0, single.stderr);
  assert.ok(!fs.readFileSync(path.join(dir, 'cup.final.svg'), 'utf8').includes('doodle-retrace'));

  const bad = path.join(dir, 'red.svg');
  fs.writeFileSync(bad, drawing('<circle r="5" fill="red"/>'));
  const b = run(['--preset', 'cover', bad]);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /1 problem in/);
  assert.ok(!fs.existsSync(path.join(dir, 'red.final.svg')));

  const p = run(['--preset', 'huge', ok]);
  assert.equal(p.status, 2);
  assert.match(p.stderr, /--preset must be one of cover, wide, inline, spot/);

  const paper = run(['--preset', 'cover', '--paper', 'gold', ok]);
  assert.equal(paper.status, 2);
  assert.match(paper.stderr, /--paper must be one of newsprint, sketchbook, kraft, white/);

  const material = run(['--preset', 'cover', '--material', 'lots', ok]);
  assert.equal(material.status, 2);
  assert.match(material.stderr, /--material must be one of light, full, none/);
});

test('the CLI exports a PNG of the preset size when a browser is present', { skip: !findChrome() && 'no browser' }, () => {
  const dir = tempDir('doodle-png-');
  const file = path.join(dir, 'spot.svg');
  fs.writeFileSync(file, drawing(CUP, 'viewBox="0 0 600 600"'));
  const r = run(['--preset', 'spot', file]);
  assert.equal(r.status, 0, r.stderr);
  const png = r.stdout.trim().split('\n')[1];
  const head = fs.readFileSync(png);
  assert.equal(head.toString('ascii', 1, 4), 'PNG');
  assert.equal(head.readUInt32BE(16), 600);
  assert.equal(head.readUInt32BE(20), 600);
});

#!/usr/bin/env node
// Builds the fill-me-in briefing as one self-contained HTML page and opens it in the browser.
// Usage: node render.mjs [--base <rev>] [--out <dir>] [--no-open] <file>... < page.json
// Reads the page data (JSON) from stdin, maps the files with map.mjs, and prints the path of the page.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapChange, resolveBase } from './map.mjs';

const MAX_PARTS = 4;
const MAX_PHASES = 4;
const MAX_SUMMARY = 3;
const MAX_NODES = 6;
const MAX_SAMPLES = 4;
const ID = /^[a-z0-9][a-z0-9-]*$/;

const STRINGS = {
  en: {
    title: 'Session briefing',
    diagram: 'Diagram',
    legend: 'Legend',
    new: 'New',
    modified: 'Modified',
    existing: 'Existing',
    hint: 'Select a part in the diagram to see its detail.',
    parts: 'Parts',
    moves: 'Moves',
    open: 'Open items',
    pending: 'Pending',
    unverified: 'Not verified',
    next: 'Next step',
    purpose: 'Purpose',
    reason: 'Reason',
    files: 'Files',
    connections: 'Connections',
    close: 'Close',
    refs: (n) => `${n} ${n === 1 ? 'reference' : 'references'}`,
    hidden: (n) => `${n} more ${n === 1 ? 'group' : 'groups'} of existing code ${n === 1 ? 'is' : 'are'} not shown.`,
    counts: { new: 'new', modified: 'modified', deleted: 'deleted', unchanged: 'unchanged' },
  },
  es: {
    title: 'Resumen de la sesión',
    diagram: 'Diagrama',
    legend: 'Leyenda',
    new: 'Nuevo',
    modified: 'Modificado',
    existing: 'Existente',
    hint: 'Selecciona una parte del diagrama para ver su detalle.',
    parts: 'Partes',
    moves: 'Movimientos',
    open: 'Pendientes',
    pending: 'Sin hacer',
    unverified: 'Sin verificar',
    next: 'Siguiente paso',
    purpose: 'Propósito',
    reason: 'Razón',
    files: 'Archivos',
    connections: 'Conexiones',
    close: 'Cerrar',
    refs: (n) => `${n} ${n === 1 ? 'referencia' : 'referencias'}`,
    hidden: (n) => (n === 1 ? '1 grupo más de código existente no se muestra.' : `${n} grupos más de código existente no se muestran.`),
    counts: { new: 'nuevos', modified: 'modificados', deleted: 'borrados', unchanged: 'sin cambios' },
  },
};

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isList = (v) => Array.isArray(v);
const quote = (v) => JSON.stringify(v);

// Returns each problem of the page data against the map. The list is empty when the brief is valid.
export function validateBrief(brief, map) {
  const problems = [];
  const add = (field, text) => problems.push(`${field}: ${text}`);
  if (brief === null || typeof brief !== 'object' || Array.isArray(brief)) return ['brief: found no JSON object.'];

  if (brief.lang !== undefined && !isText(brief.lang)) add('lang', 'expected a language code such as "en" or "es".');
  if (!isText(brief.idea)) add('idea', 'expected one sentence of text.');
  if (!isList(brief.summary) || brief.summary.length === 0) add('summary', `expected a list of 1 to ${MAX_SUMMARY} lines.`);
  else {
    if (brief.summary.length > MAX_SUMMARY) add('summary', `found ${brief.summary.length}, the maximum is ${MAX_SUMMARY}.`);
    brief.summary.forEach((line, i) => isText(line) || add(`summary[${i}]`, 'expected text.'));
  }

  const ids = new Set();
  const checkId = (field, id) => {
    if (!isText(id) || !ID.test(id)) return add(field, `expected an id of lowercase letters, digits, and "-", found ${quote(id)}.`);
    if (ids.has(id)) return add(field, `duplicate id ${quote(id)}.`);
    ids.add(id);
  };

  const mapParts = map.parts.map((p) => p.id);
  const owners = new Map();
  if (!isList(brief.parts) || brief.parts.length === 0) add('parts', `expected a list of 1 to ${MAX_PARTS} parts.`);
  else {
    if (brief.parts.length > MAX_PARTS) add('parts', `found ${brief.parts.length}, the maximum is ${MAX_PARTS}. Merge two parts with "from".`);
    brief.parts.forEach((part, i) => {
      const at = `parts[${i}]`;
      if (part === null || typeof part !== 'object') return add(at, 'expected an object.');
      checkId(`${at}.id`, part.id);
      for (const key of ['label', 'purpose', 'reason']) if (!isText(part[key])) add(`${at}.${key}`, 'expected text.');
      if (!isList(part.from) || part.from.length === 0) return add(`${at}.from`, `expected a list of map part ids. Valid ids: ${mapParts.join(', ')}`);
      part.from.forEach((id, j) => {
        if (!mapParts.includes(id)) return add(`${at}.from[${j}]`, `${quote(id)} is not in the map. Valid ids: ${mapParts.join(', ')}`);
        if (owners.has(id)) return add(`${at}.from[${j}]`, `${quote(id)} is in more than one part.`);
        owners.set(id, part.id);
      });
    });
    for (const id of mapParts) if (!owners.has(id)) add('parts', `map part ${quote(id)} is in no part. Add it to the "from" list of a part.`);
  }

  const mapExisting = map.existing.map((e) => e.id);
  let existingCount = 0;
  if (brief.existing !== undefined) {
    if (!isList(brief.existing)) add('existing', 'expected a list.');
    else {
      const used = new Set();
      existingCount = brief.existing.length;
      brief.existing.forEach((group, i) => {
        const at = `existing[${i}]`;
        if (group === null || typeof group !== 'object') return add(at, 'expected an object.');
        checkId(`${at}.id`, group.id);
        if (!isText(group.label)) add(`${at}.label`, 'expected text.');
        if (!isList(group.from) || group.from.length === 0) return add(`${at}.from`, `expected a list of map existing ids. Valid ids: ${mapExisting.join(', ')}`);
        group.from.forEach((id, j) => {
          if (!mapExisting.includes(id)) return add(`${at}.from[${j}]`, `${quote(id)} is not in the map. Valid ids: ${mapExisting.join(', ')}`);
          if (used.has(id)) return add(`${at}.from[${j}]`, `${quote(id)} is in more than one group.`);
          used.add(id);
        });
      });
    }
  }

  const nodes = new Set([...(isList(brief.parts) ? brief.parts.map((p) => p?.id) : []), ...(isList(brief.existing) ? brief.existing.map((e) => e?.id) : mapExisting)]);
  if (brief.edges !== undefined) {
    if (!isList(brief.edges)) add('edges', 'expected a list.');
    else {
      brief.edges.forEach((edge, i) => {
        const at = `edges[${i}]`;
        if (edge === null || typeof edge !== 'object') return add(at, 'expected an object.');
        for (const end of ['from', 'to']) {
          if (!nodes.has(edge[end])) add(`${at}.${end}`, `${quote(edge[end])} is not a node. Valid nodes: ${[...nodes].join(', ')}`);
        }
        if (edge.from === edge.to) add(at, 'an edge needs two different nodes.');
        if (edge.label !== undefined && !isText(edge.label)) add(`${at}.label`, 'expected text.');
      });
    }
  }

  if (!isList(brief.phases) || brief.phases.length === 0) add('phases', `expected a list of 1 to ${MAX_PHASES} phases.`);
  else {
    if (brief.phases.length > MAX_PHASES) add('phases', `found ${brief.phases.length}, the maximum is ${MAX_PHASES}. Merge two phases.`);
    brief.phases.forEach((phase, i) => {
      const at = `phases[${i}]`;
      if (phase === null || typeof phase !== 'object') return add(at, 'expected an object.');
      if (!isText(phase.name)) add(`${at}.name`, 'expected text.');
      if (!isList(phase.moves) || phase.moves.length === 0) add(`${at}.moves`, 'expected a list of 1 or more moves.');
      else phase.moves.forEach((move, j) => isText(move) || add(`${at}.moves[${j}]`, 'expected text.'));
    });
  }

  if (brief.open !== undefined) {
    if (brief.open === null || typeof brief.open !== 'object' || Array.isArray(brief.open)) add('open', 'expected an object.');
    else {
      for (const key of ['pending', 'unverified']) {
        const list = brief.open[key];
        if (list === undefined) continue;
        if (!isList(list)) add(`open.${key}`, 'expected a list.');
        else list.forEach((item, i) => isText(item) || add(`open.${key}[${i}]`, 'expected text.'));
      }
      if (brief.open.next !== undefined && !isText(brief.open.next)) add('open.next', 'expected text.');
    }
  }

  const partCount = isList(brief.parts) ? brief.parts.length : 0;
  if (brief.existing !== undefined && partCount + existingCount > MAX_NODES) {
    add('nodes', `found ${partCount + existingCount}, the maximum is ${MAX_NODES}. Merge groups in "existing".`);
  }
  return problems;
}

function addCounts(into, counts) {
  for (const [state, n] of Object.entries(counts)) into[state] = (into[state] ?? 0) + n;
  return into;
}

function stateOf(counts) {
  const states = Object.keys(counts);
  if (states.length > 0 && states.every((s) => s === 'new')) return 'new';
  if (states.length > 0 && states.every((s) => s === 'unchanged')) return 'existing';
  return 'modified';
}

// Builds the nodes and the edges of the diagram from valid page data and its map.
export function buildModel(brief, map) {
  const owner = new Map();
  const mapPart = new Map(map.parts.map((p) => [p.id, p]));
  const parts = brief.parts.map((part) => {
    const members = part.from.map((id) => mapPart.get(id));
    for (const id of part.from) owner.set(id, part.id);
    const counts = members.reduce((acc, m) => addCounts(acc, m.states), {});
    const paths = members.every((m) => m.paths) ? members.flatMap((m) => m.paths) : null;
    return { id: part.id, kind: 'part', label: part.label, state: stateOf(counts), counts, paths, part };
  });

  let existing;
  if (brief.existing) {
    existing = brief.existing.map((group) => {
      for (const id of group.from) owner.set(id, group.id);
      return { id: group.id, kind: 'existing', label: group.label, state: 'existing' };
    });
  } else {
    existing = map.existing.map((e) => {
      owner.set(e.id, e.id);
      return { id: e.id, kind: 'existing', label: e.dir, state: 'existing' };
    });
  }

  const edges = new Map();
  for (const edge of map.edges) {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}>${to}`;
    const merged = edges.get(key) ?? { from, to, refs: 0, samples: [] };
    merged.refs += edge.refs;
    for (const sample of edge.samples) if (merged.samples.length < MAX_SAMPLES) merged.samples.push(sample);
    edges.set(key, merged);
  }

  let hidden = brief.existing ? map.existing.filter((e) => !owner.has(e.id)).length : 0;
  const room = MAX_NODES - parts.length;
  if (!brief.existing && existing.length > room) {
    const weight = (id) => [...edges.values()].reduce((sum, e) => sum + (e.from === id || e.to === id ? e.refs : 0), 0);
    const ranked = existing.map((node, index) => ({ node, index, refs: weight(node.id) })).sort((a, b) => b.refs - a.refs || a.index - b.index);
    const keep = new Set(ranked.slice(0, Math.max(room, 0)).map((r) => r.node.id));
    hidden = existing.length - keep.size;
    existing = existing.filter((node) => keep.has(node.id));
  }

  const nodes = [...parts, ...existing];
  const shown = new Set(nodes.map((n) => n.id));
  for (const [key, edge] of edges) if (!shown.has(edge.from) || !shown.has(edge.to)) edges.delete(key);
  for (const edge of brief.edges ?? []) {
    if (!shown.has(edge.from) || !shown.has(edge.to)) continue;
    const key = `${edge.from}>${edge.to}`;
    const merged = edges.get(key) ?? { from: edge.from, to: edge.to, refs: 0, samples: [] };
    if (edge.label) merged.label = edge.label;
    edges.set(key, merged);
  }
  return { nodes, edges: [...edges.values()], hidden };
}

const BOX = { w: 176, h: 64, gapX: 88, gapY: 28, pad: 16, line: 16, chars: 22 };

// Puts each node in a column by the longest path from the nodes that refer to it. Back edges of a cycle do not count.
export function layout(model) {
  const index = new Map(model.nodes.map((n, i) => [n.id, i]));
  const out = new Map(model.nodes.map((n) => [n.id, []]));
  for (const e of model.edges) out.get(e.from).push(e.to);
  const mark = new Map();
  const forward = [];
  const visit = (id) => {
    mark.set(id, 'open');
    for (const to of out.get(id)) {
      if (mark.get(to) === 'open') continue;
      forward.push([id, to]);
      if (!mark.has(to)) visit(to);
    }
    mark.set(id, 'done');
  };
  for (const n of model.nodes) if (!mark.has(n.id)) visit(n.id);

  const rank = new Map(model.nodes.map((n) => [n.id, 0]));
  for (let changed = true, round = 0; changed && round <= model.nodes.length; round += 1) {
    changed = false;
    for (const [from, to] of forward) {
      if (rank.get(to) < rank.get(from) + 1) {
        rank.set(to, rank.get(from) + 1);
        changed = true;
      }
    }
  }

  const columns = [];
  for (const n of model.nodes) (columns[rank.get(n.id)] ??= []).push(n.id);
  const cols = columns.filter(Boolean);
  const rows = Math.max(...cols.map((c) => c.length));
  const height = BOX.pad * 2 + rows * BOX.h + (rows - 1) * BOX.gapY;
  const pos = new Map();
  cols.forEach((col, c) => {
    col.sort((a, b) => index.get(a) - index.get(b));
    const top = (height - (col.length * BOX.h + (col.length - 1) * BOX.gapY)) / 2;
    col.forEach((id, r) => pos.set(id, { x: BOX.pad + c * (BOX.w + BOX.gapX), y: top + r * (BOX.h + BOX.gapY) }));
  });
  const col = new Map();
  const sides = new Map();
  cols.forEach((ids, c) =>
    ids.forEach((id, r) => {
      col.set(id, c);
      const middle = r > 0 && r < ids.length - 1;
      sides.set(id, { top: r === 0 || middle, bottom: r === ids.length - 1 || middle });
    }),
  );
  return { pos, col, sides, width: BOX.pad * 2 + cols.length * BOX.w + (cols.length - 1) * BOX.gapX, height };
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Splits a label into lines of `BOX.chars` characters or fewer. A fourth line or more ends the third line with "…".
function wrap(label) {
  const lines = [];
  for (const word of label.split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= BOX.chars) lines[last] += ` ${word}`;
    else lines.push(word.length > BOX.chars ? `${word.slice(0, BOX.chars - 1)}…` : word);
  }
  if (lines.length > 3) lines.splice(2, lines.length - 2, `${lines[2].slice(0, BOX.chars - 1)}…`);
  return lines;
}

const round1 = (n) => Math.round(n * 10) / 10;

// An edge to the next column is a curve between the sides of the boxes. Each other edge would cross boxes, so it is
// an arc that leaves and enters each box by its top or its bottom. Only the first box of a column has a free top, and
// only the last box has a free bottom.
const arcDepth = (span) => 28 + 12 * Math.min(Math.abs(span), 5);

function route(a, b, span, startAbove, endAbove) {
  if (span === 1) {
    const x1 = a.x + BOX.w;
    const y1 = a.y + BOX.h / 2;
    const x2 = b.x;
    const y2 = b.y + BOX.h / 2;
    const dx = Math.max(40, (x2 - x1) / 2);
    return [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
  }
  const lift = arcDepth(span) * 1.33;
  const x1 = a.x + BOX.w / 2 + (startAbove ? 12 : -12);
  const x2 = b.x + BOX.w / 2 + (endAbove ? -12 : 12);
  const y1 = startAbove ? a.y : a.y + BOX.h;
  const y2 = endAbove ? b.y : b.y + BOX.h;
  if (startAbove === endAbove) {
    const cy = startAbove ? Math.min(y1, y2) - lift : Math.max(y1, y2) + lift;
    return [[x1, y1], [x1, cy], [x2, cy], [x2, y2]];
  }
  return [[x1, y1], [x1, startAbove ? y1 - lift : y1 + lift], [x2, endAbove ? y2 - lift : y2 + lift], [x2, y2]];
}

// Picks the sides of an arc. When both sides are free at both ends, the arcs alternate between above and below.
function arcSides(from, to, turn) {
  const above = from.top && to.top;
  const below = from.bottom && to.bottom;
  if (above && below) return turn % 2 === 0 ? [true, true] : [false, false];
  if (above || below) return [above, above];
  return [from.top, to.top];
}

function svg(model, t) {
  const { pos: grid, col, sides, width, height: gridHeight } = layout(model);
  const label = new Map(model.nodes.map((n) => [n.id, n.label]));
  const spans = model.edges.map((e) => col.get(e.to) - col.get(e.from)).filter((span) => span !== 1);
  const space = spans.length ? Math.max(...spans.map(arcDepth)) + 20 : 0;
  const height = gridHeight + 2 * space;
  const pos = new Map([...grid].map(([id, p]) => [id, { x: p.x, y: p.y + space }]));
  let arc = 0;
  const edges = model.edges.map((e) => {
    const span = col.get(e.to) - col.get(e.from);
    const [startAbove, endAbove] = span === 1 ? [false, false] : arcSides(sides.get(e.from), sides.get(e.to), arc++);
    const [[x1, y1], c1, c2, [x2, y2]] = route(pos.get(e.from), pos.get(e.to), span, startAbove, endAbove);
    const d = `M${round1(x1)} ${round1(y1)} C${round1(c1[0])} ${round1(c1[1])}, ${round1(c2[0])} ${round1(c2[1])}, ${round1(x2)} ${round1(y2)}`;
    const title = `${label.get(e.from)} → ${label.get(e.to)}${e.refs ? ` (${t.refs(e.refs)})` : ''}`;
    let text = '';
    if (e.label) {
      const mx = round1((x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8);
      const my = round1((y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8);
      text = `<text class="edge-label" x="${mx}" y="${round1(my - 4)}" text-anchor="middle">${escape(e.label)}</text>`;
    }
    return `<g class="edge"><title>${escape(title)}</title><path d="${d}" marker-end="url(#arrow)"/>${text}</g>`;
  });
  const nodes = model.nodes.map((n) => {
    const { x, y } = pos.get(n.id);
    const lines = wrap(n.label);
    const top = y + BOX.h / 2 - ((lines.length - 1) * BOX.line) / 2 + 4;
    const tspans = lines.map((line, i) => `<tspan x="${x + BOX.w / 2}" y="${round1(top + i * BOX.line)}">${escape(line)}</tspan>`).join('');
    const button = n.kind === 'part' ? ` role="button" tabindex="0" aria-expanded="false" data-panel="panel-${n.id}"` : '';
    return `<g class="node ${n.state}"${button}><title>${escape(`${n.label} (${t[n.state]})`)}</title><rect x="${x}" y="${y}" width="${BOX.w}" height="${BOX.h}" rx="8"/><text text-anchor="middle">${tspans}</text></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escape(t.diagram)}">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>
${edges.join('\n')}
${nodes.join('\n')}
</svg>`;
}

function panel(node, model, t) {
  const label = new Map(model.nodes.map((n) => [n.id, n.label]));
  const counts = Object.entries(node.counts).map(([state, n]) => `${n} ${t.counts[state] ?? state}`).join(', ');
  const files = node.paths ? `<h4>${t.files}</h4><ul class="files">${node.paths.map((p) => `<li><code>${escape(p)}</code></li>`).join('')}</ul>` : '';
  const links = model.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => {
    const refs = e.refs ? ` · ${t.refs(e.refs)}` : '';
    const note = e.label ? ` · ${escape(e.label)}` : '';
    const samples = e.samples.length ? `<div class="samples">${e.samples.map((s) => `<code>${escape(s)}</code>`).join(' ')}</div>` : '';
    return `<li>${escape(label.get(e.from))} → ${escape(label.get(e.to))}${refs}${note}${samples}</li>`;
  });
  const connections = links.length ? `<h4>${t.connections}</h4><ul>${links.join('')}</ul>` : '';
  return `<section class="panel" id="panel-${node.id}" hidden>
<div class="panel-head"><h3>${escape(node.label)} <span class="tag ${node.state}">${t[node.state]}</span></h3><button type="button" class="close" aria-label="${t.close}">×</button></div>
<p><strong>${t.purpose}:</strong> ${escape(node.part.purpose)}</p>
<p><strong>${t.reason}:</strong> ${escape(node.part.reason)}</p>
<p class="muted">${escape(counts)}</p>
${files}${connections}
</section>`;
}

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6b66;--card:#ffffff;--line:#d9d6cf;--edge:#8a877f;
--new:#1f7a4d;--new-bg:#e6f4ec;--mod:#a35f00;--mod-bg:#fdf1de;--old:#9a978f;--old-bg:#f2f1ed;--focus:#2b59c3}
@media (prefers-color-scheme:dark){:root{--bg:#171715;--fg:#ecebe6;--muted:#a3a19a;--card:#21211e;--line:#3a3934;--edge:#8f8c84;
--new:#5cc48d;--new-bg:#16301f;--mod:#f0a640;--mod-bg:#35270f;--old:#7d7b74;--old-bg:#262622;--focus:#8fb0ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:1.6rem;line-height:1.3;margin:0 0 12px}
h2{font-size:1.05rem;margin:36px 0 12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h3{margin:0;font-size:1.05rem}
h4{margin:14px 0 6px;font-size:.9rem;color:var(--muted)}
.summary{margin:0;padding-left:18px}
.diagram{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;overflow-x:auto}
svg{display:block;margin:0 auto;max-width:100%;height:auto}
.node rect{stroke-width:2}
.node text{fill:var(--fg);font-size:13px}
.node.new rect{fill:var(--new-bg);stroke:var(--new)}
.node.modified rect{fill:var(--mod-bg);stroke:var(--mod);stroke-dasharray:6 4}
.node.existing rect{fill:var(--old-bg);stroke:var(--old);stroke-width:1}
.node.existing text{fill:var(--muted)}
.node[role=button]{cursor:pointer}
.node[role=button]:hover rect,.node[aria-expanded=true] rect{stroke-width:3}
.node[role=button]:focus{outline:none}
.node[role=button]:focus-visible rect{stroke:var(--focus);stroke-width:3}
.edge path{fill:none;stroke:var(--edge);stroke-width:1.5}
marker path{fill:var(--edge)}
.edge-label{fill:var(--muted);font-size:12px;paint-order:stroke;stroke:var(--card);stroke-width:4px}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:10px 4px 0;font-size:.85rem;color:var(--muted);list-style:none;padding:0}
.swatch{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:6px;vertical-align:-2px;border:2px solid}
.swatch.new{background:var(--new-bg);border-color:var(--new)}
.swatch.modified{background:var(--mod-bg);border-color:var(--mod);border-style:dashed}
.swatch.existing{background:var(--old-bg);border-color:var(--old);border-width:1px}
.hint,.muted,.note{color:var(--muted);font-size:.9rem}
.panel{margin-top:16px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.close{background:none;border:0;color:var(--muted);font-size:1.4rem;cursor:pointer;line-height:1}
.panel ul{margin:0;padding-left:18px}
.samples{margin-top:2px}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--old-bg);padding:1px 4px;border-radius:4px;overflow-wrap:anywhere}
.tag{font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:999px;vertical-align:2px}
.tag.new{background:var(--new-bg);color:var(--new)}
.tag.modified{background:var(--mod-bg);color:var(--mod)}
.tag.existing{background:var(--old-bg);color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.card p{margin:8px 0 0}
.phases{list-style:none;margin:0;padding:0;border-left:2px solid var(--line)}
.phases li{position:relative;padding:0 0 14px 18px}
.phases li::before{content:"";position:absolute;left:-7px;top:6px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--edge)}
.phases strong{display:block}
.open h3{font-size:.95rem;margin:12px 0 4px}
.open ul{margin:0;padding-left:18px}
`;

const JS = `
const nodes = document.querySelectorAll('[data-panel]');
function closeAll() {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  nodes.forEach((n) => n.setAttribute('aria-expanded', 'false'));
  document.querySelector('.hint').hidden = false;
}
function toggle(node) {
  const panel = document.getElementById(node.dataset.panel);
  const show = panel.hidden;
  closeAll();
  if (!show) return;
  panel.hidden = false;
  node.setAttribute('aria-expanded', 'true');
  document.querySelector('.hint').hidden = true;
}
nodes.forEach((node) => {
  node.addEventListener('click', () => toggle(node));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(node); }
  });
});
document.querySelectorAll('.close').forEach((b) => b.addEventListener('click', closeAll));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
`;

// Returns the page as a string. The same input gives the same page.
export function renderHtml(brief, map) {
  const lang = Object.hasOwn(STRINGS, brief.lang) ? brief.lang : 'en';
  const t = STRINGS[lang];
  const model = buildModel(brief, map);
  const parts = model.nodes.filter((n) => n.kind === 'part');
  const list = (items) => `<ul>${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>`;
  const open = brief.open ?? {};
  const openGroups = [
    open.pending?.length ? `<h3>${t.pending}</h3>${list(open.pending)}` : '',
    open.unverified?.length ? `<h3>${t.unverified}</h3>${list(open.unverified)}` : '',
    open.next ? `<h3>${t.next}</h3><p>${escape(open.next)}</p>` : '',
  ].join('');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${t.title}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>${escape(brief.idea)}</h1>
<ul class="summary">${brief.summary.map((s) => `<li>${escape(s)}</li>`).join('')}</ul>
</header>
<h2>${t.diagram}</h2>
<div class="diagram">
${svg(model, t)}
</div>
<ul class="legend" aria-label="${t.legend}"><li><span class="swatch new"></span>${t.new}</li><li><span class="swatch modified"></span>${t.modified}</li><li><span class="swatch existing"></span>${t.existing}</li></ul>
${model.hidden ? `<p class="note">${escape(t.hidden(model.hidden))}</p>` : ''}
<p class="hint">${t.hint}</p>
${parts.map((n) => panel(n, model, t)).join('\n')}
<h2>${t.parts}</h2>
<div class="cards">
${parts.map((n) => `<article class="card"><h3>${escape(n.label)} <span class="tag ${n.state}">${t[n.state]}</span></h3><p>${escape(n.part.purpose)}</p><p class="muted">${escape(n.part.reason)}</p></article>`).join('\n')}
</div>
<h2>${t.moves}</h2>
<ol class="phases">
${brief.phases.map((p) => `<li><strong>${escape(p.name)}</strong>${escape(p.moves.join(' · '))}</li>`).join('\n')}
</ol>
${openGroups ? `<h2>${t.open}</h2><div class="open">${openGroups}</div>` : ''}
</main>
<script>${JS}</script>
</body>
</html>
`;
}

const DEFAULT_DIR = path.join(os.tmpdir(), 'hidkit-fill-me-in');

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

// Writes the page into `dir` under a new name. It never overwrites an earlier page.
function writePage(dir, html, date) {
  fs.mkdirSync(dir, { recursive: true });
  const base = `brief-${stamp(date)}`;
  for (let i = 1; ; i += 1) {
    const file = path.join(dir, i === 1 ? `${base}.html` : `${base}-${i}.html`);
    try {
      fs.writeFileSync(file, html, { flag: 'wx' });
      return file;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// Opens the page in the default browser. A failure to open is not an error.
function openPage(file) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The path is printed, so the user can open the page.
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let base;
  let out;
  let openIt = true;
  const files = [];
  const usage = (reason) => {
    console.error(`render.mjs: ${reason}\nusage: render.mjs [--base <rev>] [--out <dir>] [--no-open] <file>... < page.json`);
    process.exit(2);
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--base') base = args[++i] ?? '';
    else if (args[i] === '--out') out = args[++i] ?? usage('--out needs a directory');
    else if (args[i] === '--no-open') openIt = false;
    else files.push(args[i]);
  }
  if (files.length === 0) usage('no files');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  let commit = 'HEAD';
  if (base !== undefined) {
    commit = resolveBase(root, base);
    if (!commit) usage(base && !base.startsWith('-') ? `--base ${base} is not a commit` : '--base needs a commit');
  }

  const input = process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8');
  if (input.trim() === '') usage('no page data on stdin');
  let brief;
  try {
    brief = JSON.parse(input);
  } catch (err) {
    usage(`the page data is not JSON: ${err.message}`);
  }

  const map = mapChange({ root, files, base: commit });
  const problems = validateBrief(brief, map);
  if (problems.length > 0) {
    console.error(`render.mjs: ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} in the page data\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(2);
  }

  const html = renderHtml(brief, map);
  const now = new Date();
  let file;
  try {
    file = writePage(out ?? DEFAULT_DIR, html, now);
  } catch (err) {
    if (out === undefined) throw err;
    file = writePage(DEFAULT_DIR, html, now);
    console.error(`render.mjs: could not write to ${out} (${err.code ?? err.message}); wrote to ${DEFAULT_DIR}`);
  }
  console.log(file);
  if (openIt) openPage(file);
}

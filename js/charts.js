// Small SVG chart kit for the insights page: grouped bars and multi-line charts.
// Conventions (see the dataviz method): one y-axis, recessive grid, thin marks with 4px
// rounded data-ends, 2px surface gaps between bars, 2px lines with ≥8px markers, legend for
// ≥2 series, hover tooltips on every mark, and a table view for every chart.
// Series colours are fixed per entity via CSS custom properties (--s-<key>).

import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach((c) => c != null && el.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return el;
};
const pctFmt = (v) => `${Math.round(v * 100)}%`;

// ---------- tooltip (one per page) ----------
let tip;
function showTip(evt, html) {
  if (!tip) { tip = h('div.viz-tip', { role: 'tooltip' }); document.body.append(tip); }
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14;
  const { innerWidth: W } = window;
  const r = tip.getBoundingClientRect();
  let x = evt.clientX + pad;
  if (x + r.width > W - 8) x = evt.clientX - r.width - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, evt.clientY - r.height - pad)}px`;
}
const hideTip = () => { if (tip) tip.hidden = true; };
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function legend(series) {
  return h('div.viz-legend', series.map((se) => h('span.viz-key', h('i', { style: { background: `var(--s-${se.key})` } }), se.label)));
}

/** Toggle between chart and table view. */
function frame({ title, note, series, chart, table, labels, empty = false }) {
  if (empty) {
    // no data at all: say so instead of drawing bare axes (the table would be all dashes)
    return h('figure.viz.viz-isempty',
      h('div.viz-head', h('figcaption', title)),
      series.length ? legend(series) : null,
      h('p.viz-empty', labels.empty || '—'),
      note ? h('p.viz-note', note) : null,
    );
  }
  const hasLow = chart.querySelector?.('.low');
  const body = h('div.viz-body', chart);
  let showingTable = false;
  const btn = h('button.viz-toggle', { type: 'button' }, labels.table);
  btn.addEventListener('click', () => {
    showingTable = !showingTable;
    body.replaceChildren(showingTable ? table : chart);
    btn.textContent = showingTable ? labels.chart : labels.table;
  });
  return h('figure.viz',
    h('div.viz-head', h('figcaption', title), btn),
    series.length ? legend(series) : null, // always name the series, even when only one has data
    body,
    note ? h('p.viz-note', note) : null,
    hasLow && labels.lowNote ? h('p.viz-note.viz-lownote', labels.lowNote) : null,
  );
}

function makeTable(rowsHead, colsHead, cell, cornerLabel) {
  return h('div.viz-table-wrap', h('table.viz-table',
    h('thead', h('tr', h('th', cornerLabel || ''), colsHead.map((c) => h('th', c.label)))),
    h('tbody', rowsHead.map((r) => h('tr', h('th', r.label), colsHead.map((c) => h('td', cell(r, c)))))),
  ));
}

const cellText = (d, fmt) => (d && d.n ? `${fmt(d.v)} (n=${d.n})` : '—');

/**
 * Grouped vertical bars.
 * cats: [{key,label}], series: [{key,label}], value(cat, series) → {v (0..1), n} | null
 */
export function groupedBars({ title, note, cats, series, value, labels, fmt = pctFmt, max = 1, height = 220 }) {
  if (!cats.length || !cats.some((c) => series.some((se) => value(c, se)?.n))) return frame({ title, note, series, labels, empty: true });
  const W = 640, H = height, L = 36, R = 8, T = 12, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const groupW = plotW / cats.length;
  const gap = 2;
  const barW = Math.max(4, Math.min(26, (groupW * 0.78 - gap * (series.length - 1)) / series.length));
  const y = (v) => T + plotH - (v / max) * plotH;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': title });
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(g * max), y2: y(g * max), class: g === 0 ? 'viz-base' : 'viz-grid' }));
    svg.append(s('text', { x: L - 6, y: y(g * max) + 4, class: 'viz-tick', 'text-anchor': 'end' }, fmt(g * max)));
  }
  cats.forEach((c, i) => {
    const gx = L + i * groupW + (groupW - (barW * series.length + gap * (series.length - 1))) / 2;
    series.forEach((se, j) => {
      const d = value(c, se);
      if (!d || !d.n) return;
      const x = gx + j * (barW + gap);
      const top = y(Math.min(max, d.v));
      const hgt = Math.max(0, T + plotH - top);
      const r = Math.min(4, barW / 2, hgt);
      // rounded data-end, square baseline
      const path = `M${x},${T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${T + plotH} Z`;
      const low = d.n < (labels.lowN || 0);
      const bar = s('path', { d: path, fill: `var(--s-${se.key})`, class: `viz-bar${low ? ' low' : ''}` });
      const hit = s('rect', { x: x - gap / 2, y: T, width: barW + gap, height: plotH, fill: 'transparent', class: 'viz-hit' });
      const tipHtml = `<b>${esc(se.label)}</b><span>${esc(c.label)}</span><em>${fmt(d.v)}</em><small>n = ${d.n}${low && labels.low ? ` · ${esc(labels.low)}` : ''}</small>`;
      hit.addEventListener('pointermove', (e) => { bar.classList.add('on'); showTip(e, tipHtml); });
      hit.addEventListener('pointerleave', () => { bar.classList.remove('on'); hideTip(); });
      svg.append(bar, hit);
    });
    svg.append(s('text', { x: L + i * groupW + groupW / 2, y: H - 10, class: 'viz-cat', 'text-anchor': 'middle' }, c.label));
  });
  const table = makeTable(cats, series, (r, c) => cellText(value(r, c), fmt));
  return frame({ title, note, series, chart: svg, table, labels });
}

/**
 * Multi-series line chart over ordered x values.
 * xs: [{key,label}], series: [{key,label}], value(x, series) → {v, n} | null
 */
export function lineChart({ title, note, xs, series, value, labels, fmt = pctFmt, max = 1, height = 220, minN = 1, ref = null, refLabel = '' }) {
  if (!xs.length || !xs.some((xv) => series.some((se) => (value(xv, se)?.n || 0) >= minN))) return frame({ title, note, series, labels, empty: true });
  const W = 640, H = height, L = 36, R = 64, T = 12, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const x = (i) => L + (xs.length === 1 ? plotW / 2 : (i / (xs.length - 1)) * plotW);
  const y = (v) => T + plotH - (v / max) * plotH;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': title });
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(g * max), y2: y(g * max), class: g === 0 ? 'viz-base' : 'viz-grid' }));
    svg.append(s('text', { x: L - 6, y: y(g * max) + 4, class: 'viz-tick', 'text-anchor': 'end' }, fmt(g * max)));
  }
  const step = Math.ceil(xs.length / 10);
  xs.forEach((xv, i) => { if (i % step === 0 || i === xs.length - 1) svg.append(s('text', { x: x(i), y: H - 8, class: 'viz-cat', 'text-anchor': 'middle' }, xv.label)); });
  if (ref) {
    const d = xs.map((_, i) => `${i ? 'L' : 'M'}${x(i)},${y(ref[i])}`).join(' ');
    svg.append(s('path', { d, fill: 'none', class: 'viz-ref' }));
    if (refLabel) svg.append(s('text', { x: x(xs.length - 1) + 8, y: y(ref[xs.length - 1]) + 4, class: 'viz-reflabel' }, refLabel));
  }
  const lastLabels = [];
  series.forEach((se) => {
    const pts = xs.map((xv, i) => { const d = value(xv, se); return d && d.n >= minN ? [x(i), y(Math.min(max, d.v)), d] : null; });
    let dAttr = '';
    pts.forEach((p, i) => { if (!p) return; dAttr += `${dAttr && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]} `; });
    if (!dAttr) return;
    svg.append(s('path', { d: dAttr, fill: 'none', stroke: `var(--s-${se.key})`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach((p) => p && svg.append(s('circle', { cx: p[0], cy: p[1], r: 4, fill: `var(--s-${se.key})`, class: `viz-dot${p[2].n < (labels.lowN || 0) ? ' low' : ''}` })));
    const last = [...pts].reverse().find(Boolean);
    if (last) lastLabels.push({ y: last[1], x: last[0], se });
  });
  // direct labels at line ends (≤4 series), nudged apart
  lastLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < lastLabels.length; i++) if (lastLabels[i].y - lastLabels[i - 1].y < 15) lastLabels[i].y = lastLabels[i - 1].y + 15;
  if (series.length <= 4) lastLabels.forEach((l) => svg.append(s('text', { x: l.x + 8, y: l.y + 4, class: 'viz-direct' }, l.se.label)));
  // crosshair + tooltip
  const cross = s('line', { y1: T, y2: T + plotH, class: 'viz-cross', visibility: 'hidden' });
  svg.append(cross);
  const overlay = s('rect', { x: L, y: T, width: plotW, height: plotH, fill: 'transparent' });
  overlay.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / plotW) * (xs.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const lines = series.map((se) => { const d = value(xs[i], se); return `<div class="viz-tip-row"><i style="background:var(--s-${se.key})"></i>${esc(se.label)}<em>${d && d.n >= minN ? fmt(d.v) : '—'}</em><small>${d?.n ? `n=${d.n}` : ''}</small></div>`; }).join('');
    showTip(e, `<b>${esc(xs[i].label)}</b>${lines}`);
  });
  overlay.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  svg.append(overlay);
  const table = makeTable(xs, series, (r, c) => cellText(value(r, c), fmt));
  return frame({ title, note, series, chart: svg, table, labels });
}

/** Big-number stat tile. */
export function statTile(label, value, sub) {
  return h('div.stat', h('small', label), h('b', value), sub ? h('span', sub) : null);
}

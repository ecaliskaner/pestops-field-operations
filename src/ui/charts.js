// Hand-rolled SVG charts (Phase 0c-1). Zero dependencies by design — the demo
// has to survive bad conference wifi, which is why html5-qrcode was vendored.
//
// Every builder is a pure function: options in, SVG markup string out. Nothing
// here touches the DOM, so the same call works for on-screen rendering, for a
// print layout, and for the SVG/PNG download in export.js. Use mountChart() to
// put the result on the page.
//
//   mountChart('#trendChart', lineChart({
//     labels: ['Oca','Şub','Mar'],
//     series: [{ name: 'Kemirgen', values: [13, 11, 15] }]
//   }));

import { esc } from '../core/dom.js';

// Pulled from the --blue/--green/--amber/--red/--violet ramp in styles.css.
// Literal values, not var(), so exported SVG/PNG survives outside the page.
export const CHART_COLORS = [
  '#2563eb', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#f97316', // orange
  '#14b8a6'  // teal
];

const INK = '#09090b';
const MUTED = '#71717a';
const LINE = '#e4e4e7';

const DEFAULTS = {
  width: 640,
  height: 280,
  pad: { top: 20, right: 16, bottom: 34, left: 40 },
  yTicks: 4,
  legend: true,
  format: n => String(n)
};

/* ---------------------------------------------------------------- helpers */

// SVG wants '.' decimals regardless of locale, and trailing zeros just bloat
// the markup we may later hand to the PNG encoder.
const num = n => (Math.round(n * 100) / 100).toString();

const colorAt = i => CHART_COLORS[i % CHART_COLORS.length];

function opts(o) {
  return { ...DEFAULTS, ...o, pad: { ...DEFAULTS.pad, ...(o.pad || {}) } };
}

// Series may be given as bare number arrays for the common single-series case.
function normalizeSeries(series, fallbackName) {
  return (series || []).map((s, i) => Array.isArray(s)
    ? { name: `${fallbackName} ${i + 1}`, values: s, color: colorAt(i) }
    : { name: s.name || `${fallbackName} ${i + 1}`, values: s.values || [], color: s.color || colorAt(i) });
}

// A "nice" axis top: round the data max up to 1/2/5 x 10^n so the tick labels
// land on readable numbers instead of 23.6667.
function niceMax(rawMax, ticks) {
  if (!(rawMax > 0)) return ticks;
  const step = rawMax / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const norm = step / mag;
  const niceStep = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return Math.ceil(rawMax / niceStep) * niceStep;
}

function frame(o) {
  const w = o.width - o.pad.left - o.pad.right;
  const h = o.height - o.pad.top - o.pad.bottom;
  return { w, h, x0: o.pad.left, y0: o.pad.top, yBase: o.pad.top + h };
}

function yAxis(o, f, max) {
  let out = '';
  for (let i = 0; i <= o.yTicks; i++) {
    const value = (max / o.yTicks) * i;
    const y = f.yBase - (f.h / o.yTicks) * i;
    out += `<line class="ct-grid" x1="${num(f.x0)}" y1="${num(y)}" x2="${num(f.x0 + f.w)}" y2="${num(y)}" stroke="${LINE}" stroke-width="1"/>`
         + `<text class="ct-tick" x="${num(f.x0 - 8)}" y="${num(y)}" text-anchor="end" dominant-baseline="middle" fill="${MUTED}" font-size="10">${esc(o.format(value))}</text>`;
  }
  return out;
}

// Skip every Nth label when the band is too narrow to read — 12 months on a
// phone-width chart otherwise collapses into grey mush.
function xAxis(labels, f, everyN = 1) {
  const band = f.w / labels.length;
  return labels.map((label, i) => (i % everyN !== 0) ? '' :
    `<text class="ct-tick" x="${num(f.x0 + band * i + band / 2)}" y="${num(f.yBase + 16)}" text-anchor="middle" fill="${MUTED}" font-size="10">${esc(label)}</text>`
  ).join('');
}

function labelStride(count, width) {
  return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 48))));
}

function legend(series, o) {
  if (!o.legend || series.length < 2) return '';
  const items = series.map(s =>
    `<span class="ct-legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`
  ).join('');
  return `<div class="ct-legend">${items}</div>`;
}

// Charts are wrapped rather than returned bare so the legend (real HTML, so it
// wraps and stays selectable) can sit alongside the SVG.
function wrap(o, svgBody, series) {
  const title = o.title ? `<div class="ct-title">${esc(o.title)}</div>` : '';
  return `<div class="ct-chart">${title}`
    + `<svg class="ct-svg" viewBox="0 0 ${o.width} ${o.height}" role="img"`
    + ` preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"`
    + ` aria-label="${esc(o.title || 'Grafik')}">${svgBody}</svg>`
    + legend(series, o) + `</div>`;
}

const tip = text => `<title>${esc(text)}</title>`;

/* ------------------------------------------------------------ line chart */

export function lineChart(config) {
  const o = opts(config);
  const series = normalizeSeries(o.series, 'Seri');
  const labels = o.labels || [];
  const f = frame(o);
  const max = o.max || niceMax(Math.max(1, ...series.flatMap(s => s.values)), o.yTicks);

  // Points sit at band centres so a line chart and a bar chart of the same
  // data line up when they're stacked in the same panel.
  const band = f.w / Math.max(1, labels.length);
  const px = i => f.x0 + band * i + band / 2;
  const py = v => f.yBase - (v / max) * f.h;

  const body = series.map(s => {
    const pts = s.values.map((v, i) => `${num(px(i))},${num(py(v))}`).join(' ');
    const area = o.area === false ? '' :
      `<polygon class="ct-area" points="${num(px(0))},${num(f.yBase)} ${pts} ${num(px(s.values.length - 1))},${num(f.yBase)}" fill="${s.color}" opacity="0.08"/>`;
    const dots = s.values.map((v, i) =>
      `<circle class="ct-dot" cx="${num(px(i))}" cy="${num(py(v))}" r="3.5" fill="#fff" stroke="${s.color}" stroke-width="2">`
      + tip(`${s.name} · ${labels[i] ?? i + 1}: ${o.format(v)}`) + `</circle>`
    ).join('');
    return area
      + `<polyline class="ct-line" points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      + dots;
  }).join('');

  return wrap(o,
    yAxis(o, f, max) + body + xAxis(labels, f, labelStride(labels.length, f.w)),
    series);
}

/* ------------------------------------------------------------- bar chart */

// One series → plain bars. Several → grouped side-by-side bars.
export function barChart(config) {
  const o = opts(config);
  const series = normalizeSeries(o.series, 'Seri');
  const labels = o.labels || [];
  const f = frame(o);
  const max = o.max || niceMax(Math.max(1, ...series.flatMap(s => s.values)), o.yTicks);

  const band = f.w / Math.max(1, labels.length);
  const gap = band * 0.22;
  const barW = Math.max(2, (band - gap) / series.length);

  const bars = labels.map((label, i) => series.map((s, si) => {
    const v = s.values[i] || 0;
    const h = (v / max) * f.h;
    const x = f.x0 + band * i + gap / 2 + barW * si;
    return `<rect class="ct-bar" x="${num(x)}" y="${num(f.yBase - h)}" width="${num(barW - 1)}" height="${num(h)}" rx="3" fill="${s.color}">`
      + tip(`${s.name} · ${label}: ${o.format(v)}`) + `</rect>`;
  }).join('')).join('');

  return wrap(o,
    yAxis(o, f, max) + bars + xAxis(labels, f, labelStride(labels.length, f.w)),
    series);
}

/* ----------------------------------------------------- stacked bar chart */

export function stackedBarChart(config) {
  const o = opts(config);
  const series = normalizeSeries(o.series, 'Seri');
  const labels = o.labels || [];
  const f = frame(o);

  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
  const max = o.max || niceMax(Math.max(1, ...totals), o.yTicks);

  const band = f.w / Math.max(1, labels.length);
  const barW = Math.min(48, band * 0.62);

  const bars = labels.map((label, i) => {
    const x = f.x0 + band * i + (band - barW) / 2;
    let cursor = f.yBase;
    // Drawn bottom-up so the first series is the base of the stack.
    return series.map(s => {
      const v = s.values[i] || 0;
      if (!v) return '';
      const h = (v / max) * f.h;
      cursor -= h;
      return `<rect class="ct-bar" x="${num(x)}" y="${num(cursor)}" width="${num(barW)}" height="${num(h)}" fill="${s.color}">`
        + tip(`${s.name} · ${label}: ${o.format(v)}`) + `</rect>`;
    }).join('');
  }).join('');

  return wrap(o,
    yAxis(o, f, max) + bars + xAxis(labels, f, labelStride(labels.length, f.w)),
    series);
}

/* ------------------------------------------------------------ donut chart */

function polar(cx, cy, r, angle) {
  const a = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// Ring segment as a closed path: outer arc forward, inner arc back.
function ringSlice(cx, cy, rOuter, rInner, start, end) {
  const [x1, y1] = polar(cx, cy, rOuter, start);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, start);
  const large = end - start > 180 ? 1 : 0;
  return `M${num(x1)} ${num(y1)}A${num(rOuter)} ${num(rOuter)} 0 ${large} 1 ${num(x2)} ${num(y2)}`
       + `L${num(x3)} ${num(y3)}A${num(rInner)} ${num(rInner)} 0 ${large} 0 ${num(x4)} ${num(y4)}Z`;
}

// config.data: [{ label, value, color? }]
export function donutChart(config) {
  const o = opts({ height: config.height || 240, ...config });
  const data = (o.data || []).filter(d => d.value > 0)
    .map((d, i) => ({ ...d, color: d.color || colorAt(i) }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const size = Math.min(o.width, o.height);
  const cx = o.width / 2;
  const cy = o.height / 2;
  const rOuter = size / 2 - 8;
  const rInner = rOuter * (o.thickness ? 1 - o.thickness : 0.62);

  let body;
  if (!total) {
    body = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num((rOuter + rInner) / 2)}" fill="none" stroke="${LINE}" stroke-width="${num(rOuter - rInner)}"/>`;
  } else {
    let angle = 0;
    body = data.map(d => {
      const sweep = (d.value / total) * 360;
      // A full-circle path degenerates (start === end), so draw a ring instead.
      const path = sweep >= 359.99
        ? `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num((rOuter + rInner) / 2)}" fill="none" stroke="${d.color}" stroke-width="${num(rOuter - rInner)}">${tip(`${d.label}: ${o.format(d.value)}`)}</circle>`
        : `<path class="ct-slice" d="${ringSlice(cx, cy, rOuter, rInner, angle, angle + sweep)}" fill="${d.color}">`
          + tip(`${d.label}: ${o.format(d.value)} (%${Math.round(d.value / total * 100)})`) + `</path>`;
      angle += sweep;
      return path;
    }).join('');
  }

  const centerValue = o.centerValue ?? o.format(total);
  const centerLabel = o.centerLabel || '';
  const center =
    `<text x="${num(cx)}" y="${num(cy - (centerLabel ? 4 : 0))}" text-anchor="middle" dominant-baseline="middle" fill="${INK}" font-size="24" font-weight="800">${esc(centerValue)}</text>`
    + (centerLabel ? `<text x="${num(cx)}" y="${num(cy + 18)}" text-anchor="middle" dominant-baseline="middle" fill="${MUTED}" font-size="10">${esc(centerLabel)}</text>` : '');

  // Reuse the shared legend by presenting slices as one-value series.
  return wrap(o, body + center, data.map(d => ({ name: d.label, color: d.color })));
}

/* ---------------------------------------------------------------- mounting */

// Accepts a selector or an element. Returns the container, or null if the
// target isn't on the page — views call this before their section exists.
export function mountChart(target, markup) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return null;
  el.innerHTML = markup;
  return el;
}

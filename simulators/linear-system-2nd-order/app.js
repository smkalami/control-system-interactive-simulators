/**
 * main.js — 2nd-Order Linear System Step Response Simulator
 *
 * Transfer function:  G(s) = K·ωₙ² / (s² + 2ζωₙs + ωₙ²)
 *
 * Step response (unit step):
 *   Underdamped  (ζ < 1):  y(t) = K·[1 − e^(−ζωₙt)·(cos ωd·t + (ζ/√(1−ζ²))·sin ωd·t)]
 *   Critically   (ζ = 1):  y(t) = K·[1 − e^(−ωₙt)·(1 + ωₙ·t)]
 *   Overdamped   (ζ > 1):  y(t) = K·[1 − e^(−ζωₙt)·(cosh ωr·t + (ζ/√(ζ²−1))·sinh ωr·t)]
 *   where ωd = ωₙ√(1−ζ²)  and  ωr = ωₙ√(ζ²−1)
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const N_POINTS = 800;
const K_MAX    = 5;    // must match the K slider's max attribute
const T_MAX    = 10;   // fixed time axis (s) — never changes

// Threshold for switching between underdamped / critical / overdamped
const ZETA_EPS = 1e-4;

// ─── State ───────────────────────────────────────────────────────────────────
let K    = 1.0;
let wn   = 2.0;
let zeta = 0.3;
let chart = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Classify system type from zeta. */
function systemType(zeta) {
  if (zeta < ZETA_EPS)     return 'undamped';
  if (zeta < 1 - ZETA_EPS) return 'underdamped';
  if (zeta > 1 + ZETA_EPS) return 'overdamped';
  return 'critical';
}

/** Build time-domain step response array for the given parameters. */
function computeResponse(K, wn, zeta) {
  const dt    = T_MAX / N_POINTS;
  const sigma = zeta * wn;
  const data  = [];
  const type  = systemType(zeta);

  for (let i = 0; i <= N_POINTS; i++) {
    const t = i * dt;
    let y;

    if (type === 'underdamped' || type === 'undamped') {
      const wd = wn * Math.sqrt(1 - zeta * zeta);
      y = K * (1 - Math.exp(-sigma * t) * (Math.cos(wd * t) + (sigma / wd) * Math.sin(wd * t)));
    } else if (type === 'overdamped') {
      const r  = Math.sqrt(zeta * zeta - 1);
      const wr = wn * r;
      y = K * (1 - Math.exp(-sigma * t) * (Math.cosh(wr * t) + (zeta / r) * Math.sinh(wr * t)));
    } else {
      // Critically damped
      y = K * (1 - Math.exp(-wn * t) * (1 + wn * t));
    }

    data.push({ x: t, y });
  }

  return { data };
}

// ─── Characteristics ──────────────────────────────────────────────────────────

/** Compute all key step-response metrics. */
function getCharacteristics(K, wn, zeta, data) {
  const type = systemType(zeta);
  const c = {
    type,
    ss:  K,
    wd:  null,
    Mp:  null,   // absolute overshoot above K
    MpPct: null, // percentage overshoot
    tp:  null,
    yp:  null,
    t10: null, t90: null, tr: null,
    ts:  null,
  };

  // ── Underdamped / undamped quantities ───────────────────────────────────
  if (type === 'underdamped' || type === 'undamped') {
    c.wd     = wn * Math.sqrt(1 - zeta * zeta);
    c.tp     = Math.PI / c.wd;
    c.Mp     = K * Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta));
    c.MpPct  = (c.Mp / K) * 100;
    c.yp     = K + c.Mp;
  }

  // ── Rise time (10 % → 90 %) — linear interpolation on data ──────────────
  const y10 = 0.1 * K;
  const y90 = 0.9 * K;
  for (let i = 1; i < data.length; i++) {
    const p = data[i - 1], q = data[i];
    if (c.t10 === null && q.y >= y10) {
      c.t10 = p.x + (y10 - p.y) / (q.y - p.y) * (q.x - p.x);
    }
    if (c.t10 !== null && c.t90 === null && q.y >= y90) {
      c.t90 = p.x + (y90 - p.y) / (q.y - p.y) * (q.x - p.x);
      break;
    }
  }
  if (c.t10 !== null && c.t90 !== null) c.tr = c.t90 - c.t10;

  // ── Settling time (±2 % band) — scan from the end ────────────────────────
  const band = 0.02 * K;
  c.ts = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (Math.abs(data[i].y - K) > band) {
      c.ts = data[i].x;
      break;
    }
  }

  return c;
}

// ─── Annotations ─────────────────────────────────────────────────────────────

/**
 * Build the chartjs-plugin-annotation v3 annotations object.
 *
 * ssLine      — red     horizontal dashed at y = K
 * bandTop/Bot — faint red dashes at ±2 % of K
 * trBox       — amber   shaded 10–90 % rise-time region
 * tsLine      — violet  vertical dashed at t = tₛ
 * peakHLine   — cyan    horizontal guide from 0 → tₚ at y = yₚ
 * tpLine      — cyan    vertical dashed at t = tₚ
 * peakPoint   — cyan    filled dot at (tₚ, yₚ)
 */
function buildAnnotations(K, wn, zeta, data) {
  const c   = getCharacteristics(K, wn, zeta, data);
  const ann = {};

  // ── Steady-state line ───────────────────────────────────────────────────
  ann.ssLine = {
    type: 'line',
    yMin: K, yMax: K,
    borderColor: 'rgba(220, 38, 38, 0.85)',
    borderWidth: 1.8,
    borderDash: [8, 5],
    label: {
      display: true,
      content: `K = ${K.toFixed(2)}`,
      position: 'end',
      color: '#dc2626',
      backgroundColor: 'rgba(255,255,255,0.85)',
      font: { size: 11, weight: '600' },
      padding: { x: 5, y: 3 },
      xAdjust: -6, yAdjust: -12,
    },
  };

  // ── ±2 % settling band ──────────────────────────────────────────────────
  ann.bandTop = {
    type: 'line', yMin: K * 1.02, yMax: K * 1.02,
    borderColor: 'rgba(220, 38, 38, 0.22)', borderWidth: 1, borderDash: [4, 7],
  };
  ann.bandBot = {
    type: 'line', yMin: K * 0.98, yMax: K * 0.98,
    borderColor: 'rgba(220, 38, 38, 0.22)', borderWidth: 1, borderDash: [4, 7],
  };

  // ── Rise-time region ────────────────────────────────────────────────────
  if (c.t10 !== null && c.t90 !== null) {
    ann.trBox = {
      type: 'box',
      xMin: c.t10, xMax: c.t90,
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderColor:     'rgba(217, 119, 6, 0.55)',
      borderWidth: 1,
      label: {
        display: true,
        content: `tᵣ = ${c.tr.toFixed(3)} s`,
        color: '#b45309',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        position: { x: 'center', y: 'start' },
        yAdjust: 8,
      },
    };
  }

  // ── Settling-time line (suppressed for undamped — ts is infinite) ─────────
  if (c.ts > 0 && c.type !== 'undamped') {
    ann.tsLine = {
      type: 'line',
      xMin: c.ts, xMax: c.ts,
      borderColor: 'rgba(124, 58, 237, 0.80)',
      borderWidth: 1.8,
      borderDash: [8, 5],
      label: {
        display: true,
        content: `tₛ = ${c.ts.toFixed(3)} s`,
        position: 'start',
        color: '#7c3aed',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 6, yAdjust: 6,
      },
    };
  }

  // ── Peak overshoot (underdamped and undamped) ────────────────────────────
  if ((c.type === 'underdamped' || c.type === 'undamped') && c.tp !== null) {
    // Horizontal guide at peak height
    ann.peakHLine = {
      type: 'line',
      yMin: c.yp, yMax: c.yp,
      xMin: 0, xMax: c.tp,
      borderColor: 'rgba(8, 145, 178, 0.50)',
      borderWidth: 1.3,
      borderDash: [5, 4],
      label: {
        display: true,
        content: `Mₚ = ${c.MpPct.toFixed(1)} %`,
        position: 'start',
        color: '#0891b2',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 5,
      },
    };

    // Vertical dashed at tₚ
    ann.tpLine = {
      type: 'line',
      xMin: c.tp, xMax: c.tp,
      borderColor: 'rgba(8, 145, 178, 0.70)',
      borderWidth: 1.6,
      borderDash: [6, 5],
      label: {
        display: true,
        content: `tₚ = ${c.tp.toFixed(3)} s`,
        position: 'start',
        color: '#0891b2',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 6, yAdjust: 30,
      },
    };

    // Dot at (tₚ, yₚ)
    ann.peakPoint = {
      type: 'point',
      xValue: c.tp, yValue: c.yp,
      radius: 5,
      backgroundColor: '#0891b2',
      borderColor: '#ffffff',
      borderWidth: 2,
    };
  }

  return ann;
}

// ─── Y-axis ceiling ───────────────────────────────────────────────────────────

/**
 * Fixed y-axis ceiling — never changes with K.
 * Based on K_MAX × 2.2 so the undamped peak (2 K_MAX) still fits with headroom.
 * When the learner reduces K the curve visibly shrinks; increasing K raises it.
 */
const Y_MAX = 5;

// ─── Chart ───────────────────────────────────────────────────────────────────

function buildChart(data, K, wn, zeta) {
  const ctx = document.getElementById('chart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'y(t)',
        data,
        borderColor: '#2563eb',
        borderWidth: 2.2,
        pointRadius: 0,
        tension: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,

      plugins: {
        legend: { display: false },
        annotation: {
          clip: false,
          annotations: buildAnnotations(K, wn, zeta, data),
        },
        tooltip: {
          callbacks: {
            title: items => `t = ${items[0].parsed.x.toFixed(4)} s`,
            label: item  => `y = ${item.parsed.y.toFixed(4)}`,
          },
        },
      },

      scales: {
        x: {
          type: 'linear',
          min: 0, max: T_MAX,
          title: { display: true, text: 'Time  t  (s)', font: { size: 13 }, color: '#475569' },
          ticks: { maxTicksLimit: 11, color: '#64748b' },
          grid:  { color: '#f1f5f9' },
        },
        y: {
          min: 0, max: Y_MAX,
          title: { display: true, text: 'Output  y(t)', font: { size: 13 }, color: '#475569' },
          ticks: { color: '#64748b' },
          grid:  { color: '#f1f5f9' },
        },
      },
    },
  });
}

function updateChart() {
  const { data } = computeResponse(K, wn, zeta);

  chart.data.datasets[0].data                  = data;
  chart.options.plugins.annotation.annotations = buildAnnotations(K, wn, zeta, data);
  // x and y axis limits are fixed — no update needed

  chart.update('none');

  const c = getCharacteristics(K, wn, zeta, data);
  updateTable(c);
  updateBadge(c.type);
}

// ─── Characteristics table ────────────────────────────────────────────────────

function updateTable(c) {
  const fmt   = (v, d = 4) => (v !== null && !isNaN(v)) ? v.toFixed(d) : '—';
  const fmtS  = v => (v !== null && !isNaN(v)) ? `${v.toFixed(4)} s`     : '—';
  const fmtHz = v => (v !== null && !isNaN(v)) ? `${v.toFixed(4)} rad/s` : '—';

  document.getElementById('char-ss').textContent =
    fmt(c.ss);

  document.getElementById('char-wd').textContent =
    (c.type === 'underdamped' || c.type === 'undamped') ? fmtHz(c.wd) : 'N/A  (no oscillation)';

  document.getElementById('char-Mp').textContent =
    (c.type === 'underdamped' || c.type === 'undamped')
      ? `${c.MpPct.toFixed(2)} %  (+${fmt(c.Mp)} above K)`
      : '0 %  (no overshoot)';

  document.getElementById('char-tp').textContent =
    (c.type === 'underdamped' || c.type === 'undamped') ? fmtS(c.tp) : 'N/A';

  document.getElementById('char-tr').textContent = fmtS(c.tr);
  document.getElementById('char-ts').textContent =
    c.type === 'undamped' ? '\u221e  (never settles)' : fmtS(c.ts);
}

// ─── System-type badge ────────────────────────────────────────────────────────

function updateBadge(type) {
  const el  = document.getElementById('system-type');
  const map = {
    undamped:    { text: 'Undamped  (\u03B6 = 0)',           cls: 'badge-undamped' },
    underdamped: { text: 'Underdamped  (\u03B6 < 1)',       cls: 'badge-under'    },
    critical:    { text: 'Critically Damped  (\u03B6 = 1)', cls: 'badge-critical' },
    overdamped:  { text: 'Overdamped  (\u03B6 > 1)',        cls: 'badge-over'     },
  };
  el.textContent = map[type].text;
  el.className   = `badge ${map[type].cls}`;
}

// ─── Input sync ───────────────────────────────────────────────────────────────

/**
 * Keep a range slider and number input in sync,
 * then call onChange(value) with the clamped value.
 */
function syncInputs(sliderId, numberId, onChange) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  const clamp  = v => Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), v));

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    number.value = val;
    onChange(val);
  });

  number.addEventListener('input', () => {
    const raw = parseFloat(number.value);
    if (isNaN(raw)) return;
    const val = clamp(raw);
    slider.value = val;
    number.value = val;
    onChange(val);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const { data } = computeResponse(K, wn, zeta);
  buildChart(data, K, wn, zeta);
  const c = getCharacteristics(K, wn, zeta, data);
  updateTable(c);
  updateBadge(c.type);

  syncInputs('k-slider',    'k-number',    val => { K    = val; updateChart(); });
  syncInputs('wn-slider',   'wn-number',   val => { wn   = val; updateChart(); });
  syncInputs('zeta-slider', 'zeta-number', val => { zeta = val; updateChart(); });
});

// ── Fullscreen ─────────────────────────────────────────────────────────────────
const fsBtn = document.getElementById('fsBtn');

function updateFsBtn() {
  const inFs      = !!document.fullscreenElement;
  fsBtn.innerHTML = inFs ? '&#x2715; Exit Full Screen' : '&#x26F6; Full Screen';
  fsBtn.title     = inFs ? 'Exit fullscreen' : 'Enter fullscreen';
}
fsBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange', updateFsBtn);

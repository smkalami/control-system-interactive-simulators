/**
 * main.js — 1st-Order Linear System Step Response Simulator
 *
 * Transfer function:  G(s) = K / (τs + 1)
 * Step response:      y(t) = K * (1 − exp(−t / τ))
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const N_POINTS = 600; // number of data points along the curve

// Parameter limits — sliders are capped here, axes are fixed to these extents
// so that the curve visually stretches/compresses as τ and K change.
const TAU_MAX = 5;
const K_MAX   = 2;
const X_MAX   = 20; // fixed x-axis ceiling (s)
const Y_MAX   = 2;  // fixed y-axis ceiling

// ─── State ───────────────────────────────────────────────────────────────────

let tau = 1.0; // time constant (s)
let K   = 1.0; // steady-state gain
let chart = null;

// ─── Domain maths ────────────────────────────────────────────────────────────

/**
 * Build time-domain step response data across the full fixed time window
 * (X_MAX), so the curve's speed is visually apparent as τ changes.
 */
function computeResponse(tau, K) {
  const dt   = X_MAX / N_POINTS;
  const data = [];
  for (let i = 0; i <= N_POINTS; i++) {
    const t = i * dt;
    data.push({ x: t, y: K * (1 - Math.exp(-t / tau)) });
  }
  return { data };
}

/**
 * Return the five key characteristics for given τ, K.
 */
function getCharacteristics(tau, K) {
  return {
    ss:    K,                          // steady-state value  y(∞)
    yTau:  K * (1 - 1 / Math.E),      // 0.6321 · K at t = τ
    t10:   tau * Math.log(1 / 0.9),   // 10 % crossing ≈ 0.1054 τ
    t90:   tau * Math.log(10),         // 90 % crossing ≈ 2.303  τ
    tr:    tau * Math.log(9),          // rise time = t90 − t10 ≈ 2.197 τ
    ts:    4 * tau,                    // 2 % settling time ≈ 4 τ
    slope: K / tau,                    // initial tangent slope dy/dt|₀
  };
}

// ─── Annotations ─────────────────────────────────────────────────────────────

/**
 * Build the chartjs-plugin-annotation v3 annotations object.
 *
 * Annotation map:
 *   ssLine    — red    horizontal dashed at y = K
 *   tauVLine  — green  vertical   dashed at x = τ
 *   tauHLine  — green  horizontal dashed from x=0 to x=τ at y=0.632K
 *   tauPoint  — green  filled dot at (τ, 0.632K)
 *   slopeLine — slate  angled tangent from (0,0) to (τ, K)
 *   trBox     — amber  shaded region from t₁₀ to t₉₀
 *   tsLine    — violet vertical dashed at x = 4τ
 */
function buildAnnotations(tau, K) {
  const c = getCharacteristics(tau, K);

  return {

    // ── Steady-state line ───────────────────────────────────────────────
    ssLine: {
      type: 'line',
      yMin: c.ss,
      yMax: c.ss,
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
        xAdjust: -6,
        yAdjust: -12,
      },
    },

    // ── Time-constant vertical line ─────────────────────────────────────
    tauVLine: {
      type: 'line',
      xMin: tau,
      xMax: tau,
      borderColor: 'rgba(22, 163, 74, 0.80)',
      borderWidth: 1.8,
      borderDash: [8, 5],
      label: {
        display: true,
        content: `τ = ${tau.toFixed(2)} s`,
        position: 'start',       // top of line
        color: '#16a34a',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 6,
        yAdjust: 6,
      },
    },

    // ── 0.632 K horizontal guide ────────────────────────────────────────
    tauHLine: {
      type: 'line',
      yMin: c.yTau,
      yMax: c.yTau,
      xMin: 0,
      xMax: tau,
      borderColor: 'rgba(22, 163, 74, 0.50)',
      borderWidth: 1.4,
      borderDash: [5, 4],
    },

    // ── Dot at (τ, 0.632 K) ─────────────────────────────────────────────
    tauPoint: {
      type: 'point',
      xValue: tau,
      yValue: c.yTau,
      radius: 5,
      backgroundColor: '#16a34a',
      borderColor: '#ffffff',
      borderWidth: 2,
    },

    // ── Initial slope tangent  y = (K/τ)·t  from (0,0) → (τ, K) ───────
    // Line annotation with both x and y endpoints draws a sloped line.
    slopeLine: {
      type: 'line',
      xMin: 0,
      xMax: tau,
      yMin: 0,
      yMax: K,
      borderColor: 'rgba(100, 116, 139, 0.65)',
      borderWidth: 1.6,
      borderDash: [5, 5],
      label: {
        display: true,
        content: `K/τ = ${c.slope.toFixed(2)}`,
        position: 'center',
        color: '#475569',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 10 },
        padding: { x: 4, y: 2 },
        yAdjust: -14,
      },
    },

    // ── Rise-time shaded region ─────────────────────────────────────────
    trBox: {
      type: 'box',
      xMin: c.t10,
      xMax: c.t90,
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderColor: 'rgba(217, 119, 6, 0.55)',
      borderWidth: 1,
      label: {
        display: true,
        content: `tᵣ = ${c.tr.toFixed(2)} s`,
        color: '#b45309',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        position: { x: 'center', y: 'start' },
        yAdjust: 8,
      },
    },

    // ── Settling-time vertical line ─────────────────────────────────────
    tsLine: {
      type: 'line',
      xMin: c.ts,
      xMax: c.ts,
      borderColor: 'rgba(124, 58, 237, 0.80)',
      borderWidth: 1.8,
      borderDash: [8, 5],
      label: {
        display: true,
        content: `tₛ = ${c.ts.toFixed(2)} s`,
        position: 'start',
        color: '#7c3aed',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 6,
        yAdjust: 6,
      },
    },

  };
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function buildChart(data, tau, K) {
  const ctx = document.getElementById('chart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'y(t)',
        data: data,
        borderColor: '#2563eb',
        borderWidth: 2.2,
        pointRadius: 0,
        tension: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,      // instant updates feel snappier

      plugins: {
        legend: { display: false },

        annotation: {
          clip: false,
          annotations: buildAnnotations(tau, K),
        },

        tooltip: {
          callbacks: {
            title:  items => `t = ${items[0].parsed.x.toFixed(3)} s`,
            label:  item  => `y = ${item.parsed.y.toFixed(4)}`,
          },
        },
      },

      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: X_MAX,
          title: {
            display: true,
            text: 'Time  t  (s)',
            font: { size: 13 },
            color: '#475569',
          },
          ticks: { maxTicksLimit: 11, color: '#64748b' },
          grid:  { color: '#f1f5f9' },
        },
        y: {
          min: 0,
          max: Y_MAX,
          title: {
            display: true,
            text: 'Output  y(t)',
            font: { size: 13 },
            color: '#475569',
          },
          ticks: { color: '#64748b' },
          grid:  { color: '#f1f5f9' },
        },
      },
    },
  });
}

function updateChart() {
  const { data } = computeResponse(tau, K);

  chart.data.datasets[0].data                        = data;
  chart.options.plugins.annotation.annotations       = buildAnnotations(tau, K);

  chart.update('none'); // skip animation for instant response
  updateTable();
}

// ─── Characteristics table ────────────────────────────────────────────────────

function updateTable() {
  const c = getCharacteristics(tau, K);
  const fmt4 = v => v.toFixed(4);
  const fmtS = v => `${v.toFixed(4)} s`;

  document.getElementById('char-ss').textContent    = fmt4(c.ss);
  document.getElementById('char-ytau').textContent  = `${fmt4(c.yTau)}  (at t = ${tau.toFixed(2)} s)`;
  document.getElementById('char-tr').textContent    = fmtS(c.tr);
  document.getElementById('char-ts').textContent    = fmtS(c.ts);
  document.getElementById('char-slope').textContent = `${fmt4(c.slope)} unit/s`;
}

// ─── Input synchronisation ────────────────────────────────────────────────────

/**
 * Keep a range slider and a number input in sync.
 * Calls onChange(value) after every change, clamped to [min, max].
 */
function syncInputs(sliderId, numberId, onChange) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);

  const clamp = v => Math.min(
    parseFloat(slider.max),
    Math.max(parseFloat(slider.min), v)
  );

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    number.value = val;
    onChange(val);
  });

  number.addEventListener('input', () => {
    const raw = parseFloat(number.value);
    if (isNaN(raw)) return;
    const val = clamp(raw);
    slider.value  = val;
    number.value  = val;
    onChange(val);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const { data } = computeResponse(tau, K);
  buildChart(data, tau, K);
  updateTable();

  syncInputs('tau-slider', 'tau-number', val => { tau = val; updateChart(); });
  syncInputs('k-slider',   'k-number',   val => { K   = val; updateChart(); });
});

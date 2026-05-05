/**
 * Pole-Zero Map Simulator
 *
 * Transfer function: G(s) = K prod(s - z_i) / prod(s - p_i)
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const N_POINTS = 1000;
const T_MAX = 10;
const Y_MIN = -3;
const Y_MAX = 3;
const MAP_X_MIN = -5;
const MAP_X_MAX = 3;
const MAP_Y_MIN = -5;
const MAP_Y_MAX = 5;
const RESPONSE_LIMIT = 3;
const RESPONSE_CLIP_MARGIN = 0.35;
const EPS = 1e-9;

const PRESETS = {
  complex: {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: false, value: -1 },
    realPoleB: { enabled: false, value: -2 },
    complexPair: { enabled: true, real: -1, imag: 2 },
    realZeroA: { enabled: false, value: -0.5 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'A complex conjugate pair creates oscillation. The negative real part makes the oscillation decay with time.',
  },
  'stable-real': {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: true, value: -1 },
    realPoleB: { enabled: true, value: -3 },
    complexPair: { enabled: false, real: -1, imag: 2 },
    realZeroA: { enabled: false, value: -0.5 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'Separated real poles produce a stable non-oscillatory response. The pole closest to the imaginary axis dominates the speed.',
  },
  'near-axis': {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: false, value: -1 },
    realPoleB: { enabled: false, value: -2 },
    complexPair: { enabled: true, real: -0.2, imag: 1.8 },
    realZeroA: { enabled: false, value: -0.5 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'Poles close to the imaginary axis decay slowly, so the transient remains visible for a longer time.',
  },
  unstable: {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: false, value: -1 },
    realPoleB: { enabled: false, value: -2 },
    complexPair: { enabled: true, real: 0.35, imag: 1.4 },
    realZeroA: { enabled: false, value: -0.5 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'Any right-half-plane pole makes the system unstable. The response plot is clipped to keep the fixed axes readable.',
  },
  cancellation: {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: true, value: -1 },
    realPoleB: { enabled: true, value: -3 },
    complexPair: { enabled: false, real: -1, imag: 2 },
    realZeroA: { enabled: true, value: -1 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'An ideal zero at the same location as a pole removes that mode from the transfer function. Exact cancellation is fragile in physical systems.',
  },
  'zero-added': {
    K: 1,
    responseType: 'step',
    realPoleA: { enabled: false, value: -1 },
    realPoleB: { enabled: false, value: -2 },
    complexPair: { enabled: true, real: -1, imag: 2 },
    realZeroA: { enabled: true, value: -0.5 },
    realZeroB: { enabled: false, value: -3 },
    explanation: 'A zero changes the transient shape and initial motion, while the poles still determine stability.',
  },
};

// ─── State ───────────────────────────────────────────────────────────────────

let state = structuredClone(PRESETS.complex);
let currentPreset = 'complex';
let mapChart = null;
let responseChart = null;

// ─── Complex helpers ─────────────────────────────────────────────────────────

const complex = (re, im = 0) => ({ re, im });

// ─── Domain maths ────────────────────────────────────────────────────────────

function currentSystem() {
  const poles = [];
  const zeros = [];

  if (state.realPoleA.enabled) poles.push(complex(state.realPoleA.value, 0));
  if (state.realPoleB.enabled) poles.push(complex(state.realPoleB.value, 0));

  if (state.complexPair.enabled) {
    poles.push(complex(state.complexPair.real, state.complexPair.imag));
    poles.push(complex(state.complexPair.real, -state.complexPair.imag));
  }

  if (state.realZeroA.enabled) zeros.push(complex(state.realZeroA.value, 0));
  if (state.realZeroB.enabled) zeros.push(complex(state.realZeroB.value, 0));

  const numerator = polynomialFromRoots(zeros).map(c => c * state.K);
  const denominator = polynomialFromRoots(poles);

  return { poles, zeros, numerator, denominator };
}

function polynomialFromRoots(roots) {
  let coeffs = [1];

  roots.forEach(root => {
    if (Math.abs(root.im) < EPS) {
      coeffs = multiplyPolynomials(coeffs, [1, -root.re]);
    }
  });

  const usedComplex = new Set();
  roots.forEach((root, index) => {
    if (Math.abs(root.im) < EPS || usedComplex.has(index)) return;
    const mateIndex = roots.findIndex((candidate, candidateIndex) => (
      candidateIndex !== index &&
      !usedComplex.has(candidateIndex) &&
      Math.abs(candidate.re - root.re) < EPS &&
      Math.abs(candidate.im + root.im) < EPS
    ));
    if (mateIndex >= 0) {
      coeffs = multiplyPolynomials(coeffs, [1, -2 * root.re, root.re * root.re + root.im * root.im]);
      usedComplex.add(index);
      usedComplex.add(mateIndex);
    }
  });

  return coeffs.map(cleanNumber);
}

function multiplyPolynomials(a, b) {
  const result = Array(a.length + b.length - 1).fill(0);
  a.forEach((av, ai) => {
    b.forEach((bv, bi) => {
      result[ai + bi] += av * bv;
    });
  });
  return result;
}

function cleanNumber(v) {
  return Math.abs(v) < 1e-10 ? 0 : v;
}

function padNumerator(numerator, denominatorOrder) {
  const padded = Array(denominatorOrder + 1).fill(0);
  const offset = padded.length - numerator.length;
  numerator.forEach((value, index) => {
    padded[offset + index] = value;
  });
  return padded;
}

function stateSpaceFromPolynomials(numerator, denominator) {
  const n = denominator.length - 1;
  const normalizedDen = denominator.map(c => c / denominator[0]);
  const normalizedNum = numerator.map(c => c / denominator[0]);
  const b = padNumerator(normalizedNum, n);
  const d = b[0];
  const a = normalizedDen.slice(1);

  const A = Array.from({ length: n }, () => Array(n).fill(0));
  for (let row = 0; row < n - 1; row++) A[row][row + 1] = 1;
  for (let col = 0; col < n; col++) A[n - 1][col] = -a[n - 1 - col];

  const B = Array(n).fill(0);
  B[n - 1] = 1;

  const C = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    C[i] = b[n - i] - d * a[n - 1 - i];
  }

  return { A, B, C, D: d };
}

function computeResponse() {
  const system = currentSystem();
  const n = system.denominator.length - 1;
  const invalid = responseInvalidReason(system);
  const data = [];

  if (invalid) {
    for (let i = 0; i <= N_POINTS; i++) data.push({ x: i * T_MAX / N_POINTS, y: 0 });
    return { data, clipped: false, invalid };
  }

  const ss = stateSpaceFromPolynomials(system.numerator, system.denominator);
  const dt = T_MAX / N_POINTS;
  let x = Array(n).fill(0);
  let clipped = false;

  if (state.responseType === 'impulse') x = ss.B.slice();

  for (let i = 0; i <= N_POINTS; i++) {
    const t = i * dt;
    const u = state.responseType === 'step' ? 1 : 0;
    const rawY = dot(ss.C, x) + ss.D * u;
    const outsideRange = !isFinite(rawY) || Math.abs(rawY) > RESPONSE_LIMIT;
    const y = outsideRange
      ? Math.sign(rawY || 1) * (RESPONSE_LIMIT + RESPONSE_CLIP_MARGIN)
      : rawY;
    if (outsideRange) clipped = true;
    data.push({ x: t, y });
    x = rk4Step(x, dt, ss.A, ss.B, u);
  }

  return { data, clipped, invalid: null };
}

function responseInvalidReason(system) {
  const poleCount = system.denominator.length - 1;
  const zeroOrder = system.numerator.length - 1;

  if (poleCount < 1) return 'Enable at least one pole to define a dynamic system.';
  if (zeroOrder > poleCount) return 'The numerator order is greater than the denominator order, so this transfer function is not proper.';
  return null;
}

function rk4Step(x, dt, A, B, u) {
  const k1 = derivative(x, A, B, u);
  const k2 = derivative(addVectors(x, scaleVector(k1, dt / 2)), A, B, u);
  const k3 = derivative(addVectors(x, scaleVector(k2, dt / 2)), A, B, u);
  const k4 = derivative(addVectors(x, scaleVector(k3, dt)), A, B, u);

  return x.map((value, index) => value + dt / 6 * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]));
}

function derivative(x, A, B, u) {
  return A.map((row, rowIndex) => dot(row, x) + B[rowIndex] * u);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function addVectors(a, b) {
  return a.map((value, index) => value + b[index]);
}

function scaleVector(a, factor) {
  return a.map(value => value * factor);
}

// ─── Characteristics ─────────────────────────────────────────────────────────

function getCharacteristics() {
  const system = currentSystem();
  const dominantReal = system.poles.length ? Math.max(...system.poles.map(p => p.re)) : null;
  const unstable = system.poles.some(p => p.re > 0);
  const marginal = !unstable && system.poles.some(p => Math.abs(p.re) < 0.03);
  const oscillatory = system.poles.some(p => Math.abs(p.im) > 0.03);
  const hasZeroCancellation = system.zeros.some(z => system.poles.some(p => Math.hypot(p.re - z.re, p.im - z.im) < 0.03));

  let speed = 'N/A';
  if (dominantReal !== null) {
    if (unstable) {
      speed = 'Divergent';
    } else if (Math.abs(dominantReal) < 0.35) {
      speed = 'Slow decay';
    } else if (Math.abs(dominantReal) < 1.3) {
      speed = 'Moderate decay';
    } else {
      speed = 'Fast decay';
    }
  }

  return {
    ...system,
    dominantReal,
    unstable,
    marginal,
    oscillatory,
    speed,
    hasZeroCancellation,
    invalid: responseInvalidReason(system),
  };
}

// ─── Text formatting ─────────────────────────────────────────────────────────

function fmtNumber(value, digits = 2) {
  const cleaned = cleanNumber(value);
  if (Math.abs(cleaned - Math.round(cleaned)) < 1e-9) return String(Math.round(cleaned));
  return cleaned.toFixed(digits).replace(/\.?0+$/, '');
}

function fmtPoint(p) {
  if (Math.abs(p.im) < 0.005) return fmtNumber(p.re);
  return `${fmtNumber(p.re)} ${p.im >= 0 ? '+' : '-'} ${fmtNumber(Math.abs(p.im))}j`;
}

function factorForRealRoot(root) {
  if (root < 0) return `(s+${fmtNumber(Math.abs(root))})`;
  if (root > 0) return `(s-${fmtNumber(root)})`;
  return 's';
}

function complexPairFactor(real, imag) {
  return polynomialLatex([1, -2 * real, real * real + imag * imag]);
}

function polynomialLatex(coeffs) {
  const degree = coeffs.length - 1;
  const terms = [];

  coeffs.forEach((coeff, index) => {
    const power = degree - index;
    const value = cleanNumber(coeff);
    if (Math.abs(value) < 0.005) return;

    const sign = value < 0 ? '-' : '+';
    const abs = Math.abs(value);
    let body;

    if (power === 0) {
      body = fmtNumber(abs);
    } else {
      const coeffText = Math.abs(abs - 1) < 0.005 ? '' : fmtNumber(abs);
      body = power === 1 ? `${coeffText}s` : `${coeffText}s^${power}`;
    }

    terms.push({ sign, body });
  });

  if (!terms.length) return '0';

  return terms.map((term, index) => {
    if (index === 0) return term.sign === '-' ? `-${term.body}` : term.body;
    return ` ${term.sign} ${term.body}`;
  }).join('');
}

function transferFunctionLatex() {
  const { numerator, denominator } = currentSystem();
  return `\\[\\displaystyle G(s) = \\frac{${polynomialLatex(numerator)}}{${polynomialLatex(denominator)}}\\]`;
}

// ─── Annotations ─────────────────────────────────────────────────────────────

function buildMapAnnotations(c) {
  const ann = {
    stableRegion: {
      type: 'box',
      xMin: MAP_X_MIN,
      xMax: 0,
      yMin: MAP_Y_MIN,
      yMax: MAP_Y_MAX,
      backgroundColor: 'rgba(22, 163, 74, 0.07)',
      borderWidth: 0,
      label: {
        display: true,
        content: 'stable region',
        position: { x: 'start', y: 'start' },
        color: '#166534',
        backgroundColor: 'rgba(255,255,255,0.82)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 8,
        yAdjust: 8,
      },
    },
    unstableRegion: {
      type: 'box',
      xMin: 0,
      xMax: MAP_X_MAX,
      yMin: MAP_Y_MIN,
      yMax: MAP_Y_MAX,
      backgroundColor: 'rgba(220, 38, 38, 0.06)',
      borderWidth: 0,
      label: {
        display: true,
        content: 'unstable region',
        position: { x: 'end', y: 'start' },
        color: '#b91c1c',
        backgroundColor: 'rgba(255,255,255,0.82)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: -8,
        yAdjust: 8,
      },
    },
    imaginaryAxis: {
      type: 'line',
      xMin: 0,
      xMax: 0,
      borderColor: 'rgba(15, 23, 42, 0.72)',
      borderWidth: 1.8,
      label: {
        display: true,
        content: 'imaginary axis',
        position: 'start',
        color: '#334155',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: 6,
        yAdjust: 6,
      },
    },
  };

  if (c.dominantReal !== null) {
    ann.dominantLine = {
      type: 'line',
      xMin: c.dominantReal,
      xMax: c.dominantReal,
      borderColor: 'rgba(124, 58, 237, 0.82)',
      borderWidth: 1.8,
      borderDash: [8, 5],
      label: {
        display: true,
        content: `dominant real part = ${fmtNumber(c.dominantReal)}`,
        position: 'end',
        color: '#7c3aed',
        backgroundColor: 'rgba(255,255,255,0.85)',
        font: { size: 11, weight: '600' },
        padding: { x: 5, y: 3 },
        xAdjust: -6,
        yAdjust: -12,
      },
    };
  }

  return ann;
}

function buildResponseAnnotations(c) {
  const ann = {};

  if (state.responseType === 'step' && !c.invalid && !c.unstable) {
    const dcGain = dcGainValue(c);
    if (isFinite(dcGain) && Math.abs(dcGain) <= RESPONSE_LIMIT) {
      ann.finalValue = {
        type: 'line',
        yMin: dcGain,
        yMax: dcGain,
        borderColor: 'rgba(220, 38, 38, 0.80)',
        borderWidth: 1.6,
        borderDash: [8, 5],
        label: {
          display: true,
          content: `final value = ${fmtNumber(dcGain)}`,
          position: 'end',
          color: '#dc2626',
          backgroundColor: 'rgba(255,255,255,0.85)',
          font: { size: 11, weight: '600' },
          padding: { x: 5, y: 3 },
          xAdjust: -6,
          yAdjust: -12,
        },
      };
    }
  }

  if (!c.invalid && !c.unstable && c.dominantReal !== null && c.dominantReal < -0.03) {
    const tau = -1 / c.dominantReal;
    if (tau <= T_MAX) {
      ann.decayTime = {
        type: 'line',
        xMin: tau,
        xMax: tau,
        borderColor: 'rgba(22, 163, 74, 0.80)',
        borderWidth: 1.7,
        borderDash: [8, 5],
        label: {
          display: true,
          content: `decay time = ${fmtNumber(tau)} s`,
          position: 'start',
          color: '#16a34a',
          backgroundColor: 'rgba(255,255,255,0.85)',
          font: { size: 11, weight: '600' },
          padding: { x: 5, y: 3 },
          xAdjust: 6,
          yAdjust: 6,
        },
      };
    }
  }

  return ann;
}

function dcGainValue(c) {
  const n0 = c.numerator[c.numerator.length - 1];
  const d0 = c.denominator[c.denominator.length - 1];
  if (Math.abs(d0) < EPS) return Infinity;
  return n0 / d0;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function buildMapChart(c) {
  const ctx = document.getElementById('map-chart').getContext('2d');
  mapChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: mapDatasets(c) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#64748b', boxWidth: 10, usePointStyle: true },
        },
        annotation: { clip: false, annotations: buildMapAnnotations(c) },
        tooltip: {
          callbacks: {
            label: item => `${item.dataset.label}: ${fmtPoint(complex(item.parsed.x, item.parsed.y))}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: MAP_X_MIN,
          max: MAP_X_MAX,
          title: { display: true, text: 'Real axis', font: { size: 13 }, color: '#475569' },
          ticks: { color: '#64748b' },
          grid: { color: '#f1f5f9' },
        },
        y: {
          min: MAP_Y_MIN,
          max: MAP_Y_MAX,
          title: { display: true, text: 'Imaginary axis', font: { size: 13 }, color: '#475569' },
          ticks: { color: '#64748b' },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

function mapDatasets(c) {
  return [
    {
      label: 'Poles',
      data: c.poles.map(p => ({ x: p.re, y: p.im })),
      pointStyle: 'crossRot',
      pointRadius: 8,
      pointHoverRadius: 9,
      borderColor: '#1e293b',
      backgroundColor: '#1e293b',
      borderWidth: 2.4,
    },
    {
      label: 'Zeros',
      data: c.zeros.map(z => ({ x: z.re, y: z.im })),
      pointStyle: 'circle',
      pointRadius: 8,
      pointHoverRadius: 9,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(255,255,255,0)',
      borderWidth: 2.2,
    },
  ];
}

function buildResponseChart(data, c) {
  const ctx = document.getElementById('response-chart').getContext('2d');
  responseChart = new Chart(ctx, {
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
        annotation: { clip: false, annotations: buildResponseAnnotations(c) },
        tooltip: {
          callbacks: {
            title: items => `t = ${items[0].parsed.x.toFixed(3)} s`,
            label: item => `y = ${item.parsed.y.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: T_MAX,
          title: { display: true, text: 'Time  t  (s)', font: { size: 13 }, color: '#475569' },
          ticks: { maxTicksLimit: 11, color: '#64748b' },
          grid: { color: '#f1f5f9' },
        },
        y: {
          min: Y_MIN,
          max: Y_MAX,
          title: { display: true, text: 'Output  y(t)', font: { size: 13 }, color: '#475569' },
          ticks: { color: '#64748b' },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

function updateChart() {
  const response = computeResponse();
  const c = getCharacteristics();

  mapChart.data.datasets = mapDatasets(c);
  mapChart.options.plugins.annotation.annotations = buildMapAnnotations(c);
  mapChart.update('none');

  responseChart.data.datasets[0].data = response.data;
  responseChart.options.plugins.annotation.annotations = buildResponseAnnotations(c);
  responseChart.update('none');

  updateTable(c);
  updateFormula();
  updateBadge(c);
  updateFactorLabels();
  updateComponentStates();
}

// ─── Table and display ───────────────────────────────────────────────────────

function updateTable(c) {
  document.getElementById('char-poles').textContent = String(c.poles.length);
  document.getElementById('char-zeros').textContent = String(c.zeros.length);
  document.getElementById('char-order').textContent = String(Math.max(0, c.denominator.length - 1));
  document.getElementById('char-dominant-real').textContent = c.dominantReal === null ? 'N/A' : fmtNumber(c.dominantReal);
  document.getElementById('char-stability').textContent = c.invalid ? 'N/A' : (c.unstable ? 'Unstable' : (c.marginal ? 'Nearly marginal' : 'Stable'));
  document.getElementById('char-oscillation').textContent = c.oscillatory ? 'Oscillatory' : 'Non-oscillatory';
  document.getElementById('char-speed').textContent = c.speed;

  if (c.zeros.length === 0) {
    document.getElementById('char-zero-effect').textContent = 'No finite zeros';
  } else if (c.hasZeroCancellation) {
    document.getElementById('char-zero-effect').textContent = 'Cancels one pole mode';
  } else {
    document.getElementById('char-zero-effect').textContent = 'Shapes transient response';
  }
}

function updateFormula() {
  const tf = document.getElementById('tf-display');
  tf.textContent = transferFunctionLatex();

  if (window.renderMathInElement) {
    window.renderMathInElement(tf, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  }

  document.getElementById('config-explanation').textContent = state.explanation;
}

function updateBadge(c) {
  const el = document.getElementById('system-type');
  let text;
  let cls;

  if (c.invalid) {
    text = 'Incomplete system';
    cls = 'badge-slow';
  } else if (c.unstable) {
    text = 'Unstable divergent response';
    cls = 'badge-unstable';
  } else if (c.oscillatory && Math.abs(c.dominantReal) < 0.35) {
    text = 'Stable slow oscillatory response';
    cls = 'badge-slow';
  } else if (c.oscillatory) {
    text = 'Stable oscillatory response';
    cls = 'badge-oscillatory';
  } else {
    text = 'Stable non-oscillatory response';
    cls = 'badge-stable';
  }

  el.textContent = text;
  el.className = `badge ${cls}`;
}

function updateFactorLabels() {
  document.getElementById('real-pole-a-factor').textContent = `\\(${factorForRealRoot(state.realPoleA.value)}\\)`;
  document.getElementById('real-pole-b-factor').textContent = `\\(${factorForRealRoot(state.realPoleB.value)}\\)`;
  document.getElementById('complex-pair-factor').textContent = `\\(${complexPairFactor(state.complexPair.real, state.complexPair.imag)}\\)`;
  document.getElementById('real-zero-a-factor').textContent = `\\(${factorForRealRoot(state.realZeroA.value)}\\)`;
  document.getElementById('real-zero-b-factor').textContent = `\\(${factorForRealRoot(state.realZeroB.value)}\\)`;

  ['real-pole-a-factor', 'real-pole-b-factor', 'complex-pair-factor', 'real-zero-a-factor', 'real-zero-b-factor'].forEach(id => {
    const el = document.getElementById(id);
    if (window.renderMathInElement) {
      window.renderMathInElement(el, {
        delimiters: [{ left: '\\(', right: '\\)', display: false }],
        throwOnError: false,
      });
    }
  });
}

function updateComponentStates() {
  setBlockState('real-pole-a', state.realPoleA.enabled);
  setBlockState('real-pole-b', state.realPoleB.enabled);
  setBlockState('complex-pair', state.complexPair.enabled);
  setBlockState('real-zero-a', state.realZeroA.enabled);
  setBlockState('real-zero-b', state.realZeroB.enabled);
}

function setBlockState(prefix, enabled) {
  document.getElementById(`${prefix}-block`).classList.toggle('disabled', !enabled);
  document.querySelectorAll(`#${prefix}-block input[type="range"], #${prefix}-block input[type="number"]`).forEach(input => {
    input.disabled = !enabled;
  });
}

// ─── Input sync ───────────────────────────────────────────────────────────────

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

function setSyncedValue(name, value) {
  document.getElementById(`${name}-slider`).value = value;
  document.getElementById(`${name}-number`).value = value;
}

function setCheckbox(id, value) {
  document.getElementById(id).checked = value;
}

function syncDomFromState() {
  setSyncedValue('k', state.K);
  setSyncedValue('real-pole-a', state.realPoleA.value);
  setSyncedValue('real-pole-b', state.realPoleB.value);
  setSyncedValue('complex-real', state.complexPair.real);
  setSyncedValue('complex-imag', state.complexPair.imag);
  setSyncedValue('real-zero-a', state.realZeroA.value);
  setSyncedValue('real-zero-b', state.realZeroB.value);

  setCheckbox('real-pole-a-enabled', state.realPoleA.enabled);
  setCheckbox('real-pole-b-enabled', state.realPoleB.enabled);
  setCheckbox('complex-pair-enabled', state.complexPair.enabled);
  setCheckbox('real-zero-a-enabled', state.realZeroA.enabled);
  setCheckbox('real-zero-b-enabled', state.realZeroB.enabled);

  document.getElementById('response-select').value = state.responseType;
  document.getElementById('preset-select').value = currentPreset;
}

function applyPreset(key) {
  if (!PRESETS[key]) return;
  currentPreset = key;
  state = structuredClone(PRESETS[key]);
  syncDomFromState();
  updateChart();
}

function markCustomPreset() {
  currentPreset = 'custom';
  document.getElementById('preset-select').value = 'custom';
}

// ─── Init ────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const response = computeResponse();
  const c = getCharacteristics();

  buildMapChart(c);
  buildResponseChart(response.data, c);
  syncDomFromState();
  updateTable(c);
  updateFormula();
  updateBadge(c);
  updateFactorLabels();
  updateComponentStates();

  document.getElementById('preset-select').addEventListener('change', event => {
    applyPreset(event.target.value);
  });

  document.getElementById('response-select').addEventListener('change', event => {
    state.responseType = event.target.value;
    updateChart();
  });

  document.getElementById('real-pole-a-enabled').addEventListener('change', event => {
    state.realPoleA.enabled = event.target.checked;
    markCustomPreset();
    updateChart();
  });
  document.getElementById('real-pole-b-enabled').addEventListener('change', event => {
    state.realPoleB.enabled = event.target.checked;
    markCustomPreset();
    updateChart();
  });
  document.getElementById('complex-pair-enabled').addEventListener('change', event => {
    state.complexPair.enabled = event.target.checked;
    markCustomPreset();
    updateChart();
  });
  document.getElementById('real-zero-a-enabled').addEventListener('change', event => {
    state.realZeroA.enabled = event.target.checked;
    markCustomPreset();
    updateChart();
  });
  document.getElementById('real-zero-b-enabled').addEventListener('change', event => {
    state.realZeroB.enabled = event.target.checked;
    markCustomPreset();
    updateChart();
  });

  syncInputs('k-slider', 'k-number', val => { state.K = val; updateChart(); });
  syncInputs('real-pole-a-slider', 'real-pole-a-number', val => { state.realPoleA.value = val; markCustomPreset(); updateChart(); });
  syncInputs('real-pole-b-slider', 'real-pole-b-number', val => { state.realPoleB.value = val; markCustomPreset(); updateChart(); });
  syncInputs('complex-real-slider', 'complex-real-number', val => { state.complexPair.real = val; markCustomPreset(); updateChart(); });
  syncInputs('complex-imag-slider', 'complex-imag-number', val => { state.complexPair.imag = val; markCustomPreset(); updateChart(); });
  syncInputs('real-zero-a-slider', 'real-zero-a-number', val => { state.realZeroA.value = val; markCustomPreset(); updateChart(); });
  syncInputs('real-zero-b-slider', 'real-zero-b-number', val => { state.realZeroB.value = val; markCustomPreset(); updateChart(); });
});

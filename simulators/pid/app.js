/**
 * main.js — PID Controller Simulator
 *
 * Controller:  C(s) = Kp + Ki/s + Kd·s
 * Plant:       PT1 with time constant TAU = 1.5 s
 */

'use strict';

// ── DOM helper ─────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);

// ── Canvas ─────────────────────────────────────────────────────────────────────
const canvas = el('plot');
const ctx    = canvas.getContext('2d');

// ── DOM references ─────────────────────────────────────────────────────────────
const pEnCk         = el('pEn');
const iEnCk         = el('iEn');
const dEnCk         = el('dEn');
const dFiltEnCk     = el('dFiltEn');
const pSlider       = el('pGain');
const iSlider       = el('iGain');
const dSlider       = el('dGain');
const dFiltTauSl    = el('dFiltTau');
const pValEl        = el('pVal');
const iValEl        = el('iVal');
const dValEl        = el('dVal');
const dFiltTauValEl = el('dFiltTauVal');
const twSlider      = el('timeWin');
const twValEl       = el('twVal');
const refTypeSel    = el('refType');
const pauseBtn      = el('pauseBtn');
const resetBtn      = el('resetBtn');
const fitBtn        = el('fitBtn');
const fsBtn         = el('fsBtn');

// ── Simulation constants ───────────────────────────────────────────────────────
const DT        = 0.05;  // fixed time step (s)
const PLANT_TAU = 1.5;   // PT1 plant time constant (s)

// ── Simulation state ───────────────────────────────────────────────────────────
let pGain, iGain, dGain, dFilterTau;
let integral, prevError, dFiltered, pv, simTime;
let pvLo = 0, pvHi = 100, data = [], timeWindow, maxPoints;
let running = false;

// ── Reference signal ───────────────────────────────────────────────────────────
function computeReference(t) {
  switch (refTypeSel.value) {
    case 'constant':
      return parseFloat(el('refConst').value);
    case 'sine': {
      const offset = parseFloat(el('sineOffset').value);
      const amp    = parseFloat(el('sineAmp').value);
      const freq   = parseFloat(el('sineFreq').value);
      return offset + amp * Math.sin(2 * Math.PI * freq * t);
    }
    case 'square': {
      const lo     = parseFloat(el('sqLow').value);
      const hi     = parseFloat(el('sqHigh').value);
      const period = parseFloat(el('sqPeriod').value);
      const duty   = parseFloat(el('sqDuty').value) / 100;
      return (t % period) < period * duty ? hi : lo;
    }
    case 'triangle': {
      const lo     = parseFloat(el('triLow').value);
      const hi     = parseFloat(el('triHigh').value);
      const period = parseFloat(el('triPeriod').value);
      const phase  = (t % period) / period;
      return phase < 0.5
        ? lo + (hi - lo) * (phase * 2)
        : hi - (hi - lo) * ((phase - 0.5) * 2);
    }
    default: return 0;
  }
}

// ── UI updates ─────────────────────────────────────────────────────────────────
const REF_PANELS = {
  constant: 'pConstant',
  sine:     'pSine',
  square:   'pSquare',
  triangle: 'pTriangle',
};

function updateRefTypeUI() {
  const type = refTypeSel.value;
  Object.entries(REF_PANELS).forEach(([k, id]) => {
    el(id).style.display = k === type ? 'flex' : 'none';
  });
}

function updatePauseBtn() {
  const label = running ? 'Pause' : data.length === 0 ? 'Start' : 'Resume';
  pauseBtn.textContent = label;
  pauseBtn.classList.toggle('pause', !running && data.length > 0);
}

function setRowEnabled(ck) {
  ck.closest('label').classList.toggle('disabled', !ck.checked);
}

function updateFilterRow() {
  dFiltEnCk.closest('label').classList.toggle('disabled', !dEnCk.checked || !dFiltEnCk.checked);
}

function updateParams() {
  pGain      = parseFloat(pSlider.value);
  iGain      = parseFloat(iSlider.value);
  dGain      = parseFloat(dSlider.value);
  dFilterTau = parseFloat(dFiltTauSl.value);
  pValEl.textContent        = pGain.toFixed(2);
  iValEl.textContent        = iGain.toFixed(2);
  dValEl.textContent        = dGain.toFixed(2);
  dFiltTauValEl.textContent = dFilterTau.toFixed(2) + ' s';
}

function updateTimeWindow() {
  timeWindow = parseInt(twSlider.value, 10);
  maxPoints  = Math.round(timeWindow / DT);
  twValEl.textContent = timeWindow + ' s';
  if (!running) drawPlot();
}

// ── Simulation control ─────────────────────────────────────────────────────────
function resetSim() {
  integral = prevError = dFiltered = pv = simTime = 0;
  data  = [];
  pvLo  = 0;
  pvHi  = 100;
  updatePauseBtn();
  drawPlot();
}

function fitVertical() {
  if (!data.length) return;
  const allVals = data.flatMap(d => [d.pv, d.sp]);
  const maxVal  = Math.max(...allVals);
  const minVal  = Math.min(...allVals);
  pvHi = Math.ceil(maxVal * 1.15) || 10;
  pvLo = minVal >= 0 ? 0 : Math.floor(minVal * 1.15);
}

// ── Simulation step ────────────────────────────────────────────────────────────
// D term differentiates error de/dt directly, which correctly handles
// varying reference signals. An optional first-order LPF (time constant tau)
// suppresses noise and derivative kick on square-wave steps.
function simulateStep() {
  const sp    = computeReference(simTime);
  const error = sp - pv;

  if (iEnCk.checked) integral += error * DT;

  const rawD = (error - prevError) / DT;
  dFiltered  = dFiltEnCk.checked
    ? dFiltered + (rawD - dFiltered) * DT / dFilterTau
    : rawD;

  const u = Math.max(-200, Math.min(200,
    (pEnCk.checked ? pGain * error     : 0) +
    (iEnCk.checked ? iGain * integral  : 0) +
    (dEnCk.checked ? dGain * dFiltered : 0)
  ));

  prevError  = error;
  pv        += (u - pv) * DT / PLANT_TAU;
  simTime   += DT;

  data.push({ pv, sp, err: error });
  if (data.length > maxPoints) data.shift();

  // Auto-expand vertical range at 88% of boundary; add 20% headroom
  const top = Math.max(pv, sp), bot = Math.min(pv, sp);
  if (top > pvHi * 0.88) pvHi = Math.ceil(top  * 1.20);
  if (bot < pvLo * 0.88) pvLo = Math.floor(bot * 1.20);
}

// ── Canvas layout constants ────────────────────────────────────────────────────
const W    = canvas.width;
const H    = canvas.height;
const PAD_L = 52, PAD_R = 18, PAD_T = 20;
const plotW = W - PAD_L - PAD_R;

const MAIN_H      = 200;
const MAIN_Y      = PAD_T;
const ERR_H       = 195;
const ERR_Y       = MAIN_Y + MAIN_H + 40;
const TOP_RESERVE = 28;

// ── Canvas helpers ─────────────────────────────────────────────────────────────
function toMainY(v, lo, hi) {
  return MAIN_Y + MAIN_H - ((v - lo) / (hi - lo)) * (MAIN_H - TOP_RESERVE);
}
function toErrY(v, lo, hi) {
  return ERR_Y + ERR_H - ((v - lo) / (hi - lo)) * (ERR_H - TOP_RESERVE);
}

function drawGrid(x0, y0, w, h, nx, ny) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 0.7;
  ctx.setLineDash([]);
  for (let i = 0; i <= nx; i++) {
    const x = x0 + (i / nx) * w;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke();
  }
  for (let i = 0; i <= ny; i++) {
    const y = y0 + (i / ny) * h;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
  }
  ctx.restore();
}

function drawAxes(x0, y0, w, h) {
  ctx.strokeStyle = '#666';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + h); ctx.lineTo(x0 + w, y0 + h);
  ctx.stroke();
}

function yAxisLabels(lo, hi, steps, toY, topClip) {
  ctx.fillStyle = '#8a8a9a';
  ctx.font      = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= steps; i++) {
    const v  = lo + (i / steps) * (hi - lo);
    const py = toY(v, lo, hi);
    if (py >= topClip) ctx.fillText(v.toFixed(1), PAD_L - 5, py + 4);
  }
}

function polyline(pts, color, lw) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();
}

function plotPoints(vis, accessor, toY, lo, hi) {
  const xScale = plotW / maxPoints;
  return vis.map((d, i) => [PAD_L + i * xScale, toY(accessor(d), lo, hi)]);
}

// ── Draw ───────────────────────────────────────────────────────────────────────
function drawPlot() {
  ctx.clearRect(0, 0, W, H);
  const vis = data.slice(-maxPoints);

  // Error scale (symmetric around zero)
  const eAbs = vis.length ? Math.max(1, ...vis.map(d => Math.abs(d.err))) : 10;
  const eLo  = -eAbs * 1.15;
  const eHi  =  eAbs * 1.15;

  // ── Upper plot: reference & output ─────────────────────────────────────────
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(PAD_L, MAIN_Y, plotW, MAIN_H);
  drawGrid(PAD_L, MAIN_Y, plotW, MAIN_H, 9, 5);
  drawAxes(PAD_L, MAIN_Y, plotW, MAIN_H);

  ctx.save();
  ctx.beginPath(); ctx.rect(PAD_L, MAIN_Y, plotW, MAIN_H); ctx.clip();
  polyline(plotPoints(vis, d => d.sp, toMainY, pvLo, pvHi), '#ff9800', 2);
  polyline(plotPoints(vis, d => d.pv, toMainY, pvLo, pvHi), '#4caf50', 2);
  ctx.restore();

  yAxisLabels(pvLo, pvHi, 5, toMainY, MAIN_Y + TOP_RESERVE + 6);
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#c0c0d0'; ctx.fillText('Reference Input & Plant Output', PAD_L + 8, MAIN_Y + 17);
  ctx.fillStyle = '#ff9800'; ctx.fillText('\u2014 Reference (r)', PAD_L + plotW - 280, MAIN_Y + 17);
  ctx.fillStyle = '#4caf50'; ctx.fillText('\u2014 Output (y)',    PAD_L + plotW - 108, MAIN_Y + 17);

  // ── Separator ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#334'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_L,          MAIN_Y + MAIN_H + 18);
  ctx.lineTo(PAD_L + plotW,  MAIN_Y + MAIN_H + 18);
  ctx.stroke();

  // ── Lower plot: tracking error ─────────────────────────────────────────────
  ctx.fillStyle = '#0f1a2e';
  ctx.fillRect(PAD_L, ERR_Y, plotW, ERR_H);
  drawGrid(PAD_L, ERR_Y, plotW, ERR_H, 9, 4);
  drawAxes(PAD_L, ERR_Y, plotW, ERR_H);

  const zeroY = toErrY(0, eLo, eHi);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(PAD_L, zeroY); ctx.lineTo(PAD_L + plotW, zeroY); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.rect(PAD_L, ERR_Y, plotW, ERR_H); ctx.clip();
  polyline(plotPoints(vis, d => d.err, toErrY, eLo, eHi), '#e91e63', 2);
  ctx.restore();

  yAxisLabels(eLo, eHi, 4, toErrY, ERR_Y + TOP_RESERVE + 6);
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#c0c0d0'; ctx.fillText('Tracking Error  e(t) = r \u2212 y', PAD_L + 8, ERR_Y + 15);
  ctx.fillStyle = '#e91e63'; ctx.fillText('\u2014 e(t)', PAD_L + plotW - 65, ERR_Y + 15);

  ctx.fillStyle = '#8a8a9a';
  ctx.font      = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Time (s)', PAD_L + plotW / 2, ERR_Y + ERR_H + 22);
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function loop() {
  if (!running) return;
  simulateStep();
  drawPlot();
  requestAnimationFrame(loop);
}

// ── Reference slider wiring ────────────────────────────────────────────────────
[
  ['refConst',   'refConstVal',   1, ''   ],
  ['sineOffset', 'sineOffsetVal', 1, ''   ],
  ['sineAmp',    'sineAmpVal',    1, ''   ],
  ['sineFreq',   'sineFreqVal',   2, ' Hz'],
  ['sqLow',      'sqLowVal',      1, ''   ],
  ['sqHigh',     'sqHighVal',     1, ''   ],
  ['sqPeriod',   'sqPeriodVal',   0, ' s' ],
  ['sqDuty',     'sqDutyVal',     0, ' %' ],
  ['triLow',     'triLowVal',     1, ''   ],
  ['triHigh',    'triHighVal',    1, ''   ],
  ['triPeriod',  'triPeriodVal',  0, ' s' ],
].forEach(([slId, valId, dec, suf]) => {
  const sl    = el(slId);
  const valEl = el(valId);
  const update = () => { valEl.textContent = parseFloat(sl.value).toFixed(dec) + suf; };
  sl.addEventListener('input', update);
  update();
});

// ── Event listeners ────────────────────────────────────────────────────────────
[pSlider, iSlider, dSlider, dFiltTauSl].forEach(s => s.addEventListener('input', updateParams));
twSlider.addEventListener('input', updateTimeWindow);
resetBtn.addEventListener('click', resetSim);
fitBtn  .addEventListener('click', fitVertical);
pauseBtn.addEventListener('click', () => {
  running = !running;
  updatePauseBtn();
  if (running) loop();
});
refTypeSel.addEventListener('change', () => { updateRefTypeUI(); resetSim(); });

pEnCk    .addEventListener('change', () => setRowEnabled(pEnCk));
iEnCk    .addEventListener('change', () => { if (!iEnCk.checked) integral = 0; setRowEnabled(iEnCk); });
dEnCk    .addEventListener('change', () => { setRowEnabled(dEnCk); updateFilterRow(); });
dFiltEnCk.addEventListener('change', () => updateFilterRow());

// ── Fullscreen ─────────────────────────────────────────────────────────────────
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

// ── Init ───────────────────────────────────────────────────────────────────────
updateParams();
updateTimeWindow();
updateRefTypeUI();
[pEnCk, iEnCk, dEnCk].forEach(setRowEnabled);
updateFilterRow();
resetSim();

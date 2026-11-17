// ============================================================================
// SEZIONE 02 · SPECTRUM — Spettro Reale dell'Idrogeno (Serie di Balmer & ASMR)
// ============================================================================
"use strict";

function updateSpectrumHudTargets(forceSnap = false) {
  if (activeLab !== 'SPECTRUM') return;
  const bands = labState.specBands;
  const bIdx = labState.activeBandIdx;
  const activeBand = bIdx >= 0 && bands[bIdx] && bands[bIdx].activity > 0.25 ? bands[bIdx] : null;
  const evNow = (11.8 + labState.specEnergy * 1.8).toFixed(1);
  const key = activeBand ? `${activeBand.nm}NM · ${activeBand.eV}` : `${evNow}EV · BALMER`;

  const nowMs = labState.elapsed;
  if (!forceSnap && (key === labState.hudTextKey || nowMs - labState.hudLastSwitchMs < 120)) {
    return;
  }
  labState.hudTextKey = key;
  labState.hudLastSwitchMs = nowMs;

  if (activeBand) {
    labState.targetHudR = activeBand.r;
    labState.targetHudG = activeBand.g;
    labState.targetHudB = activeBand.b;
  } else {
    labState.targetHudR = 26;
    labState.targetHudG = 26;
    labState.targetHudB = 26;
  }

  const topY = labState.backBtn.y || 44;
  const targets = collectMatrixTargets(key, viewW * 0.5, topY, 2.25);
  morphMatrixHudDots(labState.hudDots, targets, topY, forceSnap);
}

function buildSpectrumUi(y1, spanW, esX0, esX1, esY, esW) {
  const labelPts = [];
  for (let b = 0; b < labState.specBands.length; b++) {
    const band = labState.specBands[b];
    const labelY = y1 + 24 + (b === 1 && spanW < 420 ? 15 : 0);
    const tPts = collectMatrixTargets(band.label, band.x, labelY, 1.85);
    for (let i = 0; i < tPts.length; i++) {
      labelPts.push({
        hx: tPts[i].x,
        hy: tPts[i].y,
        x: tPts[i].x,
        y: tPts[i].y,
        vx: 0,
        vy: 0,
        bandIdx: b,
        colorWarmup: 0,
        jitter: 0.06,
        springK: 0.16,
      });
    }
  }
  labState.hudLabels = labelPts;

  // Slider inferiore di energia quantica di eccitazione (rosso H-alpha a sinistra -> pieno spettro viola a destra)
  const eDots = [];
  const eRows = [-2.2, 0, 2.2];
  const eStepX = 3.2;
  const stops = [
    [226, 38, 46],   // 656 Red
    [12, 180, 224],  // 486 Cyan
    [42, 102, 242],  // 434 Blue
    [118, 56, 230],  // 410 Violet
  ];
  for (let rIdx = 0; rIdx < eRows.length; rIdx++) {
    const stagger = rIdx === 1 ? eStepX * 0.5 : 0;
    for (let x = esX0 + stagger; x <= esX1; x += eStepX) {
      const u = clamp((x - esX0) / Math.max(1, esW), 0, 1);
      const scaled = u * (stops.length - 1);
      const i0 = Math.min(stops.length - 2, Math.floor(scaled));
      const frac = scaled - i0;
      const cr = Math.round(stops[i0][0] + (stops[i0 + 1][0] - stops[i0][0]) * frac);
      const cg = Math.round(stops[i0][1] + (stops[i0 + 1][1] - stops[i0][1]) * frac);
      const cb = Math.round(stops[i0][2] + (stops[i0 + 1][2] - stops[i0][2]) * frac);
      const isFringe = Math.random() < 0.14;
      const yOff = isFringe ? (Math.random() < 0.5 ? -1 : 1) * (3.6 + Math.random() * 2.5) : eRows[rIdx];
      eDots.push(
        makeSoftDot(x + (Math.random() - 0.5) * 1.0, esY + yOff, isFringe ? 0.98 : 1.14, {
          cr,
          cg,
          cb,
          colorWarmup: 0,
          fringe: isFringe,
          springK: isFringe ? 0.045 + Math.random() * 0.035 : 0.13 + Math.random() * 0.07,
          jitter: isFringe ? 0.22 : 0.085,
        })
      );
    }
  }
  const kVisX = esX0 + labState.specEnergy * esW;
  const eKnob = buildKnobDots(1, true);
  for (let i = 0; i < eKnob.length; i++) {
    eKnob[i].x = kVisX + eKnob[i].relX;
    eKnob[i].y = esY + eKnob[i].relY;
    eKnob[i].colorWarmup = 0;
  }
  labState.energySlider = {
    x0: esX0,
    x1: esX1,
    y: esY,
    knobVisX: kVisX,
    dots: eDots,
    knobDots: eKnob,
  };

  labState.hudDots = [];
  updateSpectrumHudTargets(true);
}

function initSpectrumParticles(total) {
  const weightSum = labState.specBands.reduce((acc, b) => acc + b.weight, 0);
  const quotas = [];
  let sumQ = 0;
  for (let b = 0; b < labState.specBands.length; b++) {
    const q = Math.round((labState.specBands[b].weight / weightSum) * total);
    quotas.push(q);
    sumQ += q;
  }
  quotas[quotas.length - 1] += total - sumQ;

  const idxOrder = new Array(total);
  for (let i = 0; i < total; i++) {
    idxOrder[i] = { i, key: particles[i].x + (Math.random() - 0.5) * 90 };
  }
  idxOrder.sort((a, b) => a.key - b.key);

  let cursor = 0;
  for (let b = 0; b < labState.specBands.length; b++) {
    const band = labState.specBands[b];
    const q = quotas[b];
    for (let k = 0; k < q && cursor < total; k++) {
      const p = particles[idxOrder[cursor++].i];
      const u = clamp((k + 0.15 + Math.random() * 0.7) / Math.max(1, q), 0.01, 0.99);
      const wOff = (Math.random() - 0.5) * 0.9;
      p.specBand = b;
      p.specU = u;
      p.specWOff = wOff;
      p.anchorX = band.x + wOff * band.w;
      p.anchorY = band.y0 + u * (band.y1 - band.y0);
      p.specPhase = u * Math.PI;
      p.photonGlow = 0;
      p.z = (Math.random() - 0.5) * 10;
      p.vz = 0;
      p.colorWarmup = 0;
    }
  }
}

function triggerBandPluck(bIdx, strikeU, power, emitPhotons = true) {
  const band = labState.specBands[bIdx];
  if (!band || band.activity < 0.25) return;
  const nowMs = performance.now();
  const pwr = clamp(power, 0.3, 1.15);
  band.strikeU = clamp(strikeU, 0.06, 0.94);
  band.strikeSign = pointer.vx >= 0 ? 1 : -1;
  band.excite = Math.min(1, Math.max(band.excite, 0.38) + pwr * 0.48);

  if (nowMs - band.lastPluckMs > 145) {
    band.lastPluckMs = nowMs;
    playSpectrumString(band.freq, band.x, band.strikeU, pwr);
    labState.activeBandIdx = bIdx;
    updateSpectrumHudTargets(false);
  }

  if (emitPhotons) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.specBand !== bIdx) continue;
      const du = Math.abs((p.specU ?? 0.5) - band.strikeU);
      if (du < 0.22) {
        const proximity = 1 - du / 0.22;
        const burst = (1.6 + pwr * 3.8) * proximity;
        p.vx += ((Math.random() - 0.5) * 1.8 + band.strikeSign * 0.7) * burst;
        p.vy += (Math.random() - 0.5) * burst * 0.75;
        p.photonGlow = Math.max(p.photonGlow || 0, proximity * clamp(0.6 + pwr * 0.4, 0, 1));
      }
    }
  }
}

function updateSpectrumSimulation(dt, total) {
    const bands = labState.specBands;
    const damp = Math.pow(0.87, dt);
    const es = labState.energySlider;

    // Slider quantico inferiore + telemetria superiore + etichette nm
    const eGoalX = es.x0 + labState.specEnergy * (es.x1 - es.x0);
    es.knobVisX += (eGoalX - es.knobVisX) * 0.34 * dt;
    stepTrackDots(es.dots, es.knobVisX, es.y, dt);
    stepKnobDots(es.knobDots, es.knobVisX, es.y, labState.draggingEnergySlider || pointer.hoverGroup === 24, dt);
    for (let i = 0; i < labState.hudLabels.length; i++) {
      const d = labState.hudLabels[i];
      stepSoftParticleToTarget(d, d.hx, d.hy, d.jitter || 0.06, dt);
    }

    labState.hudColorR += (labState.targetHudR - labState.hudColorR) * 0.14 * dt;
    labState.hudColorG += (labState.targetHudG - labState.hudColorG) * 0.14 * dt;
    labState.hudColorB += (labState.targetHudB - labState.hudColorB) * 0.14 * dt;
    labState.hudDots = stepMorphHudArray(labState.hudDots, dt);
    labState.hudTick++;
    if (labState.hudTick % 10 === 0) updateSpectrumHudTargets(false);

    // Onda di risonanza radiale generata dal click sullo sfondo
    const sw = labState.specWave;
    if (sw.active) {
      sw.radius += 14 * dt;
      for (let b = 0; b < bands.length; b++) {
        const bit = 1 << b;
        if ((sw.hitMask & bit) === 0 && bands[b].activity > 0.25) {
          const dToBand = Math.abs(bands[b].x - sw.x);
          if (dToBand <= sw.radius) {
            sw.hitMask |= bit;
            const hitU = clamp((sw.y - bands[b].y0) / Math.max(1, bands[b].y1 - bands[b].y0), 0.12, 0.88);
            triggerBandPluck(b, hitU, 0.72, true);
          }
        }
      }
      if (sw.radius > sw.maxRadius) sw.active = false;
    }

    let curHoverBand = -1;
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      const prevAct = band.activity;
      const targetAct =
        labState.specEnergy >= band.threshold
          ? 1.0
          : clamp(1 - (band.threshold - labState.specEnergy) / 0.14, 0.06, 1.0);
      band.activity += (targetAct - band.activity) * 0.1 * dt;

      // Sottile suono armonico quando una riga quantica supera la soglia energetica dallo slider
      if (prevAct < 0.45 && band.activity >= 0.45 && labState.draggingEnergySlider) {
        triggerBandPluck(b, 0.5, 0.45, false);
      }

      if (
        band.activity > 0.25 &&
        pointer.active &&
        !labState.draggingEnergySlider &&
        pointer.y >= band.y0 - 20 &&
        pointer.y <= band.y1 + 20
      ) {
        const distX = Math.abs(pointer.x - band.x);
        if (distX <= band.w * 2.0) {
          curHoverBand = b;
          const strikeU = clamp((pointer.y - band.y0) / Math.max(1, band.y1 - band.y0), 0.06, 0.94);
          const ptrSpeed = Math.hypot(pointer.vx, pointer.vy);
          if (labState.hoverBandIdx !== b || ptrSpeed > 2.2) {
            const pwr = (1 - distX / (band.w * 2.1)) * clamp(ptrSpeed * 0.075 + 0.42, 0.42, 1.15);
            triggerBandPluck(b, strikeU, pwr, true);
          } else if (pointer.down) {
            // Tocco prolungato tenendo premuto: sostiene dolcemente la risonanza della corda
            band.strikeU = strikeU;
            band.excite = Math.min(1, Math.max(band.excite, 0.52) + 0.06 * dt);
            if (performance.now() - band.lastPluckMs > 420) {
              band.lastPluckMs = performance.now();
              playSpectrumString(band.freq, band.x, strikeU, 0.46);
            }
          }
        }
      }
      band.excite *= Math.pow(0.958, dt);
    }
    labState.hoverBandIdx = curHoverBand;

    // Fisica armonica 3-modi (fondamentale + 2° + 3° armonica centrata sul punto di pizzico)
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const bIdx = p.specBand || 0;
      const band = bands[bIdx];
      if (p.colorWarmup < 1) p.colorWarmup = Math.min(1, p.colorWarmup + 0.022 * dt);
      if (p.photonGlow > 0) p.photonGlow = Math.max(0, p.photonGlow - 0.028 * dt);

      const su = p.specU ?? 0.5;
      const du = su - (band.strikeU ?? 0.5);
      const focus = 0.65 + 0.55 * Math.exp(-du * du * 10);
      const mode1 = Math.sin(labState.elapsed * 0.036 + bIdx * 1.1) * Math.sin(su * Math.PI);
      const mode2 = 0.42 * Math.sin(labState.elapsed * 0.072 + bIdx * 2.1) * Math.sin(su * Math.PI * 2);
      const mode3 = 0.22 * Math.sin(labState.elapsed * 0.11 + bIdx * 0.7) * Math.sin(su * Math.PI * 3);
      const oscX = band.excite * (20 * mode1 + 12 * mode2 + 7 * mode3) * focus;

      // Se la riga è sotto la soglia quantica si espande dolcemente in polvere tenue anziché sparire
      const spreadFactor = 1 + (1 - band.activity) * 2.2;
      const tx = band.x + (p.specWOff ?? 0) * band.w * spreadFactor + oscX;
      const ty = band.y0 + su * (band.y1 - band.y0);
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 28) {
        const travel = clamp(dist * 0.052, 1.5, 6.4);
        p.vx += ((dx / dist) * travel - p.vx) * 0.14 * dt;
        p.vy += ((dy / dist) * travel - p.vy) * 0.14 * dt;
      } else {
        const jit = 0.12 + band.excite * 0.45 + (1 - band.activity) * 0.35;
        p.vx = (p.vx + dx * 0.14 * dt + (Math.random() - 0.5) * jit) * damp;
        p.vy = (p.vy + dy * 0.14 * dt + (Math.random() - 0.5) * 0.12) * damp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
}

function renderSpectrumFrame(total) {
    const bands = labState.specBands;

    // Etichette lunghezza d'onda sotto ciascuna banda (sfumano dolcemente se sotto soglia)
    for (let i = 0; i < labState.hudLabels.length; i++) {
      const d = labState.hudLabels[i];
      const band = bands[d.bandIdx];
      const act = band ? band.activity : 1;
      const warm = d.colorWarmup ?? 1;
      const tintMix = clamp(warm * (0.18 + 0.82 * act), 0, 1);
      const rr = Math.round(45 + (band.r - 45) * tintMix);
      const gg = Math.round(45 + (band.g - 45) * tintMix);
      const bb = Math.round(45 + (band.b - 45) * tintMix);
      ctx.globalAlpha = 0.25 + 0.65 * act;
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 0.98, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4 righe spettrali reali dell'Idrogeno (Serie di Balmer) con alone fotonico su eccitazione
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const band = bands[p.specBand || 0];
      const act = band.activity ?? 1;
      const glow = p.photonGlow || 0;
      const blend = clamp((p.colorWarmup ?? 1) * (0.12 + 0.88 * act), 0, 1);
      const lumBoost = clamp(band.excite * 0.28 + glow * 0.55, 0, 0.72);
      const rr = Math.round((24 + (band.r - 24) * blend) * (1 - lumBoost) + 255 * lumBoost * 0.42);
      const gg = Math.round((24 + (band.g - 24) * blend) * (1 - lumBoost) + 255 * lumBoost * 0.42);
      const bb = Math.round((24 + (band.b - 24) * blend) * (1 - lumBoost) + 255 * lumBoost * 0.42);
      const r = 1.42 * p.sizeFactor * (0.86 + 0.18 * act + band.excite * 0.36 + glow * 0.45);

      if (act > 0.3 && (band.excite > 0.14 || glow > 0.12)) {
        ctx.globalAlpha = clamp((band.excite * 0.18 + glow * 0.28) * act, 0, 0.34);
        ctx.fillStyle = `rgb(${band.r},${band.g},${band.b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 0.28 + 0.64 * act + glow * 0.1;
      ctx.fillStyle = `rgb(${clamp(rr, 0, 255)},${clamp(gg, 0, 255)},${clamp(bb, 0, 255)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slider quantico inferiore (particelle morbide con gradiente visibile rosso <-> viola)
    const es = labState.energySlider;
    for (let i = 0; i < es.dots.length; i++) {
      const d = es.dots[i];
      const w = clamp(d.colorWarmup ?? 1, 0, 1);
      const rr = Math.round(28 + (d.cr - 28) * w);
      const gg = Math.round(28 + (d.cg - 28) * w);
      const bb = Math.round(28 + (d.cb - 28) * w);
      ctx.globalAlpha = d.fringe ? 0.62 : 0.9;
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    const kScale = clamp(labState.specEnergy, 0, 1);
    const kr = Math.round(226 + (118 - 226) * kScale);
    const kg = Math.round(38 + (56 - 38) * kScale);
    const kb = Math.round(46 + (230 - 46) * kScale);
    for (let i = 0; i < es.knobDots.length; i++) {
      const d = es.knobDots[i];
      const w = clamp(d.colorWarmup ?? 1, 0, 1);
      ctx.globalAlpha = d.fringe ? 0.64 : 0.94;
      ctx.fillStyle = `rgb(${Math.round(24 + (kr - 24) * w)},${Math.round(24 + (kg - 24) * w)},${Math.round(24 + (kb - 24) * w)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
}

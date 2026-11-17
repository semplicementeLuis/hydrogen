// ============================================================================
// HYDROGEN — Main Loop, Router Laboratori, Eventi Input e Pannello Parametri
// ============================================================================
"use strict";

function syncLabBounds(rebuildDots = true) {
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const minDim = Math.min(viewW, viewH);
  const spanW = clamp(viewW * 0.68, 260, 740);
  const startX = cx - spanW * 0.5;
  const barH = clamp(viewH * 0.44, 190, 390);
  const y0 = cy - barH * 0.5 - 8;
  const y1 = y0 + barH;

  labState.specBands = BALMER_LINES.map((b, idx) => {
    const prev = labState.specBands[idx];
    return {
      x: startX + b.u * spanW,
      y0,
      y1,
      w: clamp(viewW * 0.014, 10, 16) * (0.82 + b.weight * 0.24),
      nm: b.nm,
      eV: b.eV,
      shell: b.shell,
      label: b.label,
      weight: b.weight,
      threshold: b.threshold,
      freq: b.freq,
      r: b.r,
      g: b.g,
      b: b.b,
      rgb: b.rgb,
      excite: prev ? prev.excite : 0,
      activity: prev ? prev.activity : 1,
      strikeU: prev ? prev.strikeU : 0.5,
      strikeSign: prev ? prev.strikeSign : 1,
      lastPluckMs: prev ? prev.lastPluckMs : 0,
    };
  });

  labState.horizonR = clamp(minDim * 0.052, 22, 36);

  const padX = clamp(viewW * 0.055, 28, 70);
  const padY = clamp(viewH * 0.075, 30, 56);
  const esW = clamp(viewW * 0.28, 168, 256);
  const esX0 = Math.round(cx - esW * 0.5);
  const esX1 = esX0 + esW;
  const esY = Math.round(Math.max(y1 + 64, viewH - padY - 12));

  if (rebuildDots || labState.backBtn.dots.length === 0) {
    const corners = buildCornerControlDots();
    labState.backBtn = corners.backBtn;
    labState.seedBtn = corners.seedBtn;

    if (activeLab === "SPECTRUM") {
      buildSpectrumUi(y1, spanW, esX0, esX1, esY, esW);
    } else {
      labState.hudLabels = [];
      labState.energySlider.dots = [];
      labState.energySlider.knobDots = [];
      const label = activeLab === "POLARITY" ? "POLARITY" : "HORIZON";
      const tPts = collectMatrixTargets(label, cx, corners.topY, 2.25);
      labState.hudDots = tPts.map((pt) => ({
        hx: pt.x,
        hy: pt.y,
        tx: pt.x,
        ty: pt.y,
        x: pt.x,
        y: pt.y,
        vx: 0,
        vy: 0,
        scale: 1,
        rgb: "#222222",
      }));
    }
  } else {
    labState.backBtn.x = padX + 20;
    labState.backBtn.y = padY + 14;
    labState.seedBtn.x = viewW - padX - 20;
    labState.seedBtn.y = padY + 14;
    if (activeLab === "SPECTRUM") {
      labState.energySlider.x0 = esX0;
      labState.energySlider.x1 = esX1;
      labState.energySlider.y = esY;
      updateSpectrumHudTargets(false);
    }
  }
}

function enterPhysicsLab(tab, originX, originY) {
  if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
  pageView = "LAB";
  activeLab = tab;
  activePageTab = tab;
  blackHole.active = false;
  blackHole.charge = 0;
  pulseWave.active = false;
  slashTrails.length = 0;
  labState.elapsed = 0;
  labState.polarityMode = 1;
  labState.specEnergy = 1.0;
  labState.draggingEnergySlider = false;
  labState.activeBandIdx = -1;
  labState.hoverBandIdx = -1;
  labState.hudTextKey = "";
  labState.hudLastSwitchMs = 0;
  labState.hudTick = 0;
  labState.hudColorR = 26;
  labState.hudColorG = 26;
  labState.hudColorB = 26;
  labState.targetHudR = 26;
  labState.targetHudG = 26;
  labState.targetHudB = 26;
  labState.specWave.active = false;
  syncLabBounds(true);

  const takeForUi = (arr, isKnob = false, knobX = 0, knobY = 0) => {
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i];
      const src = particles.length > 900 ? particles.pop() : particles[Math.floor(Math.random() * particles.length)];
      const tx = isKnob ? knobX + d.relX : d.tx ?? d.hx;
      const ty = isKnob ? knobY + d.relY : d.ty ?? d.hy;
      if (src) {
        d.x = src.x;
        d.y = src.y;
        const ang = Math.atan2(ty - src.y, tx - src.x) + (Math.random() - 0.5) * 0.4;
        const spd = clamp(Math.hypot(tx - src.x, ty - src.y) * 0.018, 1.3, 4.0);
        d.vx = Math.cos(ang) * spd;
        d.vy = Math.sin(ang) * spd;
      }
      d.colorWarmup = 0;
    }
  };
  takeForUi(labState.backBtn.dots);
  takeForUi(labState.seedBtn.dots);
  takeForUi(labState.hudDots);
  takeForUi(labState.hudLabels);
  takeForUi(labState.energySlider.dots);
  takeForUi(
    labState.energySlider.knobDots,
    true,
    labState.energySlider.knobVisX,
    labState.energySlider.y
  );

  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const minDim = Math.min(viewW, viewH);
  const total = particles.length;

  if (tab === "SPECTRUM") {
    initSpectrumParticles(total);
  } else if (tab === "POLARITY") {
    initPolarityParticles(total, cx, cy);
  } else if (tab === "HORIZON") {
    initHorizonParticles(total, cx, cy, minDim);
  }

  interactiveButtons = [];
  playPulseSweep(originX || cx);
  syncHitboxes();
}

function exitPhysicsLab(originX, originY) {
  if (pageView !== 'LAB') return;
  stopGrowDrone();
  updateBlackHoleAudio(0, viewW * 0.5, viewH * 0.5);

  const reclaim = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i];
      const p = createParticle(d.x, d.y);
      p.vx = (d.vx || 0) + (Math.random() - 0.5) * 2.5;
      p.vy = (d.vy || 0) + (Math.random() - 0.5) * 2.5;
      p.splitScale = 0.9;
      particles.push(p);
    }
    arr.length = 0;
  };
  reclaim(labState.backBtn.dots);
  reclaim(labState.seedBtn.dots);
  reclaim(labState.hudDots);
  reclaim(labState.hudLabels);
  reclaim(labState.energySlider.dots);
  reclaim(labState.energySlider.knobDots);
  labState.specWave.active = false;
  labState.draggingEnergySlider = false;

  for (let i = 0; i < particles.length; i++) {
    particles[i].vx += (Math.random() - 0.5) * 2.4;
    particles[i].vy += (Math.random() - 0.5) * 2.4;
  }

  const backTab = activeLab || 'THERMO';
  activeLab = null;
  triggerShockwaveTransition(originX || viewW * 0.5, originY || viewH * 0.5, 'PAGE', backTab);
}

function updateLabSimulation(dt, dtMs) {
  labState.elapsed += dtMs;
  const total = particles.length;
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;

  stepCornerDots(labState.backBtn, pointer.hoverGroup === 20, dt);
  stepCornerDots(labState.seedBtn, pointer.hoverGroup === 21, dt);

  if (activeLab === "SPECTRUM") {
    updateSpectrumSimulation(dt, total);
  } else if (activeLab === "POLARITY") {
    updatePolaritySimulation(dt, total, cx, cy);
  } else if (activeLab === "HORIZON") {
    updateHorizonSimulation(dt, total, cx, cy);
  }
}

function renderLabFrame() {
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const total = particles.length;

  const drawCorner = (btn, hovered) => {
    ctx.fillStyle = hovered ? "#000000" : "#262626";
    for (let i = 0; i < btn.dots.length; i++) {
      const d = btn.dots[i];
      ctx.globalAlpha = d.fringe ? 0.62 : 0.9;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (hovered ? 1.12 : 1.0), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawCorner(labState.backBtn, pointer.hoverGroup === 20);
  drawCorner(labState.seedBtn, pointer.hoverGroup === 21);

  const hWarm = activeLab === "SPECTRUM" ? 1 : 0;
  for (let i = 0; i < labState.hudDots.length; i++) {
    const d = labState.hudDots[i];
    if (d.mergedDead) continue;
    ctx.globalAlpha = d.isDot ? 0.62 : 0.92;
    if (activeLab === "SPECTRUM") {
      const w = clamp(d.colorWarmup ?? hWarm, 0, 1);
      const rr = Math.round(24 + (labState.hudColorR - 24) * w);
      const gg = Math.round(24 + (labState.hudColorG - 24) * w);
      const bb = Math.round(24 + (labState.hudColorB - 24) * w);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.04 * (d.scale || 1), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#222222";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.02, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (activeLab === "SPECTRUM") {
    renderSpectrumFrame(total);
  } else if (activeLab === "POLARITY") {
    renderPolarityFrame(total);
  } else if (activeLab === "HORIZON") {
    renderHorizonFrame(total, cx, cy);
  }
  ctx.globalAlpha = 1;
}

function updatePointerHover(clientX, clientY) {
  const { cx, cy, seedIdleRadius } = layoutBounds;

  if (simState === STATE.IDLE_SEED) {
    const distSeed = Math.hypot(clientX - cx, clientY - cy);
    pointer.hoverGroup = distSeed <= Math.max(seedIdleRadius * 2.2, 34) ? 99 : 0;
    canvas.style.cursor = pointer.hoverGroup === 99 ? 'pointer' : 'default';
    return;
  }

  if (pageView === 'LAB') {
    if (labState.draggingEnergySlider) {
      pointer.hoverGroup = 24;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (Math.hypot(clientX - labState.backBtn.x, clientY - labState.backBtn.y) <= labState.backBtn.r) {
      pointer.hoverGroup = 20;
      canvas.style.cursor = 'pointer';
      return;
    }
    if (Math.hypot(clientX - labState.seedBtn.x, clientY - labState.seedBtn.y) <= labState.seedBtn.r) {
      pointer.hoverGroup = 21;
      canvas.style.cursor = 'pointer';
      return;
    }
    if (activeLab === 'SPECTRUM') {
      const es = labState.energySlider;
      if (clientX >= es.x0 - 16 && clientX <= es.x1 + 16 && Math.abs(clientY - es.y) <= 20) {
        pointer.hoverGroup = 24;
        canvas.style.cursor = 'pointer';
        return;
      }
      pointer.hoverGroup = 0;
      const onBand = labState.specBands.some(
        (b) => b.activity > 0.25 && clientY >= b.y0 - 20 && clientY <= b.y1 + 20 && Math.abs(clientX - b.x) <= b.w * 2.1
      );
      canvas.style.cursor = onBand ? 'pointer' : 'default';
      return;
    }
    pointer.hoverGroup = 0;
    canvas.style.cursor = activeLab === 'POLARITY' ? 'pointer' : 'default';
    return;
  }

  if (pageView === 'THERMO') {
    if (thermo.draggingTempSlider || thermo.draggingCompSlider) {
      pointer.hoverGroup = thermo.draggingTempSlider ? 22 : 23;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (Math.hypot(clientX - thermo.backBtn.x, clientY - thermo.backBtn.y) <= thermo.backBtn.r) {
      pointer.hoverGroup = 20;
      canvas.style.cursor = 'pointer';
      return;
    }
    if (Math.hypot(clientX - thermo.seedBtn.x, clientY - thermo.seedBtn.y) <= thermo.seedBtn.r) {
      pointer.hoverGroup = 21;
      canvas.style.cursor = 'pointer';
      return;
    }
    const ts = thermo.tempSlider;
    if (clientX >= ts.x0 - 16 && clientX <= ts.x1 + 16 && Math.abs(clientY - ts.y) <= 20) {
      pointer.hoverGroup = 22;
      canvas.style.cursor = 'pointer';
      return;
    }
    const cs = thermo.compSlider;
    if (clientX >= cs.x0 - 16 && clientX <= cs.x1 + 16 && Math.abs(clientY - cs.y) <= 20) {
      pointer.hoverGroup = 23;
      canvas.style.cursor = 'pointer';
      return;
    }
    pointer.hoverGroup = 0;
    canvas.style.cursor = 'default';
    return;
  }

  if (simState === STATE.SETTLED || simState === STATE.EXPLODING) {
    for (let i = 0; i < interactiveButtons.length; i++) {
      const b = interactiveButtons[i];
      if (Math.hypot(clientX - b.x, clientY - b.y) <= b.r) {
        pointer.hoverGroup = b.groupId;
        canvas.style.cursor = 'pointer';
        return;
      }
    }
  }

  pointer.hoverGroup = 0;
  canvas.style.cursor = pointer.down ? 'grabbing' : 'default';
}

function loop(timestamp) {
  if (isPaused) {
    rafId = null;
    return;
  }

  if (!lastTimestamp) lastTimestamp = timestamp;
  const dtMs = Math.min(50, Math.max(1, timestamp - lastTimestamp));
  lastTimestamp = timestamp;

  updateSimulation(dtMs);
  renderFrame();

  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (isPaused || rafId !== null) return;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function setPaused(paused) {
  isPaused = paused;
  if (paused) {
    stopLoop();
  } else {
    startLoop();
  }
}

document.addEventListener('visibilitychange', () => {
  setPaused(document.hidden);
});

if ('contentVisibility' in document.documentElement.style) {
  stageWrap.addEventListener('contentvisibilityautostatechange', (event) => {
    setPaused(event.skipped || document.hidden);
  });
} else if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      setPaused(!entry.isIntersecting || document.hidden);
    }
  });
  observer.observe(stageWrap);
}

// Eventi puntatore sulla scena
window.addEventListener('pointermove', (e) => {
  const prevX = pointer.x;
  const prevY = pointer.y;
  const dx = pointer.active ? e.clientX - prevX : 0;
  const dy = pointer.active ? e.clientY - prevY : 0;
  const moveDist = Math.hypot(dx, dy);

  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.vx = clamp(dx, -40, 40);
  pointer.vy = clamp(dy, -40, 40);
  pointer.active = true;

  if (pageView === 'LAB') {
    if (activeLab === 'SPECTRUM' && labState.draggingEnergySlider) {
      const es = labState.energySlider;
      labState.specEnergy = clamp((e.clientX - es.x0) / Math.max(1, es.x1 - es.x0), 0, 1);
      updateSpectrumHudTargets(false);
    }
    updatePointerHover(e.clientX, e.clientY);
    return;
  }

  if (pageView === 'THERMO') {
    if (thermo.draggingTempSlider) {
      const ts = thermo.tempSlider;
      thermo.targetTemp = clamp((e.clientX - ts.x0) / Math.max(1, ts.x1 - ts.x0), 0, 1);
      updateThermoHud();
    } else if (thermo.draggingCompSlider) {
      const cs = thermo.compSlider;
      const prevY = thermo.pistonY;
      thermo.compression = clamp((e.clientX - cs.x0) / Math.max(1, cs.x1 - cs.x0), 0, 1);
      const nextY = thermo.minTop + (thermo.maxTop - thermo.minTop) * thermo.compression;
      thermo.pistonY = nextY;
      thermo.pistonVy = clamp(nextY - prevY, -24, 24);
      updateThermoHud();
    }
    updatePointerHover(e.clientX, e.clientY);
    return;
  }

  if (blackHole.active) {
    blackHole.x = e.clientX;
    blackHole.y = e.clientY;
  } else if (
    moveDist > 12 &&
    (simState === STATE.SETTLED || simState === STATE.EXPLODING)
  ) {
    slashTrails.push({
      x1: prevX,
      y1: prevY,
      x2: e.clientX,
      y2: e.clientY,
      lenSq: Math.max(1, dx * dx + dy * dy),
      tx: dx / moveDist,
      ty: dy / moveDist,
      nx: -dy / moveDist,
      ny: dx / moveDist,
      power: clamp(moveDist / 22, 0.7, 2.4),
      age: 0,
      maxAge: 180,
    });
    if (slashTrails.length > 8) slashTrails.shift();
    playSlashWind(clamp(moveDist / 22, 0.7, 2.4), prevX, prevY, e.clientX, e.clientY);
  }

  updatePointerHover(e.clientX, e.clientY);
});

window.addEventListener('pointerdown', (e) => {
  if (tuningPanel.contains(e.target)) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  ensureAudio();

  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  pointer.down = true;
  pointer.downTime = performance.now();
  pointer.downX = e.clientX;
  pointer.downY = e.clientY;

  if (pageView === 'LAB') {
    if (activeLab === 'SPECTRUM') {
      const es = labState.energySlider;
      if (e.clientX >= es.x0 - 16 && e.clientX <= es.x1 + 16 && Math.abs(e.clientY - es.y) <= 22) {
        labState.draggingEnergySlider = true;
        labState.specEnergy = clamp((e.clientX - es.x0) / Math.max(1, es.x1 - es.x0), 0, 1);
        updateSpectrumHudTargets(false);
      }
    }
    updatePointerHover(e.clientX, e.clientY);
    return;
  }

  if (pageView === 'THERMO') {
    const ts = thermo.tempSlider;
    const cs = thermo.compSlider;
    if (e.clientX >= ts.x0 - 16 && e.clientX <= ts.x1 + 16 && Math.abs(e.clientY - ts.y) <= 22) {
      thermo.draggingTempSlider = true;
      thermo.targetTemp = clamp((e.clientX - ts.x0) / Math.max(1, ts.x1 - ts.x0), 0, 1);
      updateThermoHud();
    } else if (e.clientX >= cs.x0 - 16 && e.clientX <= cs.x1 + 16 && Math.abs(e.clientY - cs.y) <= 22) {
      thermo.draggingCompSlider = true;
      const prevY = thermo.pistonY;
      thermo.compression = clamp((e.clientX - cs.x0) / Math.max(1, cs.x1 - cs.x0), 0, 1);
      const nextY = thermo.minTop + (thermo.maxTop - thermo.minTop) * thermo.compression;
      thermo.pistonY = nextY;
      thermo.pistonVy = clamp(nextY - prevY, -24, 24);
      updateThermoHud();
    }
    updatePointerHover(e.clientX, e.clientY);
    return;
  }

  updatePointerHover(e.clientX, e.clientY);

  if (pointer.hoverGroup === 0 && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
    blackHole.active = true;
    blackHole.x = e.clientX;
    blackHole.y = e.clientY;
    blackHole.elapsed = 0;
    blackHole.charge = 0;
  }
});

window.addEventListener('pointerup', (e) => {
  const wasDraggingThermo = thermo.draggingTempSlider || thermo.draggingCompSlider || labState.draggingEnergySlider;
  thermo.draggingTempSlider = false;
  thermo.draggingCompSlider = false;
  labState.draggingEnergySlider = false;

  if (!pointer.down) return;
  const movedDist = Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY);
  const elapsed = performance.now() - pointer.downTime;
  pointer.down = false;

  const hadBlackHoleBlast = blackHole.active && blackHole.charge > 0.08;
  if (hadBlackHoleBlast) {
    triggerBlackHoleBlast();
  }
  blackHole.active = false;
  blackHole.charge = 0;
  blackHole.elapsed = 0;

  if (!wasDraggingThermo && !hadBlackHoleBlast && movedDist < 10 && elapsed < 420) {
    updatePointerHover(e.clientX, e.clientY);
    if (pageView === 'THERMO') {
      if (pointer.hoverGroup === 20) {
        exitThermoChamber(thermo.backBtn.x, thermo.backBtn.y);
      } else if (pointer.hoverGroup === 21) {
        implodeToSeed(thermo.seedBtn.x);
      }
    } else if (pageView === 'LAB') {
      if (pointer.hoverGroup === 20) {
        exitPhysicsLab(labState.backBtn.x, labState.backBtn.y);
      } else if (pointer.hoverGroup === 21) {
        implodeToSeed(labState.seedBtn.x);
      } else if (activeLab === 'SPECTRUM' && pointer.hoverGroup !== 24) {
        let hitBand = -1;
        let bestDist = Infinity;
        for (let b = 0; b < labState.specBands.length; b++) {
          const band = labState.specBands[b];
          const d = Math.abs(e.clientX - band.x);
          if (band.activity > 0.25 && d <= band.w * 2.5 && d < bestDist) {
            bestDist = d;
            hitBand = b;
          }
        }
        if (hitBand >= 0) {
          const band = labState.specBands[hitBand];
          const u = clamp((e.clientY - band.y0) / Math.max(1, band.y1 - band.y0), 0.08, 0.92);
          triggerBandPluck(hitBand, u, 0.95, true);
        } else {
          labState.specWave = {
            active: true,
            x: e.clientX,
            y: e.clientY,
            radius: 10,
            maxRadius: Math.hypot(viewW, viewH) * 0.9,
            hitMask: 0,
          };
        }
      } else if (activeLab === 'POLARITY') {
        labState.polarityMode = labState.polarityMode === 1 ? -1 : labState.polarityMode === -1 ? 0 : 1;
        playPolarityChime(labState.polarityMode, e.clientX);
      }
    } else if (simState === STATE.IDLE_SEED && pointer.hoverGroup === 99) {
      startBigBangSequence();
    } else if (pointer.hoverGroup > 0) {
      const clickedBtn = interactiveButtons.find((b) => b.groupId === pointer.hoverGroup);
      if (clickedBtn) handleInteractiveButton(clickedBtn);
    }
  }

  if (e.pointerType === 'touch') {
    pointer.active = false;
  }
  updatePointerHover(e.clientX, e.clientY);
});

window.addEventListener('pointercancel', () => {
  pointer.down = false;
  pointer.active = false;
  thermo.draggingTempSlider = false;
  thermo.draggingCompSlider = false;
  labState.draggingEnergySlider = false;
  blackHole.active = false;
  blackHole.charge = 0;
  blackHole.elapsed = 0;
});

document.addEventListener('mouseleave', () => {
  pointer.active = false;
  pointer.down = false;
  pointer.hoverGroup = 0;
  thermo.draggingTempSlider = false;
  thermo.draggingCompSlider = false;
  labState.draggingEnergySlider = false;
  blackHole.active = false;
  blackHole.charge = 0;
  blackHole.elapsed = 0;
});

// Eventi tastiera sulle hit-area accessibili
btnSeed.addEventListener('click', (e) => {
  if (e.detail === 0) startBigBangSequence();
});
btnAction.addEventListener('click', (e) => {
  if (e.detail === 0) {
    const heroBtn = interactiveButtons.find((b) => b.groupId === 2);
    if (heroBtn) handleInteractiveButton(heroBtn);
  }
});


function syncSliderCSS(slider) {
  slider.style.setProperty('--attr-min', slider.min || 0);
  slider.style.setProperty('--attr-max', slider.max || 100);
  slider.style.setProperty('--control-value', slider.value);
}

function syncTuningUI() {
  ctrlCount.value = CONFIG.particleCount;
  ctrlSize.value = CONFIG.dotSize;
  ctrlBrownian.value = CONFIG.brownianStrength;
  ctrlSoftness.value = CONFIG.edgeSoftness;
  ctrlMagnetRadius.value = CONFIG.magnetRadius;
  ctrlMagnetForce.value = CONFIG.magnetForce;

  outCount.value = `${CONFIG.particleCount}`;
  outSize.value = `${CONFIG.dotSize.toFixed(1)} px`;
  outBrownian.value = `${CONFIG.brownianStrength.toFixed(2)}`;
  outSoftness.value = `${CONFIG.edgeSoftness} px`;
  outMagnetRadius.value = `${CONFIG.magnetRadius} px`;
  outMagnetForce.value = `${CONFIG.magnetForce.toFixed(2)}`;

  [ctrlCount, ctrlSize, ctrlBrownian, ctrlSoftness, ctrlMagnetRadius, ctrlMagnetForce].forEach(
    syncSliderCSS
  );
}

function toggleTuningPanel() {
  tuningPanel.hidden = !tuningPanel.hidden;
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' && document.activeElement.type !== 'range') return;

  if (e.key === '/') {
    e.preventDefault();
    toggleTuningPanel();
    return;
  }

  if (e.key === 'Escape') {
    if (!tuningPanel.hidden) {
      tuningPanel.hidden = true;
    } else if (pageView === 'THERMO') {
      exitThermoChamber(viewW * 0.5, thermo.pistonY);
    } else if (pageView === 'LAB') {
      exitPhysicsLab(viewW * 0.5, viewH * 0.5);
    } else if (pageView === 'PAGE' && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
      triggerShockwaveTransition(viewW * 0.5, viewH * 0.5, 'HERO', 'THERMO');
    } else if (customWordActive && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
      applyTypedWord('HYDROGEN', false);
    }
    return;
  }

  if (tuningPanel.hidden && pageView === 'HERO' && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!customWordActive) return;
      const trimmed = displayWord.slice(0, -1);
      if (trimmed.length === 0) {
        applyTypedWord('HYDROGEN', false);
      } else {
        applyTypedWord(trimmed, true);
      }
    } else if (e.key.length === 1 && /^[a-zA-Z0-9 _-]$/.test(e.key)) {
      e.preventDefault();
      const ch = e.key.toUpperCase();
      if (!customWordActive) {
        if (ch !== ' ') applyTypedWord(ch, true);
      } else if (displayWord.length < 14) {
        applyTypedWord(displayWord + ch, true);
      }
    }
  }
});

tuningClose.addEventListener('click', () => {
  tuningPanel.hidden = true;
});

ctrlCount.addEventListener('input', () => {
  CONFIG.particleCount = Number(ctrlCount.value);
  outCount.value = `${CONFIG.particleCount}`;
  syncSliderCSS(ctrlCount);
  updateZoneTargets();
  syncParticleCount(false);
});

ctrlSize.addEventListener('input', () => {
  CONFIG.dotSize = Number(ctrlSize.value);
  outSize.value = `${CONFIG.dotSize.toFixed(1)} px`;
  syncSliderCSS(ctrlSize);
});

ctrlBrownian.addEventListener('input', () => {
  CONFIG.brownianStrength = Number(ctrlBrownian.value);
  outBrownian.value = `${CONFIG.brownianStrength.toFixed(2)}`;
  syncSliderCSS(ctrlBrownian);
});

ctrlSoftness.addEventListener('input', () => {
  CONFIG.edgeSoftness = Number(ctrlSoftness.value);
  outSoftness.value = `${CONFIG.edgeSoftness} px`;
  syncSliderCSS(ctrlSoftness);
});

ctrlMagnetRadius.addEventListener('input', () => {
  CONFIG.magnetRadius = Number(ctrlMagnetRadius.value);
  outMagnetRadius.value = `${CONFIG.magnetRadius} px`;
  syncSliderCSS(ctrlMagnetRadius);
});

ctrlMagnetForce.addEventListener('input', () => {
  CONFIG.magnetForce = Number(ctrlMagnetForce.value);
  outMagnetForce.value = `${CONFIG.magnetForce.toFixed(2)}`;
  syncSliderCSS(ctrlMagnetForce);
});

ctrlReplay.addEventListener('click', () => {
  if (simState === STATE.IDLE_SEED) {
    startBigBangSequence();
  } else if (simState === STATE.IMPLODING) {
    autoReplayAfterImplode = true;
  } else {
    autoReplayAfterImplode = true;
    implodeToSeed();
  }
});

ctrlReset.addEventListener('click', () => {
  Object.assign(CONFIG, DEFAULT_CONFIG);
  syncTuningUI();
  updateZoneTargets();
  syncParticleCount(false);
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildLayoutMask();
  }, 90);
});

syncTuningUI();
buildLayoutMask();
startIdleHarmonic();
startLoop();

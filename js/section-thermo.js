// ============================================================================
// SEZIONE 01 · THERMO — Camera Termodinamica (Muri Cristallizzati, Gas e Pistone)
// ============================================================================
"use strict";

function getThermoTargetPoint(p) {
  const t = p.wallT;
  if (p.wallSide === 0) {
    return { x: thermo.left + t * (thermo.right - thermo.left), y: thermo.pistonY };
  }
  if (p.wallSide === 1) {
    return { x: thermo.right, y: thermo.minTop + t * (thermo.bottom - thermo.minTop) };
  }
  if (p.wallSide === 2) {
    return { x: thermo.right - t * (thermo.right - thermo.left), y: thermo.bottom };
  }
  return { x: thermo.left, y: thermo.bottom - t * (thermo.bottom - thermo.minTop) };
}


function updateThermoHudTargets(forceSnap = false) {
  const displayTemp = clamp(thermo.measuredTemp * 0.55 + thermo.targetTemp * 0.45, 0, 1.35);
  const kelvin = Math.round(20 + displayTemp * 1180);
  const pressStr = thermo.pressureAtm.toFixed(2);
  const key = `${kelvin}K · ${pressStr}ATM`;
  const nowMs = thermo.elapsed;
  if (!forceSnap && (key === thermo.hudTextKey || nowMs - thermo.hudLastSwitchMs < 135)) {
    return;
  }
  thermo.hudTextKey = key;
  thermo.hudLastSwitchMs = nowMs;

  const topY = thermo.backBtn.y || 44;
  const targets = collectMatrixTargets(key, viewW * 0.5, topY, 2.35);
  morphMatrixHudDots(thermo.hudDots, targets, topY, forceSnap);
}

function syncThermoBounds(resetPositions = false) {
  const cx = viewW * 0.5;
  const isCompact = viewW < 680;
  const padX = clamp(viewW * 0.055, 28, 70);
  const padY = clamp(viewH * 0.075, 30, 56);
  const topY = padY + 14;

  const boxW = clamp(viewW * 0.62, 290, 700);
  const topSpace = topY + 34;
  const bottomSpace = isCompact ? 148 : 118;
  const availH = Math.max(210, viewH - topSpace - bottomSpace);
  const boxH = clamp(availH * 0.88, 210, 440);

  thermo.left = Math.round(cx - boxW * 0.5);
  thermo.right = Math.round(cx + boxW * 0.5);
  thermo.minTop = Math.round(topSpace + (availH - boxH) * 0.42);
  thermo.bottom = Math.round(thermo.minTop + boxH);
  thermo.maxTop = Math.round(thermo.bottom - Math.max(88, boxH * 0.28));
  thermo.pistonY = Math.round(
    thermo.minTop + (thermo.maxTop - thermo.minTop) * clamp(thermo.compression, 0, 1)
  );

  const backX = padX + 20;
  const seedX = viewW - padX - 20;
  const sliderHalfGap = isCompact ? 0 : 28;
  const trackY1 = isCompact ? thermo.bottom + 44 : thermo.bottom + Math.round((viewH - thermo.bottom) * 0.48);
  const trackY2 = isCompact ? thermo.bottom + 92 : trackY1;
  const totalSliderW = Math.min(boxW, viewW - 72);
  const singleW = isCompact
    ? Math.max(200, totalSliderW)
    : Math.max(160, (totalSliderW - sliderHalfGap * 2) * 0.5);

  const tx0 = isCompact ? cx - singleW * 0.5 : cx - sliderHalfGap - singleW;
  const tx1 = tx0 + singleW;
  const cx0 = isCompact ? tx0 : cx + sliderHalfGap;
  const cx1 = cx0 + singleW;

  // Se è solo un resize a camera già aperta, aggiorna i target senza ricreare le particelle
  if (!resetPositions && thermo.tempSlider.dots.length > 0) {
    thermo.backBtn.x = backX;
    thermo.backBtn.y = topY;
    thermo.seedBtn.x = seedX;
    thermo.seedBtn.y = topY;
    thermo.tempSlider.x0 = tx0;
    thermo.tempSlider.x1 = tx1;
    thermo.tempSlider.y = trackY1;
    thermo.compSlider.x0 = cx0;
    thermo.compSlider.x1 = cx1;
    thermo.compSlider.y = trackY2;
    updateThermoHudTargets(false);
    return;
  }

  // Pulsanti angoli in particelle molli (con movimento vivo e qualche punto oltre il bordo)
  const backDots = [];
  for (let i = 0; i <= 7; i++) {
    const f = i / 7;
    backDots.push(
      makeSoftDot(backX + 7 - f * 14, topY - 10 + f * 10, 1.38, {
        fringe: i === 0 || i === 7,
        springK: i === 0 ? 0.07 : 0.14,
        jitter: i === 0 ? 0.2 : 0.09,
      })
    );
    if (i > 0) {
      backDots.push(
        makeSoftDot(backX + 7 - f * 14, topY + 10 - f * 10, 1.38, {
          fringe: i === 7,
          springK: i === 7 ? 0.07 : 0.14,
          jitter: i === 7 ? 0.2 : 0.09,
        })
      );
    }
  }
  backDots.push(makeSoftDot(backX + 12, topY, 1.6, { springK: 0.12, jitter: 0.12 }));
  thermo.backBtn = { x: backX, y: topY, r: 26, dots: backDots };

  const seedDots = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const loose = i % 6 === 0;
    const rad = loose ? 15.8 : 13.8;
    seedDots.push(
      makeSoftDot(seedX + Math.cos(a) * rad, topY + Math.sin(a) * rad, loose ? 1.1 : 1.35, {
        fringe: loose,
        springK: loose ? 0.065 : 0.14,
        jitter: loose ? 0.22 : 0.1,
      })
    );
  }
  seedDots.push(makeSoftDot(seedX, topY, 2.0, { springK: 0.16, jitter: 0.08 }));
  thermo.seedBtn = { x: seedX, y: topY, r: 26, dots: seedDots };

  // Barra Temperatura: particelle Blu -> Rosso morbide (~14% sfiorano leggermente i bordi)
  const tempDots = [];
  const tRows = [-2.4, 0, 2.4];
  const tStepX = 3.2;
  for (let rIdx = 0; rIdx < tRows.length; rIdx++) {
    const stagger = rIdx === 1 ? tStepX * 0.5 : 0;
    for (let x = tx0 + stagger; x <= tx1; x += tStepX) {
      const u = clamp((x - tx0) / Math.max(1, singleW), 0, 1);
      const isFringe = Math.random() < 0.14;
      const yOff = isFringe ? (Math.random() < 0.5 ? -1 : 1) * (3.8 + Math.random() * 2.8) : tRows[rIdx];
      tempDots.push(
        makeSoftDot(x + (Math.random() - 0.5) * 1.1, trackY1 + yOff, isFringe ? 1.0 : 1.16, {
          colorIdx: Math.round(u * 255),
          colorWarmup: 0,
          fringe: isFringe,
          springK: isFringe ? 0.045 + Math.random() * 0.035 : 0.13 + Math.random() * 0.07,
          jitter: isFringe ? 0.24 : 0.09,
        })
      );
    }
  }
  const tVisX = tx0 + thermo.targetTemp * singleW;
  const tempKnobDots = buildKnobDots(1, true);
  for (let i = 0; i < tempKnobDots.length; i++) {
    tempKnobDots[i].x = tVisX + tempKnobDots[i].relX;
    tempKnobDots[i].y = trackY1 + tempKnobDots[i].relY;
    tempKnobDots[i].colorWarmup = 0;
  }
  thermo.tempSlider = {
    x0: tx0,
    x1: tx1,
    y: trackY1,
    knobVisX: tVisX,
    dots: tempDots,
    knobDots: tempKnobDots,
  };

  // Barra Compressione: gradiente di densità (rada a sinistra -> molto densa a destra), morbida con particelle oltre i bordi
  const compDots = [];
  let curX = cx0;
  while (curX <= cx1 + 0.5) {
    const u = clamp((curX - cx0) / Math.max(1, singleW), 0, 1);
    const rows = u < 0.28 ? [0] : u < 0.62 ? [-1.9, 1.9] : [-2.9, 0, 2.9];
    const shade = Math.round(56 - u * 46);
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const shift = rows.length === 2 ? rIdx * 1.4 : rows.length === 3 && rIdx === 1 ? 1.15 : 0;
      const px = curX + shift;
      if (px <= cx1 + 0.8) {
        const isFringe = Math.random() < 0.12;
        const yOff = isFringe ? (Math.random() < 0.5 ? -1 : 1) * (3.8 + Math.random() * 2.8) : rows[rIdx];
        compDots.push(
          makeSoftDot(px + (Math.random() - 0.5) * 0.9, trackY2 + yOff, isFringe ? 0.98 : 1.14, {
            shade,
            fringe: isFringe,
            springK: isFringe ? 0.045 + Math.random() * 0.035 : 0.13 + Math.random() * 0.07,
            jitter: isFringe ? 0.24 : 0.085,
          })
        );
      }
    }
    const pitch = 10.6 - Math.pow(u, 0.72) * 8.3;
    curX += pitch;
  }
  const cVisX = cx0 + thermo.compression * singleW;
  const compKnobDots = buildKnobDots(1, true);
  for (let i = 0; i < compKnobDots.length; i++) {
    compKnobDots[i].x = cVisX + compKnobDots[i].relX;
    compKnobDots[i].y = trackY2 + compKnobDots[i].relY;
  }
  thermo.compSlider = {
    x0: cx0,
    x1: cx1,
    y: trackY2,
    knobVisX: cVisX,
    dots: compDots,
    knobDots: compKnobDots,
  };

  thermo.hudDots = [];
  updateThermoHudTargets(true);
}

function updateThermoHud() {
  updateThermoHudTargets(false);
  if (!thermoSrStatus) return;
  const displayTemp = clamp(thermo.measuredTemp * 0.55 + thermo.targetTemp * 0.45, 0, 1.35);
  const kelvin = Math.round(20 + displayTemp * 1180);
  const pct = thermo.wallTotal > 0 ? Math.round((thermo.wallLockedCount / thermo.wallTotal) * 100) : 100;
  thermoSrStatus.textContent = `Temperatura ${kelvin} Kelvin, Pressione ${thermo.pressureAtm.toFixed(2)} atmosfere, Muri ${pct}%`;
}

function enterThermoChamber(originX, originY) {
  if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
  pageView = 'THERMO';
  blackHole.active = false;
  blackHole.charge = 0;
  pulseWave.active = false;
  slashTrails.length = 0;

  thermo.compression = 0;
  thermo.targetTemp = 0.34;
  thermo.measuredTemp = 0.34;
  thermo.pressureAtm = 1.0;
  thermo.draggingTempSlider = false;
  thermo.draggingCompSlider = false;
  thermo.pistonVy = 0;
  thermo.elapsed = 0;
  thermo.hudTick = 0;
  thermo.hudTextKey = '';
  thermo.hudLastSwitchMs = 0;
  syncThermoBounds(true);

  for (let s = 0; s < 4; s++) thermo.wallBins[s].fill(0);

  // 1. Preleva fisicamente le particelle per l'UI (barre, manopole, testi, pulsanti) dal pool reale:
  // nessuna particella compare dal nulla, partono tutte dalla posizione reale in cui si trovavano in MATTER!
  const takeMatterParticleForUi = (d, destX, destY) => {
    const src = particles.length > 600 ? particles.pop() : particles[Math.floor(Math.random() * particles.length)];
    if (src) {
      d.x = src.x;
      d.y = src.y;
      const dx = destX - src.x;
      const dy = destY - src.y;
      const dist = Math.hypot(dx, dy) || 1;
      const initSpd = clamp(dist * 0.018, 1.2, 4.2);
      const swirl = (Math.random() - 0.5) * 0.55;
      const ang = Math.atan2(dy, dx) + swirl;
      d.vx = Math.cos(ang) * initSpd;
      d.vy = Math.sin(ang) * initSpd;
    }
    d.colorWarmup = 0;
    if (d.scale !== undefined) d.scale = 0.85;
  };

  const seedUiGroup = (arr, isKnob = false, knobX = 0, knobY = 0) => {
    for (let k = 0; k < arr.length; k++) {
      const d = arr[k];
      const destX = isKnob ? knobX + d.relX : d.hx ?? d.tx;
      const destY = isKnob ? knobY + d.relY : d.hy ?? d.ty;
      takeMatterParticleForUi(d, destX, destY);
    }
  };
  seedUiGroup(thermo.backBtn.dots);
  seedUiGroup(thermo.seedBtn.dots);
  seedUiGroup(thermo.hudDots);
  seedUiGroup(thermo.tempSlider.dots);
  seedUiGroup(thermo.tempSlider.knobDots, true, thermo.tempSlider.knobVisX, thermo.tempSlider.y);
  seedUiGroup(thermo.compSlider.dots);
  seedUiGroup(thermo.compSlider.knobDots, true, thermo.compSlider.knobVisX, thermo.compSlider.y);

  // 2. Suddivide le restanti particelle in:
  //    - Molecole di gas interne (~480)
  //    - Costruttori dei 4 muri (~720, ~180 per lato a passo ~2.5px -> si saldano nella linea continua senza sparire)
  //    - Particelle in eccesso ('fuse') che collidono fisicamente con i vicini e si fondono 2 -> 1!
  const boxW = thermo.right - thermo.left;
  const boxH = thermo.bottom - thermo.minTop;
  const boxCx = (thermo.left + thermo.right) * 0.5;
  const boxCy = (thermo.minTop + thermo.bottom) * 0.5;
  const total = particles.length;
  const gasCount = Math.min(total - 200, clamp(Math.round((boxW * boxH) / 380), 260, 520));
  const wallCount = Math.min(Math.max(0, total - gasCount), 720);
  const activeCoreCount = gasCount + wallCount;

  thermo.gasCount = gasCount;
  thermo.wallTotal = wallCount;
  thermo.wallLockedCount = 0;

  const initSpeed = 0.35 + Math.pow(thermo.targetTemp, 0.8) * 11.2;
  const perWallBase = Math.floor(wallCount / 4);

  for (let i = 0; i < total; i++) {
    const p = particles[i];
    p.z = 0;
    p.vz = 0;
    p.bhRecoverRate = 0;
    p.deadFuse = false;

    const ox = p.x - boxCx;
    const oy = p.y - boxCy;
    const oDist = Math.hypot(ox, oy) || 1;
    const swirlX = -oy / oDist;
    const swirlY = ox / oDist;

    if (i < gasCount) {
      p.thermoRole = 'gas';
      p.wallLocked = false;
      p.gasRadius = 2.5 + p.sizeFactor * 0.7;
      p.heatGlow = 0.36; // Parte dal colore grafite scuro e vira gradualmente alla temperatura
      p.colorWarmup = 0;
      p.thermoInChamber =
        p.x > thermo.left + 8 &&
        p.x < thermo.right - 8 &&
        p.y > thermo.pistonY + 8 &&
        p.y < thermo.bottom - 8;

      if (p.thermoInChamber) {
        const ang = Math.random() * Math.PI * 2;
        const spd = initSpeed * (0.45 + Math.random() * 0.75);
        p.vx = p.vx * 0.4 + Math.cos(ang) * spd * 0.6;
        p.vy = p.vy * 0.4 + Math.sin(ang) * spd * 0.6;
      } else {
        p.goalInX = thermo.left + 20 + Math.random() * Math.max(40, boxW - 40);
        p.goalInY = thermo.pistonY + 20 + Math.random() * Math.max(40, boxH - 40);
        p.vx = p.vx * 0.35 + swirlX * 1.4;
        p.vy = p.vy * 0.35 + swirlY * 1.4;
      }
    } else if (i < activeCoreCount) {
      const wIdx = i - gasCount;
      const side = Math.min(3, Math.floor(wIdx / Math.max(1, perWallBase)));
      const sideTotal = side === 3 ? wallCount - perWallBase * 3 : perWallBase;
      const localIdx = wIdx - side * perWallBase;
      const t = (localIdx + 0.5) / Math.max(1, sideTotal);
      p.thermoRole = 'wall';
      p.wallSide = side;
      p.wallT = clamp(t, 0, 1);
      p.wallBin = clamp(Math.floor(p.wallT * WALL_SEGMENTS), 0, WALL_SEGMENTS - 1);
      p.wallLocked = false;
      p.magneticWake = 1;
      p.wallDelay = 60 + (side * 0.12 + Math.abs(t - 0.5) * 0.32 + Math.random() * 0.42) * 1250;
      const pulseAng = Math.atan2(p.y - (originY || boxCy), p.x - (originX || boxCx));
      p.vx = p.vx * 0.3 + swirlX * 1.9 + Math.cos(pulseAng) * 1.5;
      p.vy = p.vy * 0.3 + swirlY * 1.9 + Math.sin(pulseAng) * 1.5;
    } else {
      // Particella in eccesso: insegue una particella attiva vicina e sparisce SOLO collidendo e fondendosi (2 -> 1)
      p.thermoRole = 'fuse';
      p.wallLocked = false;
      // Sceglie il partner più vicino tra le particelle attive (gas + wall)
      let bestPartner = i % activeCoreCount;
      let bestD2 = Infinity;
      for (let k = 0; k < 12; k++) {
        const candIdx = (i * 13 + k * 59) % activeCoreCount;
        const cand = particles[candIdx];
        const d2 = (cand.x - p.x) * (cand.x - p.x) + (cand.y - p.y) * (cand.y - p.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestPartner = candIdx;
        }
      }
      p.fusePartnerIdx = bestPartner;
    }
  }

  interactiveButtons = [];
  playPulseSweep(originX || viewW * 0.5);
  updateThermoHud();
  syncHitboxes();
}

function exitThermoChamber(originX, originY) {
  if (pageView !== 'THERMO') return;
  thermo.draggingTempSlider = false;
  thermo.draggingCompSlider = false;

  const total = particles.length;
  for (let i = 0; i < total; i++) {
    const p = particles[i];
    if (p.thermoRole === 'wall' && p.wallLocked) {
      const pos = getThermoTargetPoint(p);
      p.x = pos.x;
      p.y = pos.y;
      p.z = (Math.random() - 0.5) * 18;
    }
    p.thermoRole = null;
    p.wallLocked = false;
    p.thermoInChamber = false;
    p.vx = (Math.random() - 0.5) * 3.5;
    p.vy = (Math.random() - 0.5) * 3.5;
  }

  // Anche i pallini dell'UI tornano nel pool reale (in eccesso collidono e si fondono fisicamente)
  const reclaimUiDots = (arr) => {
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
  reclaimUiDots(thermo.hudDots);
  reclaimUiDots(thermo.backBtn.dots);
  reclaimUiDots(thermo.seedBtn.dots);
  reclaimUiDots(thermo.tempSlider.dots);
  reclaimUiDots(thermo.tempSlider.knobDots);
  reclaimUiDots(thermo.compSlider.dots);
  reclaimUiDots(thermo.compSlider.knobDots);

  triggerShockwaveTransition(originX || viewW * 0.5, originY || viewH * 0.5, 'PAGE', 'THERMO');
}

function lockWallParticle(p) {
  if (p.wallLocked) return;
  p.wallLocked = true;
  thermo.wallLockedCount++;
  const bin = p.wallBin;
  const row = thermo.wallBins[p.wallSide];
  row[bin] = Math.min(255, row[bin] + 1);
}

function updateThermoSimulation(dt, dtMs) {
  thermo.elapsed += dtMs;
  const gasCount = thermo.gasCount;
  const wallEnd = gasCount + thermo.wallTotal;
  const left = thermo.left;
  const right = thermo.right;
  const top = thermo.pistonY;
  const bottom = thermo.bottom;
  const pistonVy = thermo.pistonVy;
  const boxCx = (left + right) * 0.5;
  const boxCy = (top + bottom) * 0.5;

  // 1. Le ~720 particelle dei muri fluiscono verso il perimetro e si saldano nella linea continua (nessun taglio forzato di massa)
  if (thermo.wallLockedCount < thermo.wallTotal) {
    const damp = Math.pow(0.895, dt);
    for (let i = gasCount; i < wallEnd && i < particles.length; i++) {
      const p = particles[i];
      if (p.wallLocked) continue;
      const tgt = getThermoTargetPoint(p);
      const dx = tgt.x - p.x;
      const dy = tgt.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (thermo.elapsed < p.wallDelay) {
        const rx = p.x - boxCx;
        const ry = p.y - boxCy;
        const rDist = Math.hypot(rx, ry) || 1;
        const tangX = -ry / rDist;
        const tangY = rx / rDist;
        p.vx = (p.vx + tangX * 0.16 * dt + (dx / Math.max(1, dist)) * 0.08 * dt) * Math.pow(0.95, dt);
        p.vy = (p.vy + tangY * 0.16 * dt + (dy / Math.max(1, dist)) * 0.08 * dt) * Math.pow(0.95, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        continue;
      }

      const activeMs = thermo.elapsed - p.wallDelay;
      if (dist <= 2.2) {
        p.x = tgt.x;
        p.y = tgt.y;
        p.vx = 0;
        p.vy = 0;
        lockWallParticle(p);
      } else {
        const easeRamp = clamp(activeMs / 550, 0.2, 1.0);
        const desiredSpd = clamp(dist * 0.065 * easeRamp, 1.15, 5.4);
        const desVx = (dx / Math.max(0.001, dist)) * desiredSpd;
        const desVy = (dy / Math.max(0.001, dist)) * desiredSpd;
        p.vx = (p.vx + (desVx - p.vx) * 0.16 * dt) * damp;
        p.vy = (p.vy + (desVy - p.vy) * 0.16 * dt) * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.splitScale > 1) p.splitScale = Math.max(1, p.splitScale - 0.04 * dt);
    }
  }

  // 1b. Particelle in eccesso ('fuse'): inseguono una particella attiva e spariscono SOLO collidendo fisicamente con essa (2 -> 1)
  let fusedAny = false;
  for (let i = wallEnd; i < particles.length; i++) {
    const p = particles[i];
    if (p.deadFuse) continue;
    const partnerIdx = clamp(p.fusePartnerIdx || 0, 0, Math.max(0, wallEnd - 1));
    const partner = particles[partnerIdx];
    if (!partner) {
      p.deadFuse = true;
      fusedAny = true;
      continue;
    }
    const tgtPos = partner.thermoRole === 'wall' && partner.wallLocked ? getThermoTargetPoint(partner) : partner;
    const dx = tgtPos.x - p.x;
    const dy = tgtPos.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 3.6) {
      p.deadFuse = true;
      partner.splitScale = 1.28;
      fusedAny = true;
      continue;
    }
    const chaseSpd = clamp(dist * 0.055, 1.8, 6.2);
    p.vx += ((dx / dist) * chaseSpd - p.vx) * 0.16 * dt;
    p.vy += ((dy / dist) * chaseSpd - p.vy) * 0.16 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (fusedAny) {
    particles = particles.filter((p) => !p.deadFuse);
  }

  // 2. Molecole ancora in arrivo dentro la camera: scivolano dolcemente fino ad entrare
  const T = thermo.targetTemp;
  for (let i = 0; i < gasCount; i++) {
    const p = particles[i];
    const r = p.gasRadius || 3;
    if (!p.thermoInChamber) {
      if (p.x > left + r + 2 && p.x < right - r - 2 && p.y > top + r + 2 && p.y < bottom - r - 2) {
        p.thermoInChamber = true;
      } else {
        const gx = p.goalInX || boxCx;
        const gy = clamp(p.goalInY || boxCy, top + r + 14, bottom - r - 14);
        const dx = gx - p.x;
        const dy = gy - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const enterSpd = clamp(dist * 0.048, 1.2, 5.2);
        p.vx += ((dx / dist) * enterSpd - p.vx) * 0.14 * dt;
        p.vy += ((dy / dist) * enterSpd - p.vy) * 0.14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.heatGlow = p.heatGlow + (T - p.heatGlow) * 0.1 * dt;
      }
    }
  }

  // 3. Popola Spatial Hash veloce solo per le molecole già dentro la camera
  const gasCell = 11;
  const gCols = Math.ceil(viewW / gasCell) + 2;
  const gRows = Math.ceil(viewH / gasCell) + 2;
  const neededHeads = gCols * gRows;
  if (shHead.length < neededHeads) shHead = new Int32Array(neededHeads);
  if (shNext.length < gasCount) shNext = new Int32Array(gasCount);
  shHead.fill(-1, 0, neededHeads);

  for (let i = 0; i < gasCount; i++) {
    const p = particles[i];
    if (!p.thermoInChamber) continue;
    const cxCell = clamp(Math.floor(p.x / gasCell) + 1, 0, gCols - 1);
    const cyCell = clamp(Math.floor(p.y / gasCell) + 1, 0, gRows - 1);
    const cellIdx = cyCell * gCols + cxCell;
    shNext[i] = shHead[cellIdx];
    shHead[cellIdx] = i;
  }

  // 4. Urti elastici gas-gas + trasferimento termico locale
  for (let i = 0; i < gasCount; i++) {
    const p = particles[i];
    if (!p.thermoInChamber) continue;
    const r1 = p.gasRadius || 3;
    const cxCell = clamp(Math.floor(p.x / gasCell) + 1, 0, gCols - 1);
    const cyCell = clamp(Math.floor(p.y / gasCell) + 1, 0, gRows - 1);

    for (let oy = -1; oy <= 1; oy++) {
      const nyCell = cyCell + oy;
      if (nyCell < 0 || nyCell >= gRows) continue;
      const rowBase = nyCell * gCols;
      for (let ox = -1; ox <= 1; ox++) {
        const nxCell = cxCell + ox;
        if (nxCell < 0 || nxCell >= gCols) continue;
        let j = shHead[rowBase + nxCell];
        while (j !== -1) {
          if (j > i) {
            const q = particles[j];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const minDist = r1 + (q.gasRadius || 3);
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.0001 && distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq);
              const nx = dx / dist;
              const ny = dy / dist;
              const overlap = (minDist - dist) * 0.5;
              p.x -= nx * overlap;
              p.y -= ny * overlap;
              q.x += nx * overlap;
              q.y += ny * overlap;

              const dvx = p.vx - q.vx;
              const dvy = p.vy - q.vy;
              const vn = dvx * nx + dvy * ny;
              if (vn > 0) {
                const imp = vn * 0.99;
                p.vx -= imp * nx;
                p.vy -= imp * ny;
                q.vx += imp * nx;
                q.vy += imp * ny;
                const avgHeat = (p.heatGlow + q.heatGlow) * 0.5;
                p.heatGlow = p.heatGlow * 0.7 + avgHeat * 0.3;
                q.heatGlow = q.heatGlow * 0.7 + avgHeat * 0.3;
              }
            } else if (thermo.targetTemp < 0.16 && distSq < minDist * minDist * 6.5) {
              // Stato quasi-solido a basse temperature (< ~140K): leggera coesione reticolare tra molecole fredde blu
              const dist = Math.sqrt(distSq);
              const nx = dx / dist;
              const ny = dy / dist;
              const coldFactor = (0.16 - thermo.targetTemp) / 0.16;
              const eqDist = minDist * 1.45;
              const coh = clamp((dist - eqDist) * 0.012, -0.02, 0.032) * coldFactor * dt;
              p.vx += nx * coh;
              p.vy += ny * coh;
              q.vx -= nx * coh;
              q.vy -= ny * coh;
            }
          }
          j = shNext[j];
        }
      }
    }
  }

  // 5. Termostato cinetico + interazione mouse interna + rimbalzo sulle 4 pareti continue
  const vTarget = T < 0.05 ? 0.14 : 0.28 + Math.pow(T, 0.85) * 11.4;
  const jitter = T * 0.16;
  const thermostatRate = (pistonVy !== 0 ? 0.012 : 0.042) * dt;

  let sumSpeedSq = 0;
  let wallImpulse = 0;
  const stirActive =
    pointer.active &&
    !thermo.draggingTempSlider &&
    !thermo.draggingCompSlider &&
    pointer.x > left &&
    pointer.x < right &&
    pointer.y > top &&
    pointer.y < bottom;
  const stirRad = 90;

  for (let i = 0; i < gasCount; i++) {
    const p = particles[i];
    if (!p.thermoInChamber) {
      sumSpeedSq += 1;
      continue;
    }
    const r = p.gasRadius || 3;

    if (jitter > 0.005) {
      p.vx += (Math.random() - 0.5) * jitter * dt;
      p.vy += (Math.random() - 0.5) * jitter * dt;
    }

    if (stirActive) {
      const sdx = p.x - pointer.x;
      const sdy = p.y - pointer.y;
      const sdist = Math.hypot(sdx, sdy);
      if (sdist > 1 && sdist < stirRad) {
        const f = (1 - sdist / stirRad) * (pointer.down ? 1.45 : 0.55) * dt;
        p.vx += (sdx / sdist) * f + pointer.vx * f * 0.12;
        p.vy += (sdy / sdist) * f + pointer.vy * f * 0.12;
      }
    }

    let spd = Math.hypot(p.vx, p.vy);
    if (spd < 0.001) {
      const ang = Math.random() * Math.PI * 2;
      p.vx = Math.cos(ang) * 0.15;
      p.vy = Math.sin(ang) * 0.15;
      spd = 0.15;
    } else if (T < 0.08) {
      const coolDamp = Math.pow(0.92, dt);
      p.vx *= coolDamp;
      p.vy *= coolDamp;
    } else {
      const nextSpd = spd + (vTarget - spd) * thermostatRate;
      const ratio = clamp(nextSpd / spd, 0.75, 1.35);
      p.vx *= ratio;
      p.vy *= ratio;
    }

    const maxSpd = 18;
    spd = Math.hypot(p.vx, p.vy);
    if (spd > maxSpd) {
      p.vx = (p.vx / spd) * maxSpd;
      p.vy = (p.vy / spd) * maxSpd;
      spd = maxSpd;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    let hitWall = false;
    if (p.x - r < left) {
      p.x = left + r;
      if (p.vx < 0) {
        wallImpulse += Math.abs(p.vx);
        p.vx = -p.vx * 0.99;
        hitWall = true;
      }
    } else if (p.x + r > right) {
      p.x = right - r;
      if (p.vx > 0) {
        wallImpulse += Math.abs(p.vx);
        p.vx = -p.vx * 0.99;
        hitWall = true;
      }
    }

    if (p.y - r < top) {
      p.y = top + r;
      if (p.vy < pistonVy) {
        const relVy = p.vy - pistonVy;
        wallImpulse += Math.abs(relVy);
        p.vy = pistonVy + Math.abs(relVy) * 0.99;
        hitWall = true;
      }
    } else if (p.y + r > bottom) {
      p.y = bottom - r;
      if (p.vy > 0) {
        wallImpulse += Math.abs(p.vy);
        p.vy = -p.vy * 0.99;
        hitWall = true;
      }
    }

    if (hitWall && spd > 2.4 && Math.random() < 0.08) {
      playThermoClink(screenToPan(p.x), p.heatGlow);
    }

    const speedHeat = clamp((spd - 0.35) / 10.6, 0, 1);
    const localHeat = clamp(speedHeat * 0.68 + T * 0.32, 0, 1);
    p.heatGlow = p.heatGlow + (localHeat - p.heatGlow) * 0.12 * dt;
    if (p.splitScale > 1) p.splitScale = Math.max(1, p.splitScale - 0.04 * dt);
    sumSpeedSq += spd * spd;
  }

  const ts = thermo.tempSlider;
  const cs = thermo.compSlider;
  const tGoalX = ts.x0 + thermo.targetTemp * (ts.x1 - ts.x0);
  const cGoalX = cs.x0 + thermo.compression * (cs.x1 - cs.x0);
  ts.knobVisX += (tGoalX - ts.knobVisX) * 0.34 * dt;
  cs.knobVisX += (cGoalX - cs.knobVisX) * 0.34 * dt;

  stepTrackDots(ts.dots, ts.knobVisX, ts.y, dt);
  stepTrackDots(cs.dots, cs.knobVisX, cs.y, dt);
  stepKnobDots(ts.knobDots, ts.knobVisX, ts.y, thermo.draggingTempSlider || pointer.hoverGroup === 22, dt);
  stepKnobDots(cs.knobDots, cs.knobVisX, cs.y, thermo.draggingCompSlider || pointer.hoverGroup === 23, dt);
  stepCornerDots(thermo.backBtn, pointer.hoverGroup === 20, dt);
  stepCornerDots(thermo.seedBtn, pointer.hoverGroup === 21, dt);

  thermo.hudDots = stepMorphHudArray(thermo.hudDots, dt);

  // 7. Telemetria fisica: Temperatura istantanea & Pressione reale
  const meanSpd = Math.sqrt(sumSpeedSq / Math.max(1, gasCount));
  const kineticTemp = clamp((meanSpd - 0.25) / 11.2, 0, 1.35);
  thermo.measuredTemp += (kineticTemp - thermo.measuredTemp) * 0.12 * dt;

  const fullH = Math.max(1, thermo.bottom - thermo.minTop);
  const curH = Math.max(40, thermo.bottom - thermo.pistonY);
  const volumeInv = fullH / curH;
  const perim = Math.max(1, 2 * (right - left + curH));
  const impactPress = (wallImpulse / perim) * 1.45;
  const idealPress = (0.18 + thermo.measuredTemp * 2.45) * volumeInv;
  const rawPress = clamp(idealPress * 0.72 + impactPress * 0.28, 0.08, 12.5);
  thermo.pressureAtm += (rawPress - thermo.pressureAtm) * 0.14 * dt;
  thermo.pistonVy *= 0.65;

  thermo.hudTick++;
  if (thermo.hudTick % 6 === 0) updateThermoHud();
}

function renderThermoFrame() {
  const left = thermo.left;
  const right = thermo.right;
  const top = thermo.pistonY;
  const minTop = thermo.minTop;
  const bottom = thermo.bottom;
  const gasCount = thermo.gasCount;
  const total = particles.length;

  // 1. Muri cristallizzati SOLIDI: disegna i tratti continui solo dove i bin sono già saldati da almeno 2 particelle
  ctx.lineCap = 'round';
  for (let s = 0; s < 4; s++) {
    const bins = thermo.wallBins[s];
    ctx.strokeStyle = s === 0 ? '#111111' : '#1b1b1b';
    ctx.lineWidth = s === 0 ? 4.2 : 3.1;

    let runStart = -1;
    for (let b = 0; b <= WALL_SEGMENTS; b++) {
      const filled = b < WALL_SEGMENTS && bins[b] >= 2;
      if (filled && runStart === -1) {
        runStart = b;
      } else if (!filled && runStart !== -1) {
        const t0 = runStart / WALL_SEGMENTS;
        const t1 = b / WALL_SEGMENTS;
        ctx.beginPath();
        if (s === 0) {
          ctx.moveTo(left + t0 * (right - left), top);
          ctx.lineTo(left + t1 * (right - left), top);
        } else if (s === 1) {
          ctx.moveTo(right, minTop + t0 * (bottom - minTop));
          ctx.lineTo(right, minTop + t1 * (bottom - minTop));
        } else if (s === 2) {
          ctx.moveTo(right - t0 * (right - left), bottom);
          ctx.lineTo(right - t1 * (right - left), bottom);
        } else {
          ctx.moveTo(left, bottom - t0 * (bottom - minTop));
          ctx.lineTo(left, bottom - t1 * (bottom - minTop));
        }
        ctx.stroke();
        runStart = -1;
      }
    }
  }

  // 2. Particelle muro in volo o appena arrivate su un segmento non ancora saldato + particelle 'fuse' in avvicinamento prima dell'urto
  ctx.fillStyle = GRAY_STYLES[20];
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let i = gasCount; i < total; i++) {
    const p = particles[i];
    if (p.deadFuse) continue;
    if (p.thermoRole === 'wall' && p.wallLocked) {
      if (thermo.wallBins[p.wallSide][p.wallBin] >= 2) continue;
      const pos = getThermoTargetPoint(p);
      ctx.moveTo(pos.x + 1.55, pos.y);
      ctx.arc(pos.x, pos.y, 1.55, 0, Math.PI * 2);
    } else {
      const r = 1.45 * (p.splitScale || 1);
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  // 3. Molecole di gas interne colorate fisicamente (Blu freddo <-> Grafite <-> Rosso caldo)
  ctx.globalAlpha = 0.94;
  for (let i = 0; i < gasCount; i++) {
    const p = particles[i];
    const colorIdx = clamp(Math.round(p.heatGlow * 255), 0, 255);
    ctx.fillStyle = THERMO_STYLES[colorIdx];
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.gasRadius || 2.8) * (p.splitScale || 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 4. Pulsanti angoli (molli) & Telemetria superiore dinamica (particelle che migrano da una cifra all'altra)
  const drawSoftCornerDots = (btn, hovered) => {
    ctx.fillStyle = hovered ? '#000000' : '#262626';
    for (let i = 0; i < btn.dots.length; i++) {
      const d = btn.dots[i];
      ctx.globalAlpha = d.fringe ? 0.62 : 0.9;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (hovered ? 1.12 : 1.0), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawSoftCornerDots(thermo.backBtn, pointer.hoverGroup === 20);
  drawSoftCornerDots(thermo.seedBtn, pointer.hoverGroup === 21);

  const displayTemp = clamp(thermo.measuredTemp * 0.55 + thermo.targetTemp * 0.45, 0, 1.35);
  const tempColorIdx = clamp(Math.round((displayTemp / 1.1) * 255), 0, 255);
  const neutralColorIdx = 92;
  for (let i = 0; i < thermo.hudDots.length; i++) {
    const d = thermo.hudDots[i];
    if (d.mergedDead) continue;
    ctx.globalAlpha = d.isDot ? 0.62 : 0.94;
    const warm = d.colorWarmup ?? 1;
    const mix = d.colorMix * warm;
    const cIdx = Math.round(neutralColorIdx + (tempColorIdx - neutralColorIdx) * mix);
    ctx.fillStyle = mix > 0.08 ? THERMO_STYLES[clamp(cIdx, 0, 255)] : '#222222';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 1.04 * (d.scale || 1), 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Slider 100% di particelle molli: virano gradualmente dal nero mentre viaggiano da MATTER verso la barra
  const ts = thermo.tempSlider;
  for (let i = 0; i < ts.dots.length; i++) {
    const d = ts.dots[i];
    ctx.globalAlpha = d.fringe ? 0.62 : 0.9;
    const warm = d.colorWarmup ?? 1;
    const cIdx = Math.round(neutralColorIdx + (d.colorIdx - neutralColorIdx) * warm);
    ctx.fillStyle = THERMO_STYLES[clamp(cIdx, 0, 255)];
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  const targetKnobIdx = clamp(Math.round(thermo.targetTemp * 255), 0, 255);
  for (let i = 0; i < ts.knobDots.length; i++) {
    const d = ts.knobDots[i];
    ctx.globalAlpha = d.fringe ? 0.64 : 0.94;
    const warm = d.colorWarmup ?? 1;
    const cIdx = Math.round(neutralColorIdx + (targetKnobIdx - neutralColorIdx) * warm);
    ctx.fillStyle = THERMO_STYLES[clamp(cIdx, 0, 255)];
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const cs = thermo.compSlider;
  for (let i = 0; i < cs.dots.length; i++) {
    const d = cs.dots[i];
    ctx.globalAlpha = d.fringe ? 0.62 : 0.92;
    ctx.fillStyle = GRAY_STYLES[d.shade];
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < cs.knobDots.length; i++) {
    const d = cs.knobDots[i];
    ctx.globalAlpha = d.fringe ? 0.64 : 0.94;
    ctx.fillStyle = '#181818';
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}


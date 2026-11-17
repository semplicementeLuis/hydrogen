// ============================================================================
// HYDROGEN — Motore Fisico Core, Campi di Distanza, Quote e Particelle Morbide
// ============================================================================
"use strict";

function updateZoneTargets() {
  if (totalMaskArea <= 0) return;
  if ((pageView === 'HERO' && displayWord === 'HYDROGEN') || baseHydrogenArea <= 0) {
    baseHydrogenArea = totalMaskArea;
  }

  if (pageView === 'PAGE') {
    // Budget totale FISSO nel menu: cambiare sezione non crea né fonde particelle
    effectiveParticleCount = clamp(Math.round(CONFIG.particleCount * 0.62), 2600, 6800);
    const density = effectiveParticleCount / Math.max(1, totalMaskArea);
    idealSpacing = clamp(Math.sqrt(1 / Math.max(0.0005, density)) * 0.92, 4.5, 16);

    const FIXED_SHARES = {
      TOP_BACK: 0.018,
      TOP_SEED: 0.022,
      TOP_CHAR_0: 0.013,
      TOP_DIGIT: 0.014,
      TOP_CHAR_SLASH: 0.009,
      TOP_CHAR_0B: 0.013,
      TOP_CHAR_4: 0.014,
      PLAY: 0.035,
      BOTTOM_ACTIVE: 0.062,
      BOTTOM_INACTIVE: 0.036,
    };

    let reservedTotal = 0;
    let centerWeightedArea = 0;
    for (let z = 1; z < zones.length; z++) {
      const zone = zones[z];
      const shareKey =
        zone.compartment === 'BOTTOM'
          ? zone.isActiveMenu
            ? 'BOTTOM_ACTIVE'
            : 'BOTTOM_INACTIVE'
          : zone.compartment;
      const share = shareKey && FIXED_SHARES[shareKey];
      if (share) {
        zone.targetCount = Math.round(effectiveParticleCount * share);
        reservedTotal += zone.targetCount;
      } else {
        const w = zone.isThermoPreview ? 2.4 : 1.0;
        centerWeightedArea += zone.area * w;
      }
    }

    const centerBudget = Math.max(200, effectiveParticleCount - reservedTotal);
    for (let z = 1; z < zones.length; z++) {
      const zone = zones[z];
      const isFixed =
        zone.compartment === 'BOTTOM' || (zone.compartment && FIXED_SHARES[zone.compartment]);
      if (!isFixed) {
        const w = zone.isThermoPreview ? 2.4 : 1.0;
        zone.targetCount = ((zone.area * w) / Math.max(1, centerWeightedArea)) * centerBudget;
      }
    }
  } else {
    const areaRatio = baseHydrogenArea > 0 ? totalMaskArea / baseHydrogenArea : 1;
    effectiveParticleCount = clamp(Math.round(CONFIG.particleCount * areaRatio), 1100, 6800);

    const density = effectiveParticleCount / totalMaskArea;
    idealSpacing = clamp(Math.sqrt(1 / Math.max(0.0005, density)) * 0.92, 4.5, 16);

    let weightedArea = 0;
    for (let z = 1; z < zones.length; z++) {
      const zone = zones[z];
      const w = zone.groupId >= 2 ? 1.22 : 1.0;
      weightedArea += zone.area * w;
    }
    const baseDensity = effectiveParticleCount / Math.max(1, weightedArea);
    for (let z = 1; z < zones.length; z++) {
      const zone = zones[z];
      const w = zone.groupId >= 2 ? 1.22 : 1.0;
      zone.targetCount = zone.area * baseDensity * w;
    }
  }

  shCellSize = Math.max(8, Math.ceil(idealSpacing * 1.15));
  shCols = Math.ceil(viewW / shCellSize) + 2;
  shRows = Math.ceil(viewH / shCellSize) + 2;
  shHead = new Int32Array(shCols * shRows);
}

function drawParticleTextZones(registerZone, nextZoneId, text, textY, fontSize, groupId = 1) {
  const chars = Array.from(text);
  const octx = maskCtx;
  const measureWord = (fs) => {
    octx.font = `900 ${fs}px -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
    const ls = fs * 0.085;
    const ws = chars.map((ch) => (ch === ' ' ? fs * 0.36 : octx.measureText(ch).width));
    const total = ws.reduce((acc, w) => acc + w, 0) + ls * Math.max(0, chars.length - 1);
    return { ls, ws, total };
  };
  let metrics = measureWord(fontSize);
  if (metrics.total > viewW * 0.84) {
    fontSize = Math.max(24, fontSize * ((viewW * 0.84) / Math.max(1, metrics.total)));
    metrics = measureWord(fontSize);
  }

  const charPad = Math.ceil(fontSize * 0.22);
  const charBoxH = fontSize * 1.35;
  let cursorX = viewW * 0.5 - metrics.total / 2;
  for (let i = 0; i < chars.length; i++) {
    const charX = cursorX;
    const ch = chars[i];
    const cw = metrics.ws[i];
    if (ch !== ' ') {
      const zId = nextZoneId++;
      registerZone(
        zId,
        groupId,
        charX - charPad,
        textY - charBoxH * 0.5,
        cw + charPad * 2,
        charBoxH,
        (c) => {
          c.fillStyle = '#000000';
          c.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
          c.textBaseline = 'middle';
          c.textAlign = 'left';
          c.fillText(ch, charX, textY);
        }
      );
    }
    cursorX += cw + metrics.ls;
  }
  return nextZoneId;
}

function drawVectorHeaderGlyph(c, ch, gx, gy) {
  c.strokeStyle = '#000000';
  c.fillStyle = '#000000';
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  if (ch === '0') {
    c.roundRect(gx - 5.5, gy - 9, 11, 18, 5.5);
    c.stroke();
  } else if (ch === '1') {
    c.moveTo(gx - 3.5, gy - 5);
    c.lineTo(gx + 0.5, gy - 9);
    c.lineTo(gx + 0.5, gy + 9);
    c.moveTo(gx - 4, gy + 9);
    c.lineTo(gx + 4.5, gy + 9);
    c.stroke();
  } else if (ch === '2') {
    c.arc(gx, gy - 4, 5.2, Math.PI * 1.08, Math.PI * 0.18, false);
    c.lineTo(gx - 5.5, gy + 9);
    c.lineTo(gx + 5.5, gy + 9);
    c.stroke();
  } else if (ch === '3') {
    c.arc(gx, gy - 4.3, 4.5, -Math.PI * 0.85, Math.PI * 0.5, false);
    c.arc(gx, gy + 4.3, 4.7, -Math.PI * 0.5, Math.PI * 0.85, false);
    c.stroke();
  } else if (ch === '4') {
    c.moveTo(gx + 2.8, gy + 9);
    c.lineTo(gx + 2.8, gy - 9);
    c.lineTo(gx - 5.8, gy + 3.2);
    c.lineTo(gx + 5.8, gy + 3.2);
    c.stroke();
  } else if (ch === '/') {
    c.moveTo(gx - 4.5, gy + 9.5);
    c.lineTo(gx + 4.5, gy - 9.5);
    c.stroke();
  }
}

/**
 * Disegna la "vera pagina" composta interamente da particelle e le nuove icone interattive
 * organizzate in compartimenti indipendenti ad altissima definizione.
 */

function pickZoneAnchor(zoneId) {
  const zone = zones[zoneId];
  if (!zone || zone.pixels.length === 0) {
    return { x: layoutBounds.cx, y: layoutBounds.cy };
  }
  const pt = zone.pixels[Math.floor(Math.random() * zone.pixels.length)];
  return {
    x: pt.x + (Math.random() - 0.5) * 0.8,
    y: pt.y + (Math.random() - 0.5) * 0.8,
  };
}

function pickStratifiedAnchor(zoneId, slotIdx, slotTotal) {
  const zone = zones[zoneId];
  if (!zone || zone.pixels.length === 0) {
    return { x: layoutBounds.cx, y: layoutBounds.cy };
  }
  const len = zone.pixels.length;
  const total = Math.max(1, slotTotal);
  const jitter = zone.isButtonUi || zone.isThermoPreview ? 0.35 : 0.75;
  const u = (slotIdx + 0.5 + (Math.random() - 0.5) * 0.45) / total;
  const pxIdx = clamp(Math.floor(u * len), 0, len - 1);
  const pt = zone.pixels[pxIdx];
  return {
    x: pt.x + (Math.random() - 0.5) * jitter,
    y: pt.y + (Math.random() - 0.5) * jitter,
  };
}

function mortonKey(x, y) {
  const xi = clamp(Math.floor((x / Math.max(1, viewW)) * 1023), 0, 1023);
  const yi = clamp(Math.floor((y / Math.max(1, viewH)) * 1023), 0, 1023);
  let m = 0;
  for (let b = 0; b < 10; b++) {
    m |= ((xi >> b) & 1) << (2 * b + 1);
    m |= ((yi >> b) & 1) << (2 * b);
  }
  return m;
}

/**
 * Distribuisce gli indici di particelle tra le zone ammesse in esatta proporzione
 * alle quote targetCount, abbinando ogni particella al bersaglio più vicino (Morton + 2-opt).
 */
function assignWeightedGoals(particleIndices, allowedZones, customQuotas = null, spatialMatch = true) {
  const pCount = particleIndices.length;
  if (pCount === 0 || allowedZones.length === 0) return;

  const validZones = [];
  const rawWeights = [];
  let weightSum = 0;
  for (let i = 0; i < allowedZones.length; i++) {
    const zId = allowedZones[i];
    const zn = zones[zId];
    if (!zn || zn.pixels.length === 0) continue;
    const w = customQuotas ? Math.max(0, customQuotas.get(zId) || 0) : Math.max(0.01, zn.targetCount || zn.area || 1);
    validZones.push(zId);
    rawWeights.push(w);
    weightSum += w;
  }
  if (validZones.length === 0) return;
  if (weightSum <= 0) {
    weightSum = validZones.length;
    for (let i = 0; i < rawWeights.length; i++) rawWeights[i] = 1;
  }

  const intQuotas = new Int32Array(validZones.length);
  const remainders = [];
  let assigned = 0;
  for (let i = 0; i < validZones.length; i++) {
    const exact = (rawWeights[i] / weightSum) * pCount;
    const base = Math.floor(exact);
    intQuotas[i] = base;
    assigned += base;
    remainders.push({ i, rem: exact - base });
  }
  remainders.sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < pCount - assigned; k++) {
    intQuotas[remainders[k % remainders.length].i]++;
  }

  const slots = [];
  for (let i = 0; i < validZones.length; i++) {
    const zId = validZones[i];
    const zn = zones[zId];
    const q = intQuotas[i];
    const isThermoPrev = Boolean(zn && zn.isThermoPreview && zn.previewBounds);
    if (isThermoPrev) {
      const gasCount = Math.round(q * 0.34);
      const wallCount = Math.max(1, q - gasCount);
      for (let s = 0; s < wallCount; s++) {
        const anc = pickStratifiedAnchor(zId, s, wallCount);
        slots.push({ zId, x: anc.x, y: anc.y, innerGas: false, mKey: spatialMatch ? mortonKey(anc.x, anc.y) : 0 });
      }
      const pb = zn.previewBounds;
      const pad = 11;
      for (let s = 0; s < gasCount; s++) {
        const ax = pb.x + pad + Math.random() * Math.max(8, pb.w - pad * 2);
        const ay = pb.y + pad + Math.random() * Math.max(8, pb.h - pad * 2);
        slots.push({ zId, x: ax, y: ay, innerGas: true, mKey: spatialMatch ? mortonKey(ax, ay) : 0 });
      }
    } else {
      for (let s = 0; s < q; s++) {
        const anc = pickStratifiedAnchor(zId, s, q);
        slots.push({ zId, x: anc.x, y: anc.y, innerGas: false, mKey: spatialMatch ? mortonKey(anc.x, anc.y) : 0 });
      }
    }
  }

  if (spatialMatch && pCount > 1) {
    // Mescola casualmente gli slot della stessa zona e aggiunge jitter spaziale al codice Morton:
    // le particelle arrivano dal posto vicino ma ognuna con traiettoria indipendente, mai "in blocco"
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = slots[i];
      slots[i] = slots[j];
      slots[j] = tmp;
    }
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      const zn = zones[s.zId];
      const jx = (zn ? zn.cx : s.x) + (Math.random() - 0.5) * 90;
      const jy = (zn ? zn.cy : s.y) + (Math.random() - 0.5) * 90;
      s.mKey = mortonKey(jx, jy);
    }

    const pWrapped = new Array(pCount);
    for (let k = 0; k < pCount; k++) {
      const pIdx = particleIndices[k];
      const p = particles[pIdx];
      const jx = p.x + (Math.random() - 0.5) * 90;
      const jy = p.y + (Math.random() - 0.5) * 90;
      pWrapped[k] = { pIdx, x: p.x, y: p.y, mKey: mortonKey(jx, jy) };
    }
    pWrapped.sort((a, b) => a.mKey - b.mKey);
    slots.sort((a, b) => a.mKey - b.mKey);

    for (let k = 0; k < pCount; k++) {
      const p = particles[pWrapped[k].pIdx];
      const slot = slots[k];
      if (!p || !slot) continue;
      p.goalZone = slot.zId;
      p.anchorX = slot.x;
      p.anchorY = slot.y;
      p.thermoPreviewInner = Boolean(slot.innerGas);
    }
    return;
  }

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
  }

  for (let k = 0; k < pCount; k++) {
    const p = particles[particleIndices[k]];
    const slot = slots[k];
    if (!p || !slot) continue;
    p.goalZone = slot.zId;
    p.anchorX = slot.x;
    p.anchorY = slot.y;
    p.thermoPreviewInner = Boolean(slot.innerGas);
  }
}

/**
 * Sceglie una nuova zona bersaglio privilegiando nettamente le zone più vicine (1/d²)
 * pesate sul deficit reale, così le particelle arrivano dal posto più vicino.
 */
function pickWeightedHungryZone(px, py, excludeZone = 0) {
  const zoneCount = zones.length;
  if (zoneCount <= 1) return 1;
  const candidates = [];
  let totalWeight = 0;
  for (let z = 1; z < zoneCount; z++) {
    if (z === excludeZone) continue;
    const zn = zones[z];
    if (!zn || zn.pixels.length === 0) continue;
    const deficit = Math.max(0, zn.targetCount - zn.currentCount);
    if (deficit <= 0.15) continue;
    const dist = Math.hypot(zn.cx - px, zn.cy - py);
    const dScale = dist * 0.65 + 24;
    const w = deficit / (dScale * dScale);
    candidates.push(z, w);
    totalWeight += w;
  }
  if (totalWeight > 0) {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i += 2) {
      r -= candidates[i + 1];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 2];
  }
  let bestZ = 1;
  let bestScore = -Infinity;
  for (let z = 1; z < zoneCount; z++) {
    if (z === excludeZone) continue;
    const zn = zones[z];
    if (!zn || zn.pixels.length === 0) continue;
    const dist = Math.hypot(zn.cx - px, zn.cy - py);
    const sc = zn.charge - dist * 0.0008;
    if (sc > bestScore) {
      bestScore = sc;
      bestZ = z;
    }
  }
  return bestZ;
}

function assignSingleGoal(p, targetZ) {
  p.goalZone = targetZ;
  const tZone = zones[targetZ];
  p.thermoPreviewInner = Boolean(tZone && tZone.isThermoPreview && tZone.previewBounds && p.expelRank < 0.36);
  if (p.thermoPreviewInner) {
    const pb = tZone.previewBounds;
    p.anchorX = pb.x + 11 + Math.random() * Math.max(8, pb.w - 22);
    p.anchorY = pb.y + 11 + Math.random() * Math.max(8, pb.h - 22);
  } else {
    const anc = pickZoneAnchor(targetZ);
    p.anchorX = anc.x;
    p.anchorY = anc.y;
  }
}

/**
 * Crea una particella anonima con caratteristiche fisiche e tempistiche proprie.
 */
function createParticle(startX, startY) {
  const initialZone = 1 + Math.floor(Math.random() * Math.max(1, zones.length - 1));
  const anchor = pickZoneAnchor(initialZone);
  // Asse orbitale 3D individuale per formare una sfera caotica attorno al buco nero
  const cosPhi = 2 * Math.random() - 1;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const theta = Math.random() * Math.PI * 2;
  return {
    x: startX,
    y: startY,
    z: 0,
    zHome: (Math.random() - 0.5) * 10,
    vx: 0,
    vy: 0,
    vz: 0,
    bhNx: sinPhi * Math.cos(theta),
    bhNy: sinPhi * Math.sin(theta),
    bhNz: cosPhi,
    goalZone: initialZone,
    anchorX: anchor.x,
    anchorY: anchor.y,
    currentZone: 0,
    sizeFactor: 0.80 + Math.random() * 0.36,
    shadeBase: 6 + Math.floor(Math.random() * 22),
    alphaBase: 0.82 + Math.random() * 0.17,
    expelRank: Math.random(),
    fluidFringe: Math.random() >= 0.94,
    mobility: 0.86 + Math.random() * 0.30,
    burstDrag: 0.945 + Math.random() * 0.025,
    returnDelay: 350 + Math.random() * 1950,
    returnDuration: 850 + Math.random() * 1350,
    magneticWake: 1,
    splitScale: 1,
  };
}

/**
 * Allinea il numero di particelle tramite sdoppiamento (mitosi); in eccesso si fonderanno per collisione locale.
 */
function syncParticleCount(recreateAll) {
  const targetCount = effectiveParticleCount;
  const { cx, cy } = layoutBounds;

  if (recreateAll || particles.length === 0) {
    particles = [];
    for (let i = 0; i < targetCount; i++) {
      particles.push(createParticle(cx, cy));
    }
    reassignParticleGoals();
    return;
  }

  if (particles.length < targetCount) {
    const existingCount = particles.length;
    const newIndices = [];
    const goalCounts = new Int32Array(zones.length);
    for (let i = 0; i < existingCount; i++) {
      const gz = particles[i].goalZone;
      if (gz > 0 && gz < zones.length) goalCounts[gz]++;
    }
    let idx = 0;
    while (particles.length < targetCount) {
      const parent = particles[(idx * 13) % existingCount];
      idx++;
      const p = createParticle(parent.x, parent.y);
      p.z = parent.z;
      p.zHome = parent.zHome;
      p.splitScale = 0.45;
      const a = Math.random() * Math.PI * 2;
      const kick = 0.55;
      p.vx = parent.vx + Math.cos(a) * kick;
      p.vy = parent.vy + Math.sin(a) * kick;
      p.vz = parent.vz + (Math.random() - 0.5) * 0.4;
      parent.vx -= Math.cos(a) * kick * 0.4;
      parent.vy -= Math.sin(a) * kick * 0.4;
      newIndices.push(particles.length);
      particles.push(p);
    }

    const validZones = [];
    const deficitMap = new Map();
    for (let z = 1; z < zones.length; z++) {
      if (!zones[z] || zones[z].pixels.length === 0) continue;
      validZones.push(z);
      deficitMap.set(z, Math.max(0.25, zones[z].targetCount - goalCounts[z]));
    }
    assignWeightedGoals(newIndices, validZones, deficitMap);
  }

  shNext = new Int32Array(particles.length);
}

function reassignParticleGoals(spatialMatch = true) {
  const validZones = [];
  for (let z = 1; z < zones.length; z++) {
    if (zones[z] && zones[z].pixels.length > 0) validZones.push(z);
  }
  if (validZones.length === 0 || particles.length === 0) return;

  const activeTotal = Math.min(particles.length, Math.max(1, effectiveParticleCount));
  const activeIndices = [];
  for (let i = 0; i < activeTotal; i++) {
    activeIndices.push(i);
  }
  assignWeightedGoals(activeIndices, validZones, null, spatialMatch);

  if (particles.length > activeTotal) {
    const extraIndices = [];
    for (let i = activeTotal; i < particles.length; i++) {
      extraIndices.push(i);
    }
    assignWeightedGoals(extraIndices, validZones, null, spatialMatch);
  }
}

function makeSoftDot(hx, hy, r, extra = null) {
  return Object.assign(
    {
      x: hx + (Math.random() - 0.5) * 6,
      y: hy + (Math.random() - 0.5) * 6,
      vx: 0,
      vy: 0,
      hx,
      hy,
      r,
      fringe: false,
      springK: 0.16 + Math.random() * 0.08,
      jitter: 0.08 + Math.random() * 0.05,
      phase: Math.random() * Math.PI * 2,
    },
    extra || {}
  );
}

function buildKnobDots(radiusScale = 1, isFringeHeavy = true) {
  const arr = [];
  // Anello morbido (non definito al 100%) con ~20 particelle perimetrali + nucleo centrale + 4 particelle fluide esterne
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const rad = (9.2 + (Math.random() - 0.5) * 1.8) * radiusScale;
    const isLoose = i % 5 === 0;
    arr.push({
      relX: Math.cos(a) * rad,
      relY: Math.sin(a) * rad,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: isLoose ? 1.05 : 1.25,
      springK: isLoose ? 0.085 : 0.15 + Math.random() * 0.06,
      jitter: isLoose ? 0.19 : 0.08,
      fringe: isLoose,
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const rad = i === 0 ? 0 : 4.1 * radiusScale;
    arr.push({
      relX: Math.cos(a) * rad,
      relY: Math.sin(a) * rad,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: i === 0 ? 1.45 : 1.05,
      springK: 0.14,
      jitter: 0.09,
      fringe: false,
    });
  }
  if (isFringeHeavy) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = (12.8 + Math.random() * 3.5) * radiusScale;
      arr.push({
        relX: Math.cos(a) * rad,
        relY: Math.sin(a) * rad,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0.95,
        springK: 0.055,
        jitter: 0.24,
        fringe: true,
      });
    }
  }
  return arr;
}

function collectMatrixTargets(text, centerX, centerY, dotPitch) {
  const str = String(text).toUpperCase();
  const charW = 5 * dotPitch;
  const gap = 2 * dotPitch;
  const totalW = str.length * charW + Math.max(0, str.length - 1) * gap;
  let xStart = centerX - totalW * 0.5;
  const yStart = centerY - 3 * dotPitch;
  const pts = [];
  for (let c = 0; c < str.length; c++) {
    const ch = str[c];
    const glyph = DOT_GLYPHS[ch] || DOT_GLYPHS[' '];
    const isKelvinPart = c < str.indexOf('·');
    for (let row = 0; row < 7; row++) {
      const line = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === '1') {
          pts.push({
            x: xStart + col * dotPitch,
            y: yStart + row * dotPitch,
            isKelvin: isKelvinPart,
            isDot: ch === '·',
          });
        }
      }
    }
    xStart += charW + gap;
  }
  return pts;
}

function stepSoftParticleToTarget(d, tx, ty, jitterAmt, dtStep, extraAx = 0, extraAy = 0) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dist = Math.hypot(dx, dy);
  if (d.colorWarmup !== undefined && d.colorWarmup < 1) {
    d.colorWarmup = Math.min(1, d.colorWarmup + (dist < 24 ? 0.045 : 0.015) * dtStep);
  }
  if (dist > 14) {
    const travelSpd = clamp(dist * 0.045, 1.4, 5.2);
    const desVx = (dx / dist) * travelSpd;
    const desVy = (dy / dist) * travelSpd;
    d.vx += (desVx - d.vx) * 0.14 * dtStep;
    d.vy += (desVy - d.vy) * 0.14 * dtStep;
    d.x += d.vx * dtStep;
    d.y += d.vy * dtStep;
  } else {
    const damp = Math.pow(0.84, dtStep);
    const ax = dx * (d.springK || 0.15) + (Math.random() - 0.5) * jitterAmt + extraAx;
    const ay = dy * (d.springK || 0.15) + (Math.random() - 0.5) * jitterAmt + extraAy;
    d.vx = (d.vx + ax * dtStep) * damp;
    d.vy = (d.vy + ay * dtStep) * damp;
    d.x += d.vx * dtStep;
    d.y += d.vy * dtStep;
  }
}

function stepTrackDots(dots, knobX, sliderY, dtStep) {
  const repRad = 13.5;
  const repRadSq = repRad * repRad;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    let pushX = 0;
    let pushY = 0;
    const rx = d.x - knobX;
    const ry = d.y - sliderY;
    const distSq = rx * rx + ry * ry;
    if (distSq > 0.01 && distSq < repRadSq) {
      const dist = Math.sqrt(distSq);
      const push = (1 - dist / repRad) * 0.92;
      pushX = (rx / dist) * push;
      pushY = (ry / dist) * push;
    }
    stepSoftParticleToTarget(d, d.hx, d.hy, d.jitter, dtStep, pushX, pushY);
  }
}

function stepKnobDots(dots, knobX, sliderY, isActive, dtStep) {
  const scale = isActive ? 1.08 : 1.0;
  const jitterMul = isActive ? 1.45 : 1.0;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    stepSoftParticleToTarget(
      d,
      knobX + d.relX * scale,
      sliderY + d.relY * scale,
      d.jitter * jitterMul,
      dtStep
    );
  }
}

function stepCornerDots(btn, hovered, dtStep) {
  const hoverBoost = hovered ? 1.6 : 1.0;
  const scale = hovered ? 1.08 : 1.0;
  for (let i = 0; i < btn.dots.length; i++) {
    const d = btn.dots[i];
    stepSoftParticleToTarget(
      d,
      btn.x + (d.hx - btn.x) * scale,
      btn.y + (d.hy - btn.y) * scale,
      d.jitter * hoverBoost,
      dtStep
    );
  }
}

function stepMorphHudArray(dots, dtStep) {
  const hudDamp = Math.pow(0.79, dtStep);
  let anyFused = false;
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    d.colorMix += ((d.targetColorMix ?? 0) - (d.colorMix ?? 0)) * 0.14 * dtStep;
    if (d.colorWarmup !== undefined && d.colorWarmup < 1) {
      d.colorWarmup = Math.min(1, d.colorWarmup + 0.022 * dtStep);
    }
    if (d.scale < 1) d.scale = Math.min(1, d.scale + 0.08 * dtStep);
    else if (d.scale > 1) d.scale = Math.max(1, d.scale - 0.04 * dtStep);

    if (d.mergeTarget) {
      const tgt = d.mergeTarget;
      const mdx = tgt.x - d.x;
      const mdy = tgt.y - d.y;
      const dist = Math.hypot(mdx, mdy);
      if (dist <= 2.3) {
        d.mergedDead = true;
        tgt.scale = 1.24;
        anyFused = true;
        continue;
      }
      const pull = clamp(dist * 0.22, 0.9, 3.8);
      d.vx = (d.vx + (mdx / dist) * pull * dtStep) * hudDamp;
      d.vy = (d.vy + (mdy / dist) * pull * dtStep) * hudDamp;
      d.x += d.vx * dtStep;
      d.y += d.vy * dtStep;
    } else {
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 14) {
        const travelSpd = clamp(dist * 0.048, 1.4, 5.2);
        d.vx += ((dx / dist) * travelSpd - d.vx) * 0.15 * dtStep;
        d.vy += ((dy / dist) * travelSpd - d.vy) * 0.15 * dtStep;
        d.x += d.vx * dtStep;
        d.y += d.vy * dtStep;
      } else {
        d.vx = (d.vx + dx * 0.22 * dtStep + (Math.random() - 0.5) * 0.04) * hudDamp;
        d.vy = (d.vy + dy * 0.22 * dtStep + (Math.random() - 0.5) * 0.04) * hudDamp;
        d.x += d.vx * dtStep;
        d.y += d.vy * dtStep;
      }
    }
  }
  return anyFused ? dots.filter((d) => !d.mergedDead) : dots;
}

function morphMatrixHudDots(dots, targets, fallbackY, forceSnap) {
  if (forceSnap && dots.length === 0) {
    for (let t = 0; t < targets.length; t++) {
      const tgt = targets[t];
      dots.push({
        x: tgt.x,
        y: tgt.y,
        vx: 0,
        vy: 0,
        tx: tgt.x,
        ty: tgt.y,
        scale: 1,
        colorMix: tgt.isKelvin ? 1 : 0,
        targetColorMix: tgt.isKelvin ? 1 : 0,
        isDot: tgt.isDot,
        mergeTarget: null,
        mergedDead: false,
      });
    }
    return;
  }

  for (let d = 0; d < dots.length; d++) {
    dots[d].mergeTarget = null;
    dots[d].mergedDead = false;
  }

  const usedDot = new Uint8Array(dots.length);
  const usedTarget = new Uint8Array(targets.length);
  const survivors = [];

  const matchCount = Math.min(dots.length, targets.length);
  for (let t = 0; t < targets.length && survivors.length < matchCount; t++) {
    const tgt = targets[t];
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let d = 0; d < dots.length; d++) {
      if (usedDot[d]) continue;
      const dx = dots[d].x - tgt.x;
      const dy = dots[d].y - tgt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = d;
        if (d2 < 0.8) break;
      }
    }
    if (bestIdx !== -1) {
      usedDot[bestIdx] = 1;
      usedTarget[t] = 1;
      const dot = dots[bestIdx];
      dot.tx = tgt.x;
      dot.ty = tgt.y;
      dot.isDot = tgt.isDot;
      dot.targetColorMix = tgt.isKelvin ? 1 : 0;
      survivors.push(dot);
    }
  }

  for (let t = 0; t < targets.length; t++) {
    if (usedTarget[t]) continue;
    const tgt = targets[t];
    let parent = dots.length > 0 ? dots[0] : null;
    let bestD2 = Infinity;
    for (let d = 0; d < dots.length; d++) {
      const dx = dots[d].x - tgt.x;
      const dy = dots[d].y - tgt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        parent = dots[d];
      }
    }
    const px = parent ? parent.x : viewW * 0.5;
    const py = parent ? parent.y : fallbackY;
    const ang = Math.atan2(tgt.y - py, tgt.x - px) + (Math.random() - 0.5) * 0.8;
    const child = {
      x: px,
      y: py,
      vx: Math.cos(ang) * 0.9,
      vy: Math.sin(ang) * 0.9,
      tx: tgt.x,
      ty: tgt.y,
      scale: 0.45,
      colorMix: parent ? parent.colorMix : tgt.isKelvin ? 1 : 0,
      targetColorMix: tgt.isKelvin ? 1 : 0,
      isDot: tgt.isDot,
      mergeTarget: null,
      mergedDead: false,
    };
    if (parent) {
      parent.vx -= Math.cos(ang) * 0.35;
      parent.vy -= Math.sin(ang) * 0.35;
    }
    dots.push(child);
  }

  if (survivors.length > 0) {
    for (let d = 0; d < dots.length; d++) {
      if (usedDot[d] || d >= usedDot.length) continue;
      const excess = dots[d];
      let bestS = survivors[0];
      let bestD2 = Infinity;
      for (let s = 0; s < survivors.length; s++) {
        const sv = survivors[s];
        const dx = sv.x - excess.x;
        const dy = sv.y - excess.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestS = sv;
        }
      }
      excess.mergeTarget = bestS;
    }
  }
}


function buildCornerControlDots() {
  const padX = clamp(viewW * 0.055, 28, 70);
  const padY = clamp(viewH * 0.075, 30, 56);
  const topY = padY + 14;
  const backX = padX + 20;
  const seedX = viewW - padX - 20;

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
  return {
    backBtn: { x: backX, y: topY, r: 26, dots: backDots },
    seedBtn: { x: seedX, y: topY, r: 26, dots: seedDots },
    topY,
  };
}

function sampleDistanceField(x, y) {
  const gx = clamp(Math.floor(x / DF_SCALE), 1, dfW - 2);
  const gy = clamp(Math.floor(y / DF_SCALE), 1, dfH - 2);
  const idx = gy * dfW + gx;

  const distPx = dfDist[idx] * (DF_SCALE / 3);
  const nearestZone = dfZone[idx];

  const dx = dfDist[idx + 1] - dfDist[idx - 1];
  const dy = dfDist[idx + dfW] - dfDist[idx - dfW];
  const len = Math.hypot(dx, dy);

  return {
    distPx,
    nearestZone,
    inwardX: len > 0.001 ? -dx / len : 0,
    inwardY: len > 0.001 ? -dy / len : 0,
  };
}

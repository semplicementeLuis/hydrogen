// ============================================================================
// SEZIONE HERO & MENU — Big Bang, Singolarità, Parola HYDROGEN e Menu 01..04
// ============================================================================
"use strict";

function buildPageLayoutMask(registerZone, startZoneId) {
  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const isCompact = viewW < 720;
  const padX = clamp(viewW * 0.055, 28, 70);
  const padY = clamp(viewH * 0.075, 30, 56);
  let nextZoneId = startZoneId;

  const TAB_DIGIT = { THERMO: '1', SPECTRUM: '2', POLARITY: '3', HORIZON: '4' };
  const topY = padY + 14;

  // 1. Icona Top-Left (groupId = 10, compartimento TOP_BACK): Torna a HYDROGEN
  const backX = padX + 20;
  const backY = topY;
  interactiveButtons.push({
    groupId: 10,
    x: backX,
    y: backY,
    r: 26,
    label: 'Torna a HYDROGEN',
    action: 'RETURN_HERO',
  });
  const backZId = nextZoneId++;
  registerZone(backZId, 10, backX - 24, backY - 24, 48, 48, (c) => {
    c.strokeStyle = '#000000';
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(backX + 6, backY - 12);
    c.lineTo(backX - 8, backY);
    c.lineTo(backX + 6, backY + 12);
    c.stroke();
    c.fillStyle = '#000000';
    c.beginPath();
    c.arc(backX + 12, backY, 2.8, 0, Math.PI * 2);
    c.fill();
  });
  if (zones[backZId]) {
    zones[backZId].isCrispUi = true;
    zones[backZId].isButtonUi = true;
    zones[backZId].compartment = 'TOP_BACK';
  }

  // 2. Icona Top-Right (groupId = 15, compartimento TOP_SEED): Singolarità iniziale
  const seedX = viewW - padX - 20;
  const seedY = topY;
  interactiveButtons.push({
    groupId: 15,
    x: seedX,
    y: seedY,
    r: 26,
    label: 'Riavvolgi nella singolarità iniziale',
    action: 'IMPLODE_SEED',
  });
  const seedZId = nextZoneId++;
  registerZone(seedZId, 15, seedX - 26, seedY - 26, 52, 52, (c) => {
    c.strokeStyle = '#000000';
    c.fillStyle = '#000000';
    c.lineWidth = 2.6;
    c.beginPath();
    c.arc(seedX, seedY, 16.5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(seedX, seedY, 3.2, 0, Math.PI * 2);
    c.fill();
  });
  if (zones[seedZId]) {
    zones[seedZId].isCrispUi = true;
    zones[seedZId].isButtonUi = true;
    zones[seedZId].compartment = 'TOP_SEED';
  }

  // 3. Indice capitolo in alto al centro: '0', '1..4', '/', '0', '4' in posizioni tabulari fisse
  //    Solo la seconda cifra ('TOP_DIGIT') si riordina quando cambi sezione; il resto resta immobile.
  const headerGlyphs = [
    { ch: '0', dx: -36, comp: 'TOP_CHAR_0', gId: 18 },
    { ch: TAB_DIGIT[activePageTab] || '1', dx: -20, comp: 'TOP_DIGIT', gId: 17 },
    { ch: '/', dx: 0, comp: 'TOP_CHAR_SLASH', gId: 18 },
    { ch: '0', dx: 20, comp: 'TOP_CHAR_0B', gId: 18 },
    { ch: '4', dx: 36, comp: 'TOP_CHAR_4', gId: 18 },
  ];
  for (let g = 0; g < headerGlyphs.length; g++) {
    const hg = headerGlyphs[g];
    const gx = cx + hg.dx;
    const gy = topY;
    const gzId = nextZoneId++;
    registerZone(gzId, hg.gId, gx - 10, gy - 14, 20, 28, (c) => {
      drawVectorHeaderGlyph(c, hg.ch, gx, gy);
    });
    if (zones[gzId]) {
      zones[gzId].isCrispUi = true;
      zones[gzId].isButtonUi = true;
      zones[gzId].compartment = hg.comp;
    }
  }

  // 4. Dock inferiore: 4 icone interne fisse (BOTTOM_ICON_0..3) + anello attivo mobile (BOTTOM_RING)
  const menuY = viewH - clamp(viewH * 0.095, 48, 72);
  const menuGap = isCompact ? clamp(viewW * 0.19, 68, 86) : clamp(viewW * 0.095, 88, 118);
  const iconSpecs = [
    { tab: 'THERMO', groupId: 11, label: '01 Thermo — Camera Termodinamica', x: cx - menuGap * 1.5, y: menuY },
    { tab: 'SPECTRUM', groupId: 12, label: '02 Spectrum — Serie di Balmer', x: cx - menuGap * 0.5, y: menuY },
    { tab: 'POLARITY', groupId: 13, label: '03 Polarity — Campi Magnetici', x: cx + menuGap * 0.5, y: menuY },
    { tab: 'HORIZON', groupId: 14, label: '04 Horizon — Redshift Relativistico', x: cx + menuGap * 1.5, y: menuY },
  ];

  for (let s = 0; s < iconSpecs.length; s++) {
    const spec = iconSpecs[s];
    const isActive = activePageTab === spec.tab;
    interactiveButtons.push({
      groupId: spec.groupId,
      x: spec.x,
      y: spec.y,
      r: 32,
      label: spec.label,
      action: 'SWITCH_TAB',
      tab: spec.tab,
    });

    const menuZId = nextZoneId++;
    registerZone(menuZId, spec.groupId, spec.x - 36, spec.y - 36, 72, 72, (c) => {
      c.strokeStyle = '#000000';
      c.fillStyle = '#000000';
      c.lineCap = 'round';
      c.lineJoin = 'round';

      if (isActive) {
        c.lineWidth = 3.0;
        c.beginPath();
        c.arc(spec.x, spec.y, 29, 0, Math.PI * 2);
        c.stroke();
      }

      c.lineWidth = 3.0;
      if (spec.tab === 'THERMO') {
        // Termometro stilizzato pulito e ben spaziato: bulbo + colonna + 3 tacche graduate
        const stemX = spec.x - 3.5;
        c.lineWidth = 3.4;
        c.beginPath();
        c.moveTo(stemX, spec.y - 12.5);
        c.lineTo(stemX, spec.y + 4.5);
        c.stroke();
        c.beginPath();
        c.arc(stemX, spec.y + 8.5, 5.2, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 2.6;
        const tickYs = [-10.5, -4.5, 1.5];
        for (let t = 0; t < tickYs.length; t++) {
          c.beginPath();
          c.moveTo(spec.x + 4.5, spec.y + tickYs[t]);
          c.lineTo(spec.x + 11, spec.y + tickYs[t]);
          c.stroke();
        }
      } else if (spec.tab === 'SPECTRUM') {
        const offsets = [-11.5, -4, 3.8, 11.5];
        c.lineWidth = 3.1;
        for (let b = 0; b < 4; b++) {
          c.beginPath();
          c.moveTo(spec.x + offsets[b], spec.y - 13);
          c.lineTo(spec.x + offsets[b], spec.y + 13);
          c.stroke();
        }
      } else if (spec.tab === 'POLARITY') {
        c.lineWidth = 2.9;
        c.beginPath();
        c.arc(spec.x - 9, spec.y, 4.4, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(spec.x + 9, spec.y, 4.4, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 2.8;
        c.beginPath();
        c.arc(spec.x, spec.y, 14.5, -Math.PI * 0.80, -Math.PI * 0.20);
        c.stroke();
        c.beginPath();
        c.arc(spec.x, spec.y, 14.5, Math.PI * 0.20, Math.PI * 0.80);
        c.stroke();
      } else {
        c.lineWidth = 3.0;
        c.beginPath();
        c.arc(spec.x, spec.y, 15, 0.28, Math.PI - 0.28);
        c.stroke();
        c.beginPath();
        c.arc(spec.x, spec.y, 15, Math.PI + 0.28, Math.PI * 2 - 0.28);
        c.stroke();
        c.beginPath();
        c.arc(spec.x, spec.y, 3.8, 0, Math.PI * 2);
        c.fill();
      }
    });
    if (zones[menuZId]) {
      zones[menuZId].isActiveMenu = isActive;
      zones[menuZId].isButtonUi = true;
      zones[menuZId].compartment = 'BOTTOM';
      zones[menuZId].bottomTab = spec.tab;
    }
  }

  // 5. Area centrale menu delle 4 camere fisiche (compartimento CENTER) + pulsante ▶ (compartimento PLAY)
  const boxW = clamp(viewW * (isCompact ? 0.84 : 0.56), 270, 660);
  const titleSize = clamp(viewW * 0.078, 44, 96);
  const contentCy = cy - clamp(viewH * 0.04, 16, 36);
  const headerY = Math.max(topY + 68, contentCy - clamp(viewH * 0.21, 106, 158));
  const bodyY = contentCy + (isCompact ? 10 : 18);

  const centerStartZ = nextZoneId;
  nextZoneId = drawParticleTextZones(registerZone, nextZoneId, activePageTab, headerY, titleSize, 1);

  if (activePageTab === 'THERMO') {
    // Anteprima THERMO: scatoletta sottile di pallini mobili, completa su tutti i 4 lati, con sole molecole colorate dentro
    const miniW = isCompact ? 136 : 168;
    const miniH = isCompact ? 92 : 108;
    const miniX = cx - miniW * 0.5;
    const miniY = bodyY - miniH * 0.5 - 12;
    const miniZId = nextZoneId++;
    registerZone(miniZId, 20, miniX - 10, miniY - 10, miniW + 20, miniH + 20, (c) => {
      c.strokeStyle = '#000000';
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.roundRect(miniX, miniY, miniW, miniH, 6);
      c.stroke();
    });
    if (zones[miniZId]) {
      zones[miniZId].isThermoPreview = true;
      zones[miniZId].previewBounds = { x: miniX, y: miniY, w: miniW, h: miniH };
    }
  } else if (activePageTab === 'SPECTRUM') {
    // Anteprima SPECTRUM: le 4 righe spettrali reali di Balmer posizionate alle relative λ
    const spanW = boxW * 0.78;
    const startX = cx - spanW * 0.5;
    const barH = isCompact ? 104 : 132;
    const specY = bodyY - 22;
    const barW = 13;
    for (let b = 0; b < BALMER_LINES.length; b++) {
      const bx = startX + BALMER_LINES[b].u * spanW;
      registerZone(nextZoneId++, 1, bx - barW, specY - barH * 0.5 - 10, barW * 2, barH + 20, (c) => {
        c.fillStyle = '#000000';
        c.beginPath();
        c.roundRect(bx - barW * 0.5, specY - barH * 0.5, barW, barH, barW * 0.5);
        c.fill();
      });
    }
    const capY = specY + barH * 0.5 + 20;
    registerZone(nextZoneId++, 1, cx - boxW * 0.3, capY - 8, boxW * 0.6, 26, (c) => {
      c.fillStyle = '#000000';
      c.beginPath();
      c.roundRect(cx - boxW * 0.26, capY, boxW * 0.52, 10, 5);
      c.fill();
    });
  } else if (activePageTab === 'POLARITY') {
    // Anteprima POLARITY: dipolo magnetico con linee di flusso simmetriche + due poli (+/-)
    const dipY = bodyY - 14;
    const poleDx = isCompact ? 46 : 64;
    registerZone(nextZoneId++, 1, cx - poleDx - 48, dipY - 68, (poleDx + 48) * 2, 136, (c) => {
      c.strokeStyle = '#000000';
      c.fillStyle = '#000000';
      c.beginPath();
      c.arc(cx - poleDx, dipY, 16, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 7;
      c.beginPath();
      c.arc(cx + poleDx, dipY, 15, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 6;
      c.beginPath();
      c.ellipse(cx, dipY, poleDx + 18, 48, 0, 0.32, Math.PI - 0.32);
      c.stroke();
      c.beginPath();
      c.ellipse(cx, dipY, poleDx + 18, 48, 0, Math.PI + 0.32, Math.PI * 2 - 0.32);
      c.stroke();
    });
  } else {
    // Anteprima HORIZON: disco di accrescimento relativistico + singolarità centrale
    const maxR = isCompact ? 62 : clamp(boxW * 0.15, 70, 92);
    const ringY = bodyY - 16;
    registerZone(nextZoneId++, 1, cx - maxR - 14, ringY - maxR - 14, (maxR + 14) * 2, (maxR + 14) * 2, (c) => {
      c.strokeStyle = '#000000';
      c.fillStyle = '#000000';
      c.lineCap = 'round';
      const arcs = [
        { r: maxR, w: 6.5, a0: 0.25, a1: Math.PI * 0.88 },
        { r: maxR, w: 6.5, a0: Math.PI + 0.25, a1: Math.PI * 1.88 },
        { r: maxR * 0.68, w: 7, a0: -0.6, a1: Math.PI * 0.65 },
        { r: maxR * 0.68, w: 7, a0: Math.PI - 0.6, a1: Math.PI * 1.65 },
        { r: maxR * 0.39, w: 6.5, a0: 0, a1: Math.PI * 2 },
      ];
      for (let a = 0; a < arcs.length; a++) {
        c.lineWidth = arcs[a].w;
        c.beginPath();
        c.arc(cx, ringY, arcs[a].r, arcs[a].a0, arcs[a].a1);
        c.stroke();
      }
      c.beginPath();
      c.arc(cx, ringY, Math.max(11, maxR * 0.16), 0, Math.PI * 2);
      c.fill();
    });
  }
  for (let z = centerStartZ; z < nextZoneId; z++) {
    if (zones[z]) zones[z].compartment = 'CENTER';
  }

  // Pulsante circolare ▶ centrato sotto la sezione attiva (compartimento PLAY, fisso)
  const playX = cx;
  const playY = Math.min(menuY - 76, bodyY + (isCompact ? 114 : 114));
  interactiveButtons.push({
    groupId: 16,
    x: playX,
    y: playY,
    r: 28,
    label: `Avvia laboratorio ${activePageTab}`,
    action: 'ENTER_LAB',
    tab: activePageTab,
  });
  const playZId = nextZoneId++;
  registerZone(playZId, 16, playX - 28, playY - 28, 56, 56, (c) => {
    c.strokeStyle = '#000000';
    c.fillStyle = '#000000';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 2.6;
    c.beginPath();
    c.arc(playX, playY, 21.5, 0, Math.PI * 2);
    c.stroke();

    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(playX - 4.5, playY - 8.5);
    c.lineTo(playX + 9.5, playY);
    c.lineTo(playX - 4.5, playY + 8.5);
    c.closePath();
    c.stroke();
  });
  if (zones[playZId]) {
    zones[playZId].isCrispUi = true;
    zones[playZId].isButtonUi = true;
    zones[playZId].compartment = 'PLAY';
  }

  return nextZoneId;
}

/**
 * Costruisce la maschera offscreen per ogni singola lettera/pulsante usando solo la bounding box stretta
 * (zero lag anche digitando rapidamente) e calcola il Chamfer Distance Field 2-pass.
 */
function buildLayoutMask(skipCanvasResize = false) {
  if (!skipCanvasResize) {
    viewW = Math.max(320, Math.floor(window.innerWidth));
    viewH = Math.max(320, Math.floor(window.innerHeight));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    maskCanvas.width = viewW;
    maskCanvas.height = viewH;
  }

  const cx = viewW * 0.5;
  const cy = viewH * 0.5;
  const minDim = Math.min(viewW, viewH);

  const seedIdleRadius = clamp(minDim * 0.022, 12, 20);
  const seedMaxRadius = clamp(minDim * 0.16, 86, 155);

  const textY = viewH * 0.43;
  const controlsY = viewH * 0.65;
  const circleR = clamp(minDim * 0.039, 24, 34);
  const circleX = cx;

  layoutBounds = {
    cx,
    cy,
    seedIdleRadius,
    seedMaxRadius,
    circle: { x: circleX, y: controlsY, r: circleR },
  };

  if (simState === STATE.IDLE_SEED) {
    seedCurrentRadius = seedIdleRadius;
  }

  const octx = maskCtx;
  if (zoneGrid.length !== viewW * viewH) {
    zoneGrid = new Uint8Array(viewW * viewH);
  } else {
    zoneGrid.fill(0);
  }
  zones = [null];
  interactiveButtons = [];
  totalMaskArea = 0;

  const registerZone = (zoneId, groupId, bx, by, bw, bh, drawFn) => {
    const x0 = clamp(Math.floor(bx), 0, viewW - 1);
    const y0 = clamp(Math.floor(by), 0, viewH - 1);
    const x1 = clamp(Math.ceil(bx + bw), x0 + 1, viewW);
    const y1 = clamp(Math.ceil(by + bh), y0 + 1, viewH);
    const w = x1 - x0;
    const h = y1 - y0;

    octx.clearRect(x0, y0, w, h);
    octx.save();
    drawFn(octx);
    octx.restore();

    const img = octx.getImageData(x0, y0, w, h).data;
    const pixels = [];
    let sumX = 0;
    let sumY = 0;

    for (let ly = 0; ly < h; ly++) {
      const py = y0 + ly;
      const gridRow = py * viewW;
      const imgRow = ly * w;
      for (let lx = 0; lx < w; lx++) {
        const alpha = img[(imgRow + lx) * 4 + 3];
        if (alpha > 45) {
          const px = x0 + lx;
          zoneGrid[gridRow + px] = zoneId;
          pixels.push({ x: px, y: py });
          sumX += px;
          sumY += py;
        }
      }
    }

    const area = pixels.length;
    totalMaskArea += area;
    zones[zoneId] = {
      id: zoneId,
      groupId,
      pixels,
      area,
      cx: area > 0 ? sumX / area : cx,
      cy: area > 0 ? sumY / area : cy,
      targetCount: 0,
      currentCount: 0,
      charge: 0,
    };
  };

  let nextZoneId = 1;
  if (pageView === 'HERO') {
    // Zone 1..N: parola HYDROGEN + singolo pulsante tondo centrato sotto la scritta
    const word = displayWord || 'HYDROGEN';
    const fontSize = clamp(viewW * 0.132, 46, 168);
    nextZoneId = drawParticleTextZones(registerZone, nextZoneId, word, textY, fontSize, 1);

    const circleZoneId = nextZoneId++;
    const cBoxPad = circleR + 14;
    interactiveButtons.push({
      groupId: 2,
      x: circleX,
      y: controlsY,
      r: circleR + 12,
      label: 'Invia onda d\'urto e rivela la pagina',
      action: 'ENTER_PAGE',
    });
    registerZone(
      circleZoneId,
      2,
      circleX - cBoxPad,
      controlsY - cBoxPad,
      cBoxPad * 2,
      cBoxPad * 2,
      (c) => {
        c.strokeStyle = '#000000';
        c.fillStyle = '#000000';
        c.lineWidth = clamp(circleR * 0.3, 7, 10.5);
        c.beginPath();
        c.arc(circleX, controlsY, circleR, 0, Math.PI * 2);
        c.stroke();

        c.beginPath();
        c.arc(circleX, controlsY, Math.max(5.5, circleR * 0.25), 0, Math.PI * 2);
        c.fill();
      }
    );
  } else if (pageView === 'THERMO') {
    syncThermoBounds();
    syncHitboxes();
    return;
  } else if (pageView === 'LAB') {
    syncLabBounds(false);
    syncHitboxes();
    return;
  } else {
    nextZoneId = buildPageLayoutMask(registerZone, nextZoneId);
  }

  // Calcolo Chamfer Distance Field (3,4) a scala DF_SCALE=2
  dfW = Math.ceil(viewW / DF_SCALE);
  dfH = Math.ceil(viewH / DF_SCALE);
  const dfLen = dfW * dfH;
  dfDist = new Int32Array(dfLen);
  dfZone = new Uint8Array(dfLen);

  const INF = 1_000_000;
  for (let gy = 0; gy < dfH; gy++) {
    const py0 = Math.min(viewH - 1, gy * DF_SCALE);
    const py1 = Math.min(viewH - 1, py0 + 1);
    const rowD = gy * dfW;
    for (let gx = 0; gx < dfW; gx++) {
      const px0 = Math.min(viewW - 1, gx * DF_SCALE);
      const px1 = Math.min(viewW - 1, px0 + 1);
      const z =
        zoneGrid[py0 * viewW + px0] ||
        zoneGrid[py0 * viewW + px1] ||
        zoneGrid[py1 * viewW + px0] ||
        zoneGrid[py1 * viewW + px1];
      if (z > 0) {
        dfDist[rowD + gx] = 0;
        dfZone[rowD + gx] = z;
      } else {
        dfDist[rowD + gx] = INF;
      }
    }
  }

  // Passata in avanti
  for (let gy = 0; gy < dfH; gy++) {
    const row = gy * dfW;
    for (let gx = 0; gx < dfW; gx++) {
      const idx = row + gx;
      let best = dfDist[idx];
      if (best === 0) continue;
      let bestZ = dfZone[idx];

      if (gx > 0) {
        const d = dfDist[idx - 1] + 3;
        if (d < best) { best = d; bestZ = dfZone[idx - 1]; }
      }
      if (gy > 0) {
        const up = idx - dfW;
        const d = dfDist[up] + 3;
        if (d < best) { best = d; bestZ = dfZone[up]; }
        if (gx > 0) {
          const dUL = dfDist[up - 1] + 4;
          if (dUL < best) { best = dUL; bestZ = dfZone[up - 1]; }
        }
        if (gx < dfW - 1) {
          const dUR = dfDist[up + 1] + 4;
          if (dUR < best) { best = dUR; bestZ = dfZone[up + 1]; }
        }
      }
      dfDist[idx] = best;
      dfZone[idx] = bestZ;
    }
  }

  // Passata all'indietro
  for (let gy = dfH - 1; gy >= 0; gy--) {
    const row = gy * dfW;
    for (let gx = dfW - 1; gx >= 0; gx--) {
      const idx = row + gx;
      let best = dfDist[idx];
      if (best === 0) continue;
      let bestZ = dfZone[idx];

      if (gx < dfW - 1) {
        const d = dfDist[idx + 1] + 3;
        if (d < best) { best = d; bestZ = dfZone[idx + 1]; }
      }
      if (gy < dfH - 1) {
        const dn = idx + dfW;
        const d = dfDist[dn] + 3;
        if (d < best) { best = d; bestZ = dfZone[dn]; }
        if (gx < dfW - 1) {
          const dDR = dfDist[dn + 1] + 4;
          if (dDR < best) { best = dDR; bestZ = dfZone[dn + 1]; }
        }
        if (gx > 0) {
          const dDL = dfDist[dn - 1] + 4;
          if (dDL < best) { best = dDL; bestZ = dfZone[dn - 1]; }
        }
      }
      dfDist[idx] = best;
      dfZone[idx] = bestZ;
    }
  }

  updateZoneTargets();
  syncHitboxes();
  syncParticleCount(false);
}

function syncHitboxes() {
  const { cx, cy, seedIdleRadius, circle } = layoutBounds;

  const seedHitR = Math.max(seedIdleRadius * 2.2, 34);
  btnSeed.style.left = `${cx - seedHitR}px`;
  btnSeed.style.top = `${cy - seedHitR}px`;
  btnSeed.style.width = `${seedHitR * 2}px`;
  btnSeed.style.height = `${seedHitR * 2}px`;

  const cPad = 12;
  btnAction.style.left = `${circle.x - circle.r - cPad}px`;
  btnAction.style.top = `${circle.y - circle.r - cPad}px`;
  btnAction.style.width = `${(circle.r + cPad) * 2}px`;
  btnAction.style.height = `${(circle.r + cPad) * 2}px`;

  const showSeed = simState === STATE.IDLE_SEED;
  const showControls = simState === STATE.SETTLED || simState === STATE.EXPLODING;
  btnSeed.hidden = !showSeed;
  btnAction.hidden = !(showControls && pageView === 'HERO');

  if (pageHitboxes) {
    pageHitboxes.innerHTML = '';
    if (showControls && pageView === 'PAGE') {
      for (let i = 0; i < interactiveButtons.length; i++) {
        const btnMeta = interactiveButtons[i];
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'particle-hitbox particle-hitbox--circle';
        el.setAttribute('aria-label', btnMeta.label);
        el.style.left = `${btnMeta.x - btnMeta.r}px`;
        el.style.top = `${btnMeta.y - btnMeta.r}px`;
        el.style.width = `${btnMeta.r * 2}px`;
        el.style.height = `${btnMeta.r * 2}px`;
        el.addEventListener('click', (e) => {
          if (e.detail === 0) handleInteractiveButton(btnMeta);
        });
        pageHitboxes.appendChild(el);
      }
    } else if (showControls && (pageView === 'THERMO' || pageView === 'LAB')) {
      const bBtn = pageView === 'THERMO' ? thermo.backBtn : labState.backBtn;
      const sBtn = pageView === 'THERMO' ? thermo.seedBtn : labState.seedBtn;
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'particle-hitbox particle-hitbox--circle';
      backBtn.setAttribute('aria-label', 'Esci dal laboratorio');
      backBtn.style.left = `${bBtn.x - bBtn.r}px`;
      backBtn.style.top = `${bBtn.y - bBtn.r}px`;
      backBtn.style.width = `${bBtn.r * 2}px`;
      backBtn.style.height = `${bBtn.r * 2}px`;
      backBtn.addEventListener('click', (e) => {
        if (e.detail === 0) {
          if (pageView === 'THERMO') exitThermoChamber(bBtn.x, bBtn.y);
          else exitPhysicsLab(bBtn.x, bBtn.y);
        }
      });
      pageHitboxes.appendChild(backBtn);

      const seedCtrl = document.createElement('button');
      seedCtrl.type = 'button';
      seedCtrl.className = 'particle-hitbox particle-hitbox--circle';
      seedCtrl.setAttribute('aria-label', 'Riavvolgi nella singolarità iniziale');
      seedCtrl.style.left = `${sBtn.x - sBtn.r}px`;
      seedCtrl.style.top = `${sBtn.y - sBtn.r}px`;
      seedCtrl.style.width = `${sBtn.r * 2}px`;
      seedCtrl.style.height = `${sBtn.r * 2}px`;
      seedCtrl.addEventListener('click', (e) => {
        if (e.detail === 0) implodeToSeed(sBtn.x);
      });
      pageHitboxes.appendChild(seedCtrl);
    }
  }
}

/**
 * Avvia l'ingrandimento del pallino nero centrale verso il Big Bang.
 */
function startBigBangSequence() {
  if (simState !== STATE.IDLE_SEED && simState !== STATE.IMPLODING) return;
  simState = STATE.GROWING;
  stateTime = 0;
  seedStartRadius = seedCurrentRadius;
  stopIdleHarmonic();
  startGrowDrone();
  syncHitboxes();
}

/**
 * Big Bang: scaraventa i pallini fino ai margini della pagina e oltre,
 * ciascuno con inerzia e tempi di ritorno propri.
 */
function triggerExplosionFromSphere() {
  simState = STATE.EXPLODING;
  stateTime = 0;
  explosionElapsed = 0;
  stopGrowDrone();
  playBigBangBoom(1.0);

  const { cx, cy } = layoutBounds;
  const sphereR = seedCurrentRadius;
  const diag = Math.hypot(viewW, viewH);
  const speedScale = prefersReducedMotion ? 0.28 : 1;

  if (particles.length !== effectiveParticleCount) {
    syncParticleCount(true);
  } else {
    if (shNext.length !== particles.length) {
      shNext = new Int32Array(particles.length);
    }
    reassignParticleGoals(false);
  }

  pulseWave.active = false;
  const total = particles.length;
  for (let i = 0; i < total; i++) {
    const p = particles[i];
    p.thermoPreviewInner = false;
    p.morphSwirl = 0;
    p.bhRecoverRate = 0;
    p.absorbed = false;
    // Distribuzione sferica 3D reale: direzione azimutale + profondità Z verso/lontano dallo schermo
    const cosPhi = 2 * Math.random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = Math.random() * Math.PI * 2;
    const radial3D = Math.cbrt(Math.random());
    const r3 = radial3D * sphereR;

    p.x = cx + sinPhi * Math.cos(theta) * r3;
    p.y = cy + sinPhi * Math.sin(theta) * r3;
    p.z = cosPhi * r3;

    // Volume sferico 3D pieno (nessun fronte d'onda vuoto): alcune restano vicine, altre vanno lontano in modo casuale
    const volumeSpread = 0.05 + Math.pow(Math.random(), 1.25) * 1.8;
    const burstSpeed = volumeSpread * (diag * 0.044) * speedScale;
    const swirl = (Math.random() - 0.5) * 0.34;
    p.vx = sinPhi * Math.cos(theta + swirl) * burstSpeed;
    p.vy = sinPhi * Math.sin(theta + swirl) * burstSpeed;
    p.vz = cosPhi * burstSpeed * 0.56;

    // Tempi individuali di volo libero e ritorno naturale
    p.burstDrag = 0.942 + Math.random() * 0.026;
    p.returnDelay = prefersReducedMotion ? 160 + Math.random() * 420 : 320 + Math.random() * 2000;
    p.returnDuration = prefersReducedMotion ? 500 + Math.random() * 500 : 850 + Math.random() * 1450;
    p.magneticWake = 0;
    p.currentZone = 0;
  }

  syncHitboxes();
}

/**
 * Richiama tutte le particelle in un unico punto stretto al centro.
 */
function implodeToSeed(originX = viewW * 0.5) {
  if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
  pageView = 'HERO';
  activePageTab = 'THERMO';
  activeLab = null;
  simState = STATE.IMPLODING;
  stateTime = 0;
  implodeMerging = false;
  implodeMergeTime = 0;
  implodeMergeAlpha = 0;
  pulseWave.active = false;
  blackHole.active = false;
  blackHole.charge = 0;
  slashTrails.length = 0;
  pointer.hoverGroup = 0;
  playImplodeSuction(originX);
  updateBlackHoleAudio(0, viewW * 0.5, viewH * 0.5);
  buildLayoutMask(true);

  const absorbDotsToPool = (arr) => {
    if (!arr || arr.length === 0) return;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i];
      const p = createParticle(d.x, d.y);
      p.vx = d.vx || 0;
      p.vy = d.vy || 0;
      particles.push(p);
    }
    arr.length = 0;
  };
  absorbDotsToPool(thermo.hudDots);
  absorbDotsToPool(thermo.backBtn.dots);
  absorbDotsToPool(thermo.seedBtn.dots);
  absorbDotsToPool(thermo.tempSlider.dots);
  absorbDotsToPool(thermo.tempSlider.knobDots);
  absorbDotsToPool(thermo.compSlider.dots);
  absorbDotsToPool(thermo.compSlider.knobDots);
  absorbDotsToPool(labState.hudDots);
  absorbDotsToPool(labState.hudLabels);
  absorbDotsToPool(labState.backBtn.dots);
  absorbDotsToPool(labState.seedBtn.dots);
  absorbDotsToPool(labState.energySlider.dots);
  absorbDotsToPool(labState.energySlider.knobDots);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.thermoRole === 'wall' && p.wallLocked) {
      const pos = getThermoTargetPoint(p);
      p.x = pos.x;
      p.y = pos.y;
    }
    p.absorbed = false;
    p.thermoRole = null;
    p.wallLocked = false;
    p.thermoPreviewInner = false;
    p.morphSwirl = 0;
    p.bhRecoverRate = 0;
    p.currentZone = 0;
  }

  reassignParticleGoals(false);
  syncHitboxes();
}

function triggerBlackHoleBlast() {
  if (blackHole.charge <= 0.08) return;
  const bx = blackHole.x;
  const by = blackHole.y;
  playBigBangBoom(0.45 + 0.55 * blackHole.charge, bx, by);
  const diag = Math.hypot(viewW, viewH) || 1000;
  const charge = blackHole.charge;
  const blastPower =
    (0.012 + 0.024 * charge) *
    diag *
    clamp(CONFIG.magnetForce, 0.65, 1.75) *
    (prefersReducedMotion ? 0.35 : 1);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const rx = p.x - bx;
    const ry = p.y - by;
    const rz = p.z;
    const dist3 = Math.hypot(rx, ry, rz);
    const falloff = Math.max(0.38, 1 - dist3 / (diag * 1.05));
    const cosPhi = 2 * Math.random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = Math.random() * Math.PI * 2;
    const randX = sinPhi * Math.cos(theta);
    const randY = sinPhi * Math.sin(theta);
    const randZ = cosPhi;

    const invD = dist3 > 1 ? 1 / dist3 : 0;
    const dirX = rx * invD * 0.65 + randX * 0.35;
    const dirY = ry * invD * 0.65 + randY * 0.35;
    const dirZ = rz * invD * 0.55 + randZ * 0.45;
    const dLen = Math.hypot(dirX, dirY, dirZ) || 1;

    const kick = blastPower * falloff * (0.55 + Math.random() * 0.62);
    p.vx += (dirX / dLen) * kick;
    p.vy += (dirY / dLen) * kick;
    p.vz += (dirZ / dLen) * kick * 0.65;
    p.magneticWake = 0.08;
    p.bhRecoverRate = 0.013 + Math.random() * 0.013;
  }
}

/**
 * Emette un'onda d'urto radiale dal pulsante cliccato proporzionata allo schermo,
 * sparpaglia le particelle fino agli angoli e le fa condensare nella nuova configurazione.
 */
function triggerShockwaveTransition(originX, originY, nextPageView = pageView, nextTab = activePageTab) {
  if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
  const ox = typeof originX === 'number' ? originX : layoutBounds.circle.x;
  const oy = typeof originY === 'number' ? originY : layoutBounds.circle.y;
  const isLayoutMorph = nextPageView !== pageView || nextTab !== activePageTab;
  const diag = Math.hypot(viewW, viewH) || 1000;

  pageView = nextPageView;
  activePageTab = nextTab;
  playPulseSweep(ox);

  if (isLayoutMorph) {
    buildLayoutMask(true);
    reassignParticleGoals();
    for (let i = 0; i < particles.length; i++) {
      particles[i].magneticWake = Math.min(particles[i].magneticWake, 0.24);
      particles[i].bhRecoverRate = 0.013 + Math.random() * 0.013;
    }
  }

  pulseWaveSeq++;
  pulseWave = {
    id: pulseWaveSeq,
    active: true,
    x: ox,
    y: oy,
    prevRadius: 0,
    radius: 10,
    speed: diag * 0.018,
    maxRadius: diag * 1.08,
    power: prefersReducedMotion ? diag * 0.007 : diag * (isLayoutMorph ? 0.034 : 0.028),
    morphScatter: isLayoutMorph,
  };
}

function triggerMenuMorph(nextTab, originX) {
  if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
  if (nextTab === activePageTab) return;

  const prevTab = activePageTab;
  // Salva compartimento e tab del pulsante inferiore per ogni particella prima del cambio tab
  const prevCompartments = new Array(particles.length);
  const prevBottomTabs = new Array(particles.length);
  for (let i = 0; i < particles.length; i++) {
    const gz = particles[i].goalZone;
    const zn = gz > 0 && gz < zones.length ? zones[gz] : null;
    prevCompartments[i] = zn && zn.compartment ? zn.compartment : 'CENTER';
    prevBottomTabs[i] = zn && zn.bottomTab ? zn.bottomTab : null;
  }

  activePageTab = nextTab;
  playTypeTick(screenToPan(originX));
  buildLayoutMask(true);

  const compToZones = new Map();
  const bottomTabToZone = new Map();
  for (let z = 1; z < zones.length; z++) {
    const zn = zones[z];
    if (!zn || zn.pixels.length === 0) continue;
    const comp = zn.compartment || 'CENTER';
    if (!compToZones.has(comp)) compToZones.set(comp, []);
    compToZones.get(comp).push(z);
    if (zn.bottomTab) bottomTabToZone.set(zn.bottomTab, z);
  }

  const STATIC_COMPARTMENTS = new Set([
    'TOP_BACK',
    'TOP_SEED',
    'TOP_CHAR_0',
    'TOP_CHAR_SLASH',
    'TOP_CHAR_0B',
    'TOP_CHAR_4',
    'PLAY',
  ]);

  const dynamicBuckets = new Map();
  const bottomTransitionPool = [];

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const comp = prevCompartments[i] || 'CENTER';
    const bTab = prevBottomTabs[i];
    const targetZones = compToZones.get(comp);

    if (STATIC_COMPARTMENTS.has(comp) && targetZones && targetZones.length === 1) {
      p.goalZone = targetZones[0];
      p.thermoPreviewInner = false;
    } else if (comp === 'BOTTOM' && bTab && bTab !== prevTab && bTab !== nextTab && bottomTabToZone.has(bTab)) {
      // I 2 pulsanti inferiori non coinvolti nel cambio restano completamente fermi
      p.goalZone = bottomTabToZone.get(bTab);
      p.thermoPreviewInner = false;
    } else if (comp === 'BOTTOM') {
      bottomTransitionPool.push(i);
    } else {
      const bucketKey = targetZones && targetZones.length > 0 ? comp : 'CENTER';
      if (!dynamicBuckets.has(bucketKey)) dynamicBuckets.set(bucketKey, []);
      dynamicBuckets.get(bucketKey).push(i);
    }
  }

  // Nella barra inferiore, mescola casualmente le particelle tra il vecchio e il nuovo pulsante attivo:
  // una parte resta sull'icona precedente e il resto sciama liberamente (mai in blocco) verso il nuovo attivo
  const prevBtnZ = bottomTabToZone.get(prevTab);
  const nextBtnZ = bottomTabToZone.get(nextTab);
  if (bottomTransitionPool.length > 0 && prevBtnZ && nextBtnZ) {
    for (let i = bottomTransitionPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bottomTransitionPool[i];
      bottomTransitionPool[i] = bottomTransitionPool[j];
      bottomTransitionPool[j] = tmp;
    }
    const stayQuota = clamp(Math.round(zones[prevBtnZ].targetCount), 1, bottomTransitionPool.length - 1);
    const nextQuota = Math.max(1, bottomTransitionPool.length - stayQuota);
    for (let k = 0; k < bottomTransitionPool.length; k++) {
      const pIdx = bottomTransitionPool[k];
      const p = particles[pIdx];
      const isStay = k < stayQuota;
      const destZ = isStay ? prevBtnZ : nextBtnZ;
      const slotIdx = isStay ? k : k - stayQuota;
      const slotTotal = isStay ? stayQuota : nextQuota;
      const anc = pickStratifiedAnchor(destZ, slotIdx, slotTotal);
      p.goalZone = destZ;
      p.anchorX = anc.x;
      p.anchorY = anc.y;
      p.thermoPreviewInner = false;
      p.mobility = 0.62 + Math.random() * 0.78;
      p.morphSwirl = (Math.random() - 0.5) * 0.85;
      const ang = Math.random() * Math.PI * 2;
      const kick = destZ === nextBtnZ ? 0.8 + Math.random() * 2.2 : 0.35 + Math.random() * 0.9;
      p.vx += Math.cos(ang) * kick;
      p.vy += Math.sin(ang) * kick;
    }
  } else if (bottomTransitionPool.length > 0 && compToZones.has('BOTTOM')) {
    assignWeightedGoals(bottomTransitionPool, compToZones.get('BOTTOM'), null, false);
  }

  // Riordina localmente 'TOP_DIGIT' e 'CENTER' con velocità e curvatura individuali casuali
  for (const [comp, pIndices] of dynamicBuckets.entries()) {
    const targetZones = compToZones.get(comp) || compToZones.get('CENTER') || [];
    if (targetZones.length > 0 && pIndices.length > 0) {
      assignWeightedGoals(pIndices, targetZones, null, true);
      for (let k = 0; k < pIndices.length; k++) {
        const p = particles[pIndices[k]];
        p.mobility = 0.65 + Math.random() * 0.72;
        p.morphSwirl = (Math.random() - 0.5) * 0.72;
        const ang = Math.random() * Math.PI * 2;
        const kick = 0.55 + Math.random() * 1.85;
        p.vx += Math.cos(ang) * kick;
        p.vy += Math.sin(ang) * kick;
      }
    }
  }
}

function handleInteractiveButton(btnMeta) {
  if (!btnMeta) return;
  if (btnMeta.action === 'ENTER_PAGE') {
    triggerShockwaveTransition(btnMeta.x, btnMeta.y, 'PAGE', activePageTab || 'THERMO');
  } else if (btnMeta.action === 'RETURN_HERO') {
    triggerShockwaveTransition(btnMeta.x, btnMeta.y, 'HERO', 'THERMO');
  } else if (btnMeta.action === 'SWITCH_TAB') {
    if (activePageTab === btnMeta.tab) {
      launchLabByTab(btnMeta.tab, btnMeta.x, btnMeta.y);
    } else {
      triggerMenuMorph(btnMeta.tab, btnMeta.x);
    }
  } else if (btnMeta.action === 'IMPLODE_SEED') {
    implodeToSeed(btnMeta.x);
  } else if (btnMeta.action === 'ENTER_LAB') {
    launchLabByTab(btnMeta.tab || activePageTab, btnMeta.x, btnMeta.y);
  }
}

function launchLabByTab(tab, originX, originY) {
  if (tab === 'THERMO') {
    enterThermoChamber(originX, originY);
  } else {
    enterPhysicsLab(tab, originX, originY);
  }
}

function updateSimulation(dtMs) {
  const dt = Math.min(dtMs / 16.6667, 2.2);
  stateTime += dtMs;

  const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

  camYaw = 0;
  camPitch = 0;

  if (simState === STATE.IDLE_SEED) {
    const targetHover = pointer.hoverGroup === 99 ? 1 : 0;
    seedHoverCharge += (targetHover - seedHoverCharge) * 0.12 * dt;

    const breathAmp = prefersReducedMotion ? 0.5 : 1.8;
    const breathSin = Math.sin(stateTime * 0.0028);
    seedCurrentRadius = seedIdleRadius + breathSin * breathAmp + seedHoverCharge * 5.5;
    updateIdleHarmonic((breathSin + 1) * 0.5);
    return;
  }

  if (simState === STATE.GROWING) {
    const duration = prefersReducedMotion ? CONFIG.growDurationMs * 0.65 : CONFIG.growDurationMs;
    const progress = clamp(stateTime / duration, 0, 1);
    const eased = easeInOutQuad(progress) * 0.55 + easeInCubic(progress) * 0.45;
    const subtleTremor =
      prefersReducedMotion ? 0 : Math.sin(stateTime * 0.035) * (progress * 1.4);

    seedCurrentRadius =
      seedStartRadius + (seedMaxRadius - seedStartRadius) * eased + subtleTremor;
    updateGrowDrone(progress);

    if (progress >= 1) {
      triggerExplosionFromSphere();
    }
    return;
  }

  if (simState === STATE.IMPLODING) {
    const total = particles.length;

    if (!implodeMerging) {
      let absorbedCount = 0;
      const ramp = 1 + clamp(stateTime / 320, 0, 4.0);
      const damp = Math.pow(0.91, dt);

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        if (p.absorbed) {
          absorbedCount++;
          continue;
        }

        const dx = cx - p.x;
        const dy = cy - p.y;
        const dz = -p.z;
        const dist = Math.hypot(dx, dy, dz);

        if (dist <= 4.5) {
          p.absorbed = true;
          p.x = cx;
          p.y = cy;
          p.z = 0;
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
          absorbedCount++;
          continue;
        }

        // Centro super attrattivo: gravità fisica crescente verso la singolarità
        const accel = (2.4 + 480 / Math.max(24, dist)) * ramp * dt;
        p.vx = (p.vx + (dx / dist) * accel) * damp;
        p.vy = (p.vy + (dy / dist) * accel) * damp;
        p.vz = (p.vz + (dz / dist) * accel) * damp;

        const nextX = p.x + p.vx * dt;
        const nextY = p.y + p.vy * dt;
        const nextZ = p.z + p.vz * dt;
        const ndx = cx - nextX;
        const ndy = cy - nextY;
        const crossedCenter = dx * ndx + dy * ndy <= 0;

        if (crossedCenter || Math.hypot(ndx, ndy, -nextZ) <= 4.5) {
          p.absorbed = true;
          p.x = cx;
          p.y = cy;
          p.z = 0;
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
          absorbedCount++;
        } else {
          p.x = nextX;
          p.y = nextY;
          p.z = nextZ;
        }
      }

      if (absorbedCount >= total || stateTime > 1900) {
        implodeMerging = true;
        implodeMergeTime = 0;
        implodeMergeAlpha = 1;
        seedCurrentRadius = CONFIG.dotSize * 1.25;
        playBouncePop();
      }
    } else {
      implodeMergeTime += dtMs;
      const bounceDuration = prefersReducedMotion ? 220 : 440;
      const t = clamp(implodeMergeTime / bounceDuration, 0, 1);
      const startDotR = CONFIG.dotSize * 1.25;
      const bounce = prefersReducedMotion
        ? easeOutCubic(t)
        : 1 - Math.exp(-7.0 * t) * Math.cos(10.0 * t);
      seedCurrentRadius = startDotR + (seedIdleRadius - startDotR) * bounce;

      if (t >= 1) {
        simState = STATE.IDLE_SEED;
        stateTime = 0;
        seedHoverCharge = 0;
        seedCurrentRadius = seedIdleRadius;
        implodeMerging = false;
        implodeMergeAlpha = 0;
        syncHitboxes();
        if (autoReplayAfterImplode) {
          autoReplayAfterImplode = false;
          startBigBangSequence();
        }
      }
    }
    return;
  }

  // Modalità Camera Termodinamica & Laboratori 02..04
  if (pageView === 'THERMO' && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
    explosionElapsed += dtMs;
    if (simState === STATE.EXPLODING && stateTime > 1250) simState = STATE.SETTLED;
    updateThermoSimulation(dt, dtMs);
    pointer.vx *= 0.78;
    pointer.vy *= 0.78;
    return;
  }

  if (pageView === 'LAB' && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
    explosionElapsed += dtMs;
    if (simState === STATE.EXPLODING && stateTime > 1250) simState = STATE.SETTLED;
    updateLabSimulation(dt, dtMs);
    pointer.vx *= 0.78;
    pointer.vy *= 0.78;
    return;
  }

  // Aggiorna scie di vento / fendente rapido del mouse
  for (let s = slashTrails.length - 1; s >= 0; s--) {
    slashTrails[s].age += dtMs;
    if (slashTrails[s].age >= slashTrails[s].maxAge) {
      slashTrails.splice(s, 1);
    }
  }

  // Aggiorna carica del buco nero 3D se il cursore è tenuto premuto
  if (blackHole.active && pointer.down && (simState === STATE.SETTLED || simState === STATE.EXPLODING)) {
    blackHole.elapsed += dtMs;
    blackHole.charge = clamp((blackHole.elapsed - 65) / 850, 0, 1);
  } else {
    blackHole.charge = Math.max(0, blackHole.charge - 0.12 * dt);
  }
  updateBlackHoleAudio(blackHole.charge, blackHole.x, blackHole.y);

  // Stato EXPLODING -> SETTLED (ogni particella continua comunque col proprio wake individuale)
  explosionElapsed += dtMs;
  if (simState === STATE.EXPLODING && stateTime > 1250) {
    simState = STATE.SETTLED;
  }

  // Aggiorna onda di dispersione progressiva
  if (pulseWave.active) {
    pulseWave.prevRadius = pulseWave.radius;
    pulseWave.radius += (pulseWave.speed || 26) * dt;
    if (pulseWave.radius > pulseWave.maxRadius) {
      pulseWave.active = false;
    }
  }

  const total = particles.length;
  const zoneCount = zones.length;
  const softness = CONFIG.edgeSoftness;

  // 1. Azzera conteggi e popola Spatial Hash + rilevazione zona per ogni particella
  for (let z = 1; z < zoneCount; z++) {
    zones[z].currentCount = 0;
  }
  if (shNext.length !== total) {
    shNext = new Int32Array(total);
  }
  shHead.fill(-1);

  for (let i = 0; i < total; i++) {
    const p = particles[i];

    // Aggiorna risveglio magnetico individuale dopo il Big Bang o dopo esplosione da buco nero
    if (p.magneticWake < 1) {
      if (p.bhRecoverRate) {
        p.magneticWake = Math.min(1, p.magneticWake + p.bhRecoverRate * dt);
        if (p.magneticWake >= 1) p.bhRecoverRate = 0;
      } else {
        const wakeRaw = clamp((explosionElapsed - p.returnDelay) / p.returnDuration, 0, 1);
        p.magneticWake = easeInOutQuad(wakeRaw);
      }
    }

    // Inserisci nello Spatial Hash (solo se vicino/dentro la viewport)
    if (p.x >= -shCellSize && p.x < viewW + shCellSize && p.y >= -shCellSize && p.y < viewH + shCellSize) {
      const cxCell = clamp(Math.floor(p.x / shCellSize) + 1, 0, shCols - 1);
      const cyCell = clamp(Math.floor(p.y / shCellSize) + 1, 0, shRows - 1);
      const cellIdx = cyCell * shCols + cxCell;
      shNext[i] = shHead[cellIdx];
      shHead[cellIdx] = i;
    }

    // Livelli multipli di definizione: pulsanti del menu nitidissimi (groupId >= 10), testo definito, pulsante Hero morbido
    const ix = Math.round(p.x);
    const iy = Math.round(p.y);
    let zId = 0;
    if (ix >= 0 && ix < viewW && iy >= 0 && iy < viewH) {
      zId = zoneGrid[iy * viewW + ix];
      if (zId === 0 && p.goalZone > 0 && p.goalZone < zoneCount) {
        const gz = zones[p.goalZone];
        if (gz && gz.isThermoPreview && gz.previewBounds && p.thermoPreviewInner) {
          const pb = gz.previewBounds;
          if (p.x >= pb.x && p.x <= pb.x + pb.w && p.y >= pb.y && p.y <= pb.y + pb.h) {
            zId = p.goalZone;
          }
        }
      }
      if (zId === 0 && softness > 0) {
        const df = sampleDistanceField(p.x, p.y);
        const nearZoneObj = df.nearestZone > 0 ? zones[df.nearestZone] : null;
        const gId = nearZoneObj ? nearZoneObj.groupId : 0;
        const allowedHalo =
          nearZoneObj && nearZoneObj.isCrispUi
            ? 0
            : nearZoneObj && nearZoneObj.isThermoPreview
            ? p.fluidFringe ? softness + 4.8 : softness + 1.8
            : gId >= 10
            ? p.fluidFringe ? 1.0 : 0
            : gId === 2
            ? p.fluidFringe ? softness + 3.5 : softness * 0.45
            : p.fluidFringe ? softness + 3.2 : softness * 0.35;
        if (allowedHalo > 0.3 && df.distPx <= allowedHalo) {
          zId = df.nearestZone;
        }
      }
    }

    p.currentZone = zId;
    if (zId > 0 && p.magneticWake > 0.25 && i < effectiveParticleCount) {
      zones[zId].currentCount++;
    }
  }

  // 2. Calcola la carica atomica di ogni zona:
  //    charge > 0 -> positiva (ha pochi pallini -> attira)
  //    charge < 0 -> negativa (ha troppi pallini -> espelle/respinge)
  for (let z = 1; z < zoneCount; z++) {
    const zone = zones[z];
    zone.charge = (zone.targetCount - zone.currentCount) / Math.max(1, zone.targetCount);
  }

  const brownianBase = CONFIG.brownianStrength * (prefersReducedMotion ? 0.12 : 1);
  const magnetRad = CONFIG.magnetRadius;
  const magnetRadSq = magnetRad * magnetRad;
  const pointerActive = pointer.active;
  const isAttracting = pointer.down;
  const pointerSpeed = Math.hypot(pointer.vx, pointer.vy);
  const magnetForce = CONFIG.magnetForce * (isAttracting ? 1.45 : 1.0);
  const repelDist = idealSpacing;
  const repelDistSq = repelDist * repelDist;
  const repelStrength = 0.28;
  let excessCount = Math.max(0, total - effectiveParticleCount);
  const maxFusionsThisFrame = excessCount > 0 ? Math.max(8, Math.ceil(excessCount * 0.055)) : 0;
  let fusedThisFrame = 0;

  // 3. Integra tutte le forze su ogni particella
  for (let i = 0; i < total; i++) {
    const p = particles[i];
    if (p.deadFuse) continue;
    const wake = p.magneticWake;

    // Onda di dispersione radiale 3D dal pulsante cliccato (un singolo impulso per ogni particella)
    if (pulseWave.active && p.lastPulseId !== pulseWave.id) {
      const wdx = p.x - pulseWave.x;
      const wdy = p.y - pulseWave.y;
      const wdist = Math.hypot(wdx, wdy) || 1;
      const hitMargin = Math.max(16, (pulseWave.speed || 26) * 0.8);
      if (wdist >= pulseWave.prevRadius - hitMargin && wdist <= pulseWave.radius + hitMargin) {
        p.lastPulseId = pulseWave.id;
        const falloff = Math.max(0.42, 1 - wdist / pulseWave.maxRadius);
        const angle = Math.atan2(wdy, wdx) + (Math.random() - 0.5) * 0.62;
        const kick = pulseWave.power * falloff * (0.55 + Math.random() * 0.65);
        p.vx += Math.cos(angle) * kick;
        p.vy += Math.sin(angle) * kick;
        p.vz += (Math.random() - 0.5) * kick * 0.72;
        if (pulseWave.morphScatter) {
          p.magneticWake = 0.08;
          p.bhRecoverRate = 0.013 + Math.random() * 0.013;
        }
      }
    }

    // Moto browniano 3D continuo (naturale e indipendente su ogni particella)
    const goalZObj = p.goalZone > 0 && p.goalZone < zoneCount ? zones[p.goalZone] : null;
    const isButtonUi = Boolean(goalZObj && goalZObj.isButtonUi);
    const isThermoPrev = Boolean(goalZObj && goalZObj.isThermoPreview);
    const brownianScale = isButtonUi ? 0.24 : isThermoPrev ? (p.thermoPreviewInner ? 1.55 : 0.75) : 1.0;
    const brownian = brownianBase * (0.3 + 0.7 * wake) * brownianScale;
    p.vx += (Math.random() - 0.5) * brownian * dt;
    p.vy += (Math.random() - 0.5) * brownian * dt;
    p.vz += (Math.random() - 0.5) * brownian * 0.9 * dt;
    if (wake > 0.001) {
      const dz = (isButtonUi ? 0 : (p.zHome || 0)) - p.z;
      const zDist = Math.abs(dz);
      if (zDist > 0.2) {
        const zPull = 0.36 * clamp(zDist / 320, 0.25, 1.4) * p.mobility * wake * dt;
        p.vz += Math.sign(dz) * zPull;
      }
    }

    // Pressione / repulsione locale isotropa tra pallini vicini (mantiene i pallini liberi e ben distribuiti)
    const localRepelDist = isButtonUi ? 2.6 : isThermoPrev && !p.thermoPreviewInner ? 2.5 : repelDist;
    const localRepelDistSq = localRepelDist * localRepelDist;
    const localRepelStrength = isButtonUi ? 0.14 : isThermoPrev && !p.thermoPreviewInner ? 0.12 : repelStrength;
    if (wake > 0.2 && p.x >= -shCellSize && p.x < viewW + shCellSize && p.y >= -shCellSize && p.y < viewH + shCellSize) {
      const cxCell = clamp(Math.floor(p.x / shCellSize) + 1, 0, shCols - 1);
      const cyCell = clamp(Math.floor(p.y / shCellSize) + 1, 0, shRows - 1);

      for (let oy = -1; oy <= 1; oy++) {
        if (cyCell + oy < 0 || cyCell + oy >= shRows) continue;
        const rowBase = (cyCell + oy) * shCols;
        for (let ox = -1; ox <= 1; ox++) {
          if (cxCell + ox < 0 || cxCell + ox >= shCols) continue;
          let j = shHead[rowBase + cxCell + ox];
          while (j !== -1) {
            if (j !== i) {
              const q = particles[j];
              if (!q.deadFuse) {
                const rdx = p.x - q.x;
                const rdy = p.y - q.y;
                const rDistSq = rdx * rdx + rdy * rdy;
                if (excessCount > 0 && fusedThisFrame < maxFusionsThisFrame && i >= effectiveParticleCount && rDistSq < repelDistSq * 7.5) {
                  // Le particelle in eccesso si avvicinano dolcemente al vicino reale e si fondono per collisione
                  if (rDistSq < 11.5) {
                    p.deadFuse = true;
                    q.splitScale = 1.22;
                    excessCount--;
                    fusedThisFrame++;
                    break;
                  }
                  const rDist = Math.sqrt(rDistSq) || 1;
                  p.vx -= (rdx / rDist) * 0.30 * dt;
                  p.vy -= (rdy / rDist) * 0.30 * dt;
                } else if (rDistSq < localRepelDistSq && rDistSq > 0.01) {
                  const rDist = Math.sqrt(rDistSq);
                  const push = (1 - rDist / localRepelDist) * localRepelStrength * wake * dt;
                  p.vx += (rdx / rDist) * push;
                  p.vy += (rdy / rDist) * push;
                }
              }
            }
            j = shNext[j];
          }
          if (p.deadFuse) break;
        }
        if (p.deadFuse) break;
      }
    }

    // Forze di richiamo al proprio compartimento (particelle libere dentro il solco dell'icona, zero movimento in blocco)
    const zoneWake =
      blackHole.active && blackHole.charge > 0.02
        ? wake * (1 - blackHole.charge)
        : wake;
    if (zoneWake > 0.001) {
      if (!goalZObj) {
        assignSingleGoal(p, pickWeightedHungryZone(p.x, p.y));
      }
      const gz = zones[p.goalZone];

      if (gz && gz.isThermoPreview && p.thermoPreviewInner && gz.previewBounds) {
        const pb = gz.previewBounds;
        const pad = 9;
        const insideBox =
          p.x >= pb.x + pad - 2 &&
          p.x <= pb.x + pb.w - pad + 2 &&
          p.y >= pb.y + pad - 2 &&
          p.y <= pb.y + pb.h - pad + 2;
        if (!insideBox) {
          const ax = p.anchorX - p.x;
          const ay = p.anchorY - p.y;
          const dist = Math.hypot(ax, ay) || 1;
          const pull = 0.45 * clamp(dist / 260, 0.6, 1.8) * p.mobility * zoneWake * dt;
          p.vx += (ax / dist) * pull;
          p.vy += (ay / dist) * pull;
        } else {
          if (p.x < pb.x + pad) { p.x = pb.x + pad; p.vx = Math.abs(p.vx) + 0.18; }
          else if (p.x > pb.x + pb.w - pad) { p.x = pb.x + pb.w - pad; p.vx = -Math.abs(p.vx) - 0.18; }
          if (p.y < pb.y + pad) { p.y = pb.y + pad; p.vy = Math.abs(p.vy) + 0.18; }
          else if (p.y > pb.y + pb.h - pad) { p.y = pb.y + pb.h - pad; p.vy = -Math.abs(p.vy) - 0.18; }
          const spd = Math.hypot(p.vx, p.vy);
          if (spd < 0.82) {
            const ang = spd > 0.05 ? Math.atan2(p.vy, p.vx) : Math.random() * Math.PI * 2;
            p.vx += Math.cos(ang) * 0.24 * dt;
            p.vy += Math.sin(ang) * 0.24 * dt;
          } else if (spd > 2.25) {
            p.vx *= 0.94;
            p.vy *= 0.94;
          }
        }
      } else if (isButtonUi) {
        // Quando è già dentro il tratto dell'icona: è libera di circolare lungo il tratto grazie al Distance Field!
        // Quando è fuori (spinta dal mouse o in volo tra bottoni): rientra con traiettoria curva individuale
        const zId = p.currentZone;
        if (zId === p.goalZone && zId > 0) {
          const df = sampleDistanceField(p.x, p.y);
          if (df.distPx > 0) {
            p.vx += df.inwardX * 0.52 * zoneWake * dt;
            p.vy += df.inwardY * 0.52 * zoneWake * dt;
          }
          const adx = p.anchorX - p.x;
          const ady = p.anchorY - p.y;
          const aDist = Math.hypot(adx, ady);
          if (aDist > 1.8) {
            const tether = 0.085 * clamp(aDist / 16, 0.25, 1.2) * p.mobility * zoneWake * dt;
            p.vx += (adx / aDist) * tether;
            p.vy += (ady / aDist) * tether;
          }
        } else {
          const adx = p.anchorX - p.x;
          const ady = p.anchorY - p.y;
          const aDist = Math.hypot(adx, ady) || 1;
          const nx = adx / aDist;
          const ny = ady / aDist;
          const swirl = (p.morphSwirl || 0) * clamp(aDist / 95, 0, 0.65);
          const pull = 0.42 * clamp(aDist / 200, 0.55, 1.75) * p.mobility * zoneWake * dt;
          p.vx += (nx - ny * swirl) * pull;
          p.vy += (ny + nx * swirl) * pull;
        }
      } else if (isThermoPrev) {
        // Muri sottili della scatoletta Thermo: completi su tutti i 4 lati ma morbidi e vivi
        const adx = p.anchorX - p.x;
        const ady = p.anchorY - p.y;
        const aDist = Math.hypot(adx, ady) || 1;
        if (aDist > 0.5) {
          const nx = adx / aDist;
          const ny = ady / aDist;
          const swirl = (p.morphSwirl || 0) * clamp(aDist / 110, 0, 0.55);
          const pull =
            (aDist > 16
              ? 0.42 * clamp(aDist / 240, 0.55, 1.75)
              : clamp(aDist * 0.085, 0.04, 0.38)) *
            p.mobility *
            zoneWake *
            dt;
          p.vx += (nx - ny * swirl) * pull;
          p.vy += (ny + nx * swirl) * pull;
        }
      } else {
        // Lettere grandi e anteprime centrali: richiamo fluido con curvatura individuale + contenimento del bordo
        const zId = p.currentZone;
        if (zId === p.goalZone && zId > 0) {
          const df = sampleDistanceField(p.x, p.y);
          if (df.distPx > 0) {
            const effSoftness = p.fluidFringe ? Math.max(3, softness + 3) : softness * 0.35;
            const borderRatio = effSoftness > 0 ? clamp(df.distPx / effSoftness, 0, 1.8) : 1.2;
            const edgePull = (effSoftness <= 0.4 ? 0.56 : p.fluidFringe ? 0.085 * borderRatio : 0.34 * borderRatio) * zoneWake * dt;
            p.vx += df.inwardX * edgePull;
            p.vy += df.inwardY * edgePull;
          }
          const adx = p.anchorX - p.x;
          const ady = p.anchorY - p.y;
          const aDist = Math.hypot(adx, ady);
          if (aDist > 2.5) {
            const tether = 0.095 * clamp(aDist / 28, 0.25, 1.35) * p.mobility * zoneWake * dt;
            p.vx += (adx / aDist) * tether;
            p.vy += (ady / aDist) * tether;
          }
        } else {
          const ax = p.anchorX - p.x;
          const ay = p.anchorY - p.y;
          const dist = Math.hypot(ax, ay) || 1;
          const nx = ax / dist;
          const ny = ay / dist;
          const swirl = (p.morphSwirl || 0) * clamp(dist / 120, 0, 0.6);
          const df = dist < 24 ? sampleDistanceField(p.x, p.y) : null;
          if (df && df.nearestZone === p.goalZone && df.distPx < 22) {
            const guideStrength = (0.34 + 0.24 * zoneWake) * p.mobility * zoneWake * dt;
            p.vx += (nx * 0.68 + df.inwardX * 0.32) * guideStrength;
            p.vy += (ny * 0.68 + df.inwardY * 0.32) * guideStrength;
          } else {
            const farBoost = clamp(dist / 320, 0.58, 1.8);
            const pull = 0.44 * farBoost * p.mobility * zoneWake * dt;
            p.vx += (nx - ny * swirl) * pull;
            p.vy += (ny + nx * swirl) * pull;
          }
        }
      }
    }

    // Calamita del mouse: nel menu agisce SOLO quando il mouse si muove, proporzionale alla velocità del cursore!
    if (blackHole.active && blackHole.charge > 0.02) {
      const rx = p.x - blackHole.x;
      const ry = p.y - blackHole.y;
      const rz = p.z;
      const dist3 = Math.hypot(rx, ry, rz) || 0.5;
      const nearFactor = clamp(1 - dist3 / 360, 0, 1);
      const bhStrength = (0.4 + 1.05 * blackHole.charge) * CONFIG.magnetForce;

      // 1) Forza tangenziale 3D su asse individuale casuale (sfera caotica)
      const nx = p.bhNx ?? blackHole.nx;
      const ny = p.bhNy ?? blackHole.ny;
      const nz = p.bhNz ?? blackHole.nz;
      const tx = ny * rz - nz * ry;
      const ty = nz * rx - nx * rz;
      const tz = nx * ry - ny * rx;
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const swirlSpeed = (1.1 + 2.2 * nearFactor) * bhStrength * dt;

      // 2) Richiamo morbido al proprio piano orbitale inclinato 3D
      const dotN = rx * nx + ry * ny + rz * nz;
      const planePull = 0.045 * bhStrength * dt;

      // 3) Attrazione radiale infinita verso i gusci sferici del buco nero
      const orbitR = 24 + ((i * 23) % 98);
      const radialErr = dist3 - orbitR;
      const radialPull = clamp(radialErr * 0.036, -1.4, 5.2) * bhStrength * dt;

      p.vx += (tx / tLen) * swirlSpeed - (rx / dist3) * radialPull - dotN * nx * planePull;
      p.vy += (ty / tLen) * swirlSpeed - (ry / dist3) * radialPull - dotN * ny * planePull;
      p.vz += (tz / tLen) * swirlSpeed - (rz / dist3) * radialPull - dotN * nz * planePull;
    } else if (pointerActive && !isAttracting) {
      const moveScale =
        pageView === 'PAGE'
          ? pointerSpeed < 0.45
            ? 0
            : clamp((pointerSpeed - 0.45) / 13.0, 0, 2.2)
          : 1.0;

      if (moveScale > 0.001) {
        const effRad = isButtonUi ? magnetRad * 0.58 : magnetRad;
        const effRadSq = effRad * effRad;
        const mdx = p.x - pointer.x;
        const mdy = p.y - pointer.y;
        const distSq = mdx * mdx + mdy * mdy;

        if (distSq < effRadSq && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - dist / effRad;
          const smoothFalloff = falloff * falloff;
          // Dispersione angolare individuale casuale: ogni pallino reagisce in modo libero, mai in blocco
          const baseAngle = Math.atan2(mdy, mdx);
          const scatterAngle = baseAngle + (p.expelRank - 0.5) * 1.15 + (Math.random() - 0.5) * 0.65;
          const randMag = 0.45 + Math.random() * 0.95;
          const push = smoothFalloff * magnetForce * 1.35 * moveScale * randMag * dt;
          p.vx += Math.cos(scatterAngle) * push + pointer.vx * smoothFalloff * 0.04 * randMag;
          p.vy += Math.sin(scatterAngle) * push + pointer.vy * smoothFalloff * 0.04 * randMag;
          p.vz -= smoothFalloff * magnetForce * 0.85 * moveScale * randMag * dt;
          if (isButtonUi && falloff > 0.25 && Math.random() < 0.35) {
            const anc = pickZoneAnchor(p.goalZone);
            p.anchorX = anc.x;
            p.anchorY = anc.y;
            p.morphSwirl = (Math.random() - 0.5) * 0.75;
          }
        }
      }
    }

    // Fendente / scia d'urto su movimenti rapidi: dispersione casuale per singola particella (mai in blocco)
    if (!blackHole.active && slashTrails.length > 0 && !prefersReducedMotion) {
      const slashRad = isButtonUi ? 36 : clamp(magnetRad * 0.56, 54, 96);
      const slashRadSq = slashRad * slashRad;
      for (let s = 0; s < slashTrails.length; s++) {
        const seg = slashTrails[s];
        const abx = seg.x2 - seg.x1;
        const aby = seg.y2 - seg.y1;
        const projT = clamp(((p.x - seg.x1) * abx + (p.y - seg.y1) * aby) / seg.lenSq, 0, 1);
        const projX = seg.x1 + abx * projT;
        const projY = seg.y1 + aby * projT;
        const sdx = p.x - projX;
        const sdy = p.y - projY;
        const sDistSq = sdx * sdx + sdy * sdy;
        if (sDistSq < slashRadSq) {
          const sDist = Math.sqrt(sDistSq);
          const falloff = 1 - sDist / slashRad;
          const ageFade = 1 - seg.age / seg.maxAge;
          const side = sdx * seg.nx + sdy * seg.ny >= 0 ? 1 : -1;
          const randScale = (isButtonUi ? 0.45 : 0.75) * (0.35 + Math.random() * 1.15);
          const sliceForce = falloff * falloff * ageFade * seg.power * 2.2 * magnetForce * randScale * dt;
          const windForce = falloff * ageFade * seg.power * 0.8 * magnetForce * randScale * dt;
          const baseFx = seg.nx * side * sliceForce + seg.tx * windForce;
          const baseFy = seg.ny * side * sliceForce + seg.ty * windForce;
          const rot = (p.expelRank - 0.5) * 1.25 + (Math.random() - 0.5) * 0.85;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          p.vx += baseFx * cosR - baseFy * sinR;
          p.vy += baseFx * sinR + baseFy * cosR;
          p.vz += (Math.random() - 0.5) * sliceForce * 0.7;
          if (!isButtonUi && falloff > 0.45 && Math.random() < 0.45) {
            p.magneticWake = Math.min(p.magneticWake, 0.42 + Math.random() * 0.35);
            p.bhRecoverRate = Math.max(p.bhRecoverRate || 0, 0.02 + Math.random() * 0.018);
          }
        }
      }
    }

    // Smorzamento 3D: più leggero durante l'espansione iniziale così i pallini volano lontano
    const baseDamp = p.burstDrag * (1 - wake) + CONFIG.damping * wake;
    const damp = Math.pow(baseDamp, dt);
    p.vx *= damp;
    p.vy *= damp;
    p.vz *= damp;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    // Rallenta dolcemente solo le particelle spinte oltre lo schermo dalle onde d'impulso (senza appiattirle su 4 strisce rigide né toccare il Big Bang)
    if (p.bhRecoverRate && explosionElapsed > 3600) {
      const softPad = 8;
      if (p.x < softPad && p.vx < 0) p.vx = (p.vx - (p.x - softPad) * 0.08) * Math.pow(0.76, dt);
      else if (p.x > viewW - softPad && p.vx > 0) p.vx = (p.vx - (p.x - (viewW - softPad)) * 0.08) * Math.pow(0.76, dt);
      if (p.y < softPad && p.vy < 0) p.vy = (p.vy - (p.y - softPad) * 0.08) * Math.pow(0.76, dt);
      else if (p.y > viewH - softPad && p.vy > 0) p.vy = (p.vy - (p.y - (viewH - softPad)) * 0.08) * Math.pow(0.76, dt);
    }
    if (p.splitScale < 1) {
      p.splitScale = Math.min(1, p.splitScale + 0.08 * dt);
    } else if (p.splitScale > 1) {
      p.splitScale = Math.max(1, p.splitScale - 0.04 * dt);
    }
  }

  if (fusedThisFrame > 0) {
    particles = particles.filter((p) => !p.deadFuse);
    shNext = new Int32Array(particles.length);
  }

  pointer.vx *= 0.78;
  pointer.vy *= 0.78;
}

function drawSeedSphere(cx, cy, r, alphaScale, growthNorm) {
  const haloSpread = r * (1.16 + seedHoverCharge * 0.12 + growthNorm * 0.18);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, haloSpread);
  grad.addColorStop(0, 'rgba(10, 10, 10, 1)');
  grad.addColorStop(0.76, 'rgba(18, 18, 18, 0.96)');
  grad.addColorStop(0.9, 'rgba(55, 55, 55, 0.22)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.globalAlpha = alphaScale;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, haloSpread, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Disegna su sfondo 100% bianco giocando sulle sfumature monocromatiche,
 * con proiezione prospettica e alone volumetrico 3D durante l'esplosione Big Bang.
 */
function renderFrame() {
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewW, viewH);

  const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

  if (simState === STATE.IDLE_SEED || simState === STATE.GROWING) {
    const r = Math.max(1, seedCurrentRadius);
    const growthNorm = clamp((r - seedIdleRadius) / Math.max(1, seedMaxRadius - seedIdleRadius), 0, 1);
    drawSeedSphere(cx, cy, r, 1, growthNorm);
    return;
  }

  if (simState === STATE.IMPLODING && implodeMerging) {
    drawSeedSphere(cx, cy, Math.max(1, seedCurrentRadius), 1, 0);
    return;
  }

  if (pageView === 'THERMO') {
    renderThermoFrame();
    return;
  }

  if (pageView === 'LAB') {
    renderLabFrame();
    return;
  }

  const dotBase = CONFIG.dotSize;
  const cullPad = dotBase * 10;
  const total = particles.length;
  const hoverGroup = pointer.hoverGroup;
  const particleMergeFade =
    simState === STATE.IMPLODING && implodeMerging ? Math.max(0, 1 - implodeMergeAlpha * 0.9) : 1;

  const focal = Math.max(580, Math.min(viewW, viewH) * 0.95);
  const cosY = Math.cos(camYaw);
  const sinY = Math.sin(camYaw);
  const cosP = Math.cos(camPitch);
  const sinP = Math.sin(camPitch);

  // Ordina per Z durante i voli 3D (esplosione/implosione/buco nero 3D)
  const needsDepthSort =
    simState === STATE.EXPLODING ||
    simState === STATE.IMPLODING ||
    blackHole.charge > 0.02 ||
    explosionElapsed < 3400;

  if (needsDepthSort) {
    if (drawOrder.length !== total) {
      drawOrder = new Int32Array(total);
      drawDepth = new Float32Array(total);
    }

    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const dx = p.x - cx;
      const dy = p.y - cy;
      const rz1 = dx * sinY + p.z * cosY;
      const rz = dy * sinP + rz1 * cosP;
      drawOrder[i] = i;
      drawDepth[i] = rz;
    }
    drawOrder.sort((a, b) => drawDepth[a] - drawDepth[b]);
  }

  for (let k = 0; k < total; k++) {
    const i = needsDepthSort ? drawOrder[k] : k;
    const p = particles[i];

    const dx = p.x - cx;
    const dy = p.y - cy;
    const rx = dx * cosY - p.z * sinY;
    const rz1 = dx * sinY + p.z * cosY;
    const ry = dy * cosP - rz1 * sinP;
    const rz = needsDepthSort ? drawDepth[i] : dy * sinP + rz1 * cosP;

    // Esclude solo particelle oltre il piano focale, con dissolvenza morbida vicinissimo all'obiettivo
    if (rz > focal * 0.88) continue;

    const persp = Math.min(5.0, focal / Math.max(95, focal - rz));
    const drawX = cx + rx * persp;
    const drawY = cy + ry * persp;

    if (drawX < -cullPad || drawX > viewW + cullPad || drawY < -cullPad || drawY > viewH + cullPad) {
      continue;
    }

    const speed = Math.hypot(p.vx, p.vy, p.vz);
    const speedShade = Math.min(80, speed * 3.8);

    const zId = p.currentZone;
    const curZone = zId > 0 ? zones[zId] : null;
    const goalZoneObj = p.goalZone > 0 && p.goalZone < zones.length ? zones[p.goalZone] : null;
    const effZone = curZone || goalZoneObj;
    const isButtonUi = Boolean(effZone && effZone.isButtonUi);
    const isThermoWall = Boolean(effZone && effZone.isThermoPreview && !p.thermoPreviewInner);
    const isHoveredButton = hoverGroup !== 0 && effZone && effZone.groupId === hoverGroup;
    const isCrispUi = Boolean(effZone && effZone.isCrispUi);
    const isThermoInnerGas = Boolean(
      ((curZone && curZone.isThermoPreview) || (goalZoneObj && goalZoneObj.isThermoPreview)) &&
      p.thermoPreviewInner
    );
    const isActiveMenuBtn = Boolean(effZone && effZone.isActiveMenu);
    const isInactiveMenuBtn = Boolean(
      effZone && effZone.groupId >= 11 && effZone.groupId <= 14 && !effZone.isActiveMenu
    );

    let gray = Math.round(p.shadeBase + speedShade);
    let alpha = p.alphaBase * particleMergeFade;

    const depthNorm = rz / focal;
    if (depthNorm < 0) {
      gray += Math.round(-depthNorm * 68);
      alpha *= clamp(1 + depthNorm * 0.35, 0.55, 1);
    } else {
      gray -= Math.round(depthNorm * 28);
      if (rz > focal * 0.76) {
        alpha *= clamp((focal * 0.88 - rz) / (focal * 0.12), 0, 1);
      }
    }

    if (zId === 0 && !isButtonUi && !isThermoWall && !isThermoInnerGas && simState !== STATE.IMPLODING) {
      gray = Math.min(165, gray + 28);
      alpha *= p.fluidFringe ? 0.62 : 0.85;
    } else if (isCrispUi) {
      gray = Math.min(16, Math.max(2, gray - 26));
      alpha = Math.min(1, alpha + 0.22);
    } else if (isActiveMenuBtn) {
      gray = Math.min(10, gray);
      alpha = Math.min(1, alpha + 0.16);
    } else if (isInactiveMenuBtn && !isHoveredButton) {
      gray = Math.min(125, gray + 48);
      alpha *= 0.78;
    } else if (p.fluidFringe && CONFIG.edgeSoftness > 0) {
      alpha *= 0.82;
    }

    if (isHoveredButton) {
      gray = Math.max(0, gray - 36);
      alpha = Math.min(1, alpha + 0.18);
    }

    gray = clamp(gray, 2, 175);
    const roleScale = isCrispUi
      ? 0.94
      : isThermoInnerGas
      ? 1.08
      : isActiveMenuBtn
      ? 1.18
      : isHoveredButton
      ? 1.12
      : isInactiveMenuBtn
      ? 0.94
      : 1.0;
    const effSizeFactor = isButtonUi ? 0.92 + (p.sizeFactor - 0.8) * 0.35 : p.sizeFactor;
    const radius = dotBase * effSizeFactor * (p.splitScale ?? 1) * persp * roleScale;
    const haloWeight =
      simState === STATE.IMPLODING
        ? 0
        : clamp(1 - (p.magneticWake - 0.35) / 0.55, 0, 1);

    if (haloWeight > 0.02) {
      const spriteIdx = clamp(Math.round((gray / 200) * (INK_SPRITES.length - 1)), 0, INK_SPRITES.length - 1);
      const spriteRad = radius * 3.1;
      ctx.globalAlpha = alpha * haloWeight;
      ctx.drawImage(
        INK_SPRITES[spriteIdx],
        drawX - spriteRad,
        drawY - spriteRad,
        spriteRad * 2,
        spriteRad * 2
      );
    }

    if (haloWeight < 0.98) {
      ctx.globalAlpha = alpha * (1 - haloWeight);
      ctx.fillStyle =
        isThermoInnerGas && simState !== STATE.IMPLODING
          ? (p.expelRank < 0.18 ? '#2563eb' : '#dc2626')
          : GRAY_STYLES[gray];
      ctx.beginPath();
      ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Nucleo del buco nero orbitale quando attivo
  if (blackHole.active && blackHole.charge > 0.08) {
    const coreR = 3 + 6 * blackHole.charge;
    ctx.globalAlpha = 0.85 * blackHole.charge;
    ctx.fillStyle = GRAY_STYLES[10];
    ctx.beginPath();
    ctx.arc(blackHole.x, blackHole.y, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rimbalzo elastico dalla singolarità puntiforme alla sfera 2D originale
  if (simState === STATE.IMPLODING && implodeMerging && implodeMergeAlpha > 0) {
    drawSeedSphere(cx, cy, seedCurrentRadius, implodeMergeAlpha, 0);
  }
  ctx.globalAlpha = 1;
}

function applyTypedWord(nextWord, isCustom) {
  // Salva chi apparteneva al pulsante tondo di avvio prima di ricostruire la maschera
  const wasCircleBtn = new Uint8Array(particles.length);
  for (let i = 0; i < particles.length; i++) {
    const gz = particles[i].goalZone;
    const zn = gz > 0 && gz < zones.length ? zones[gz] : null;
    if (zn && zn.groupId === 2) wasCircleBtn[i] = 1;
  }

  displayWord = nextWord;
  customWordActive = isCustom;
  buildLayoutMask(true);

  const letterZoneIds = [];
  let circleZoneId = 0;
  for (let z = 1; z < zones.length; z++) {
    const zn = zones[z];
    if (!zn || zn.pixels.length === 0) continue;
    if (zn.groupId === 1) {
      letterZoneIds.push(z);
    } else if (zn.groupId === 2) {
      circleZoneId = z;
    }
  }
  // Panning spaziale stereo sulla posizione reale dell'ultima lettera digitata
  const lastLetterZoneId = letterZoneIds[letterZoneIds.length - 1];
  const lastLetterX = lastLetterZoneId && zones[lastLetterZoneId] ? zones[lastLetterZoneId].cx : viewW * 0.5;
  playTypeTick(screenToPan(lastLetterX));
  if (letterZoneIds.length === 0) return;

  const circleQuota = circleZoneId > 0 ? Math.round(zones[circleZoneId].targetCount) : 0;
  let keptCircle = 0;
  const toReassign = [];
  const activeTotal = Math.min(particles.length, Math.max(1, effectiveParticleCount));

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.thermoPreviewInner = false;
    p.morphSwirl = 0;
    if (i < activeTotal && circleZoneId > 0 && wasCircleBtn[i] && keptCircle < circleQuota) {
      p.goalZone = circleZoneId;
      keptCircle++;
    } else {
      toReassign.push(i);
    }
  }

  const targetZones = [...letterZoneIds];
  const quotaMap = new Map();
  for (let k = 0; k < letterZoneIds.length; k++) {
    const z = letterZoneIds[k];
    quotaMap.set(z, Math.max(1, zones[z].targetCount));
  }
  if (circleZoneId > 0 && keptCircle < circleQuota) {
    targetZones.push(circleZoneId);
    quotaMap.set(circleZoneId, circleQuota - keptCircle);
  }

  assignWeightedGoals(toReassign, targetZones, quotaMap, true);
}

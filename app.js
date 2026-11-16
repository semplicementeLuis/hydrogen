(() => {
  'use strict';

  /**
   * Configurazione centralizzata: modifica questi valori (o premi D nella pagina)
   * per regolare dimensione, numero, morbidezza dei confini e fisica degli atomi.
   */
  const DEFAULT_CONFIG = {
    particleCount: 4000,
    dotSize: 1.8,
    brownianStrength: 0.42,
    edgeSoftness: 7,
    damping: 0.885,
    magnetRadius: 145,
    magnetForce: 1.3,
    growDurationMs: 1400,
  };

  const CONFIG = { ...DEFAULT_CONFIG };

  /**
   * Cronologia delle epoche sull'asse temporale in basso (Step 1):
   * 0: Singolarità / Big Bang (riavvolge al punto bianco iniziale)
   * 1: Quark e Gluoni / Adronizzazione (zoom nella particella isolata)
   * 2: Primi Atomi / Idrogeno (scena attiva + impulso)
   */
  const ERAS = [
    { id: 'singularity', t: 0.0, groupId: 2, colorIdx: 0 },
    { id: 'quarks', t: 0.16, groupId: 3, colorIdx: 6 },
    { id: 'hydrogen', t: 0.34, groupId: 4, colorIdx: 5 },
  ];

  // Palette luminosa: bianchi puri per Big Bang + colori QCD (R,G,B) + spettro Idrogeno
  const PALETTE = [
    [255, 255, 255],  // 0: Bianco puro (Singolarità, Big Bang, Gluoni, Bianco stellare)
    [208, 216, 230],  // 1: Bianco argento sfumato (profondità esplosione Big Bang)
    [255, 78, 108],   // 2: Quark Rosso (QCD)
    [56, 238, 156],   // 3: Quark Verde (QCD)
    [76, 166, 255],   // 4: Quark Blu (QCD)
    [68, 232, 246],   // 5: Turchese / Elettrone / Idrogeno
    [158, 106, 255],  // 6: Viola cosmico / Orbita / Asse
    [238, 82, 178],   // 7: Magenta / Idrogeno
    [255, 206, 110],  // 8: Oro caldo (Nucleo protone composto)
  ];

  // Riferimenti DOM
  const stageWrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const btnSeed = document.getElementById('btn-seed');
  const btnNodeSingularity = document.getElementById('btn-node-singularity');
  const btnNodeQuarks = document.getElementById('btn-node-quarks');
  const btnNodeHydrogen = document.getElementById('btn-node-hydrogen');

  const tuningPanel = document.getElementById('tuning-panel');
  const tuningClose = document.getElementById('tuning-close');
  const ctrlCount = document.getElementById('ctrl-count');
  const ctrlSize = document.getElementById('ctrl-size');
  const ctrlBrownian = document.getElementById('ctrl-brownian');
  const ctrlSoftness = document.getElementById('ctrl-softness');
  const ctrlMagnetRadius = document.getElementById('ctrl-magnet-radius');
  const ctrlMagnetForce = document.getElementById('ctrl-magnet-force');
  const ctrlReplay = document.getElementById('ctrl-replay');
  const ctrlReset = document.getElementById('ctrl-reset');

  const outCount = document.getElementById('out-count');
  const outSize = document.getElementById('out-size');
  const outBrownian = document.getElementById('out-brownian');
  const outSoftness = document.getElementById('out-softness');
  const outMagnetRadius = document.getElementById('out-magnet-radius');
  const outMagnetForce = document.getElementById('out-magnet-force');

  // Preferenza ridotta per il movimento
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });

  // Macchina a stati cronologica
  const STATE = {
    IDLE_SEED: 'IDLE_SEED',
    GROWING: 'GROWING',
    BIG_BANG: 'BIG_BANG',
    SLOW_MO_RETICLE: 'SLOW_MO_RETICLE',
    CAMERA_ZOOM_IN: 'CAMERA_ZOOM_IN',
    MICRO_QUARKS: 'MICRO_QUARKS',
    CAMERA_ZOOM_OUT: 'CAMERA_ZOOM_OUT',
    SETTLED: 'SETTLED',
    IMPLODING: 'IMPLODING',
  };

  let simState = STATE.IDLE_SEED;
  let stateTime = 0;
  let orbitAngle = 0;
  let lastTimestamp = 0;
  let rafId = null;
  let isPaused = false;

  // Dimensioni logiche viewport
  let viewW = Math.floor(window.innerWidth);
  let viewH = Math.floor(window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Griglie layout e Chamfer Distance Field
  let zoneGrid = new Uint8Array(0);
  const DF_SCALE = 2;
  let dfW = 0;
  let dfH = 0;
  let dfDist = new Int32Array(0);
  let dfZone = new Uint8Array(0);

  let zones = [];
  let totalMaskArea = 0;
  let idealSpacing = 8;

  let layoutBounds = {
    cx: 0,
    cy: 0,
    seedIdleRadius: 15,
    seedMaxRadius: 115,
    atom: { x: 0, y: 0, rx: 90, ry: 48, tilt: -0.22, nucleusR: 16 },
    timeline: { y: 0, left: 0, right: 0, width: 400 },
    nodes: [],
  };

  // Pool finito di particelle macroscopiche
  let particles = [];
  const ELECTRON_COUNT = 58;

  // Spatial Hash Grid isotropo per densità uniforme
  let shCellSize = 12;
  let shCols = 0;
  let shRows = 0;
  let shHead = new Int32Array(0);
  let shNext = new Int32Array(0);

  // Camera & Riquadro bianco sulla particella isolata
  let camX = 0;
  let camY = 0;
  let camZoom = 1;
  let zoomStartX = 0;
  let zoomStartY = 0;
  let heroIdx = 0;
  let reticleSize = 96;
  let reticleAlpha = 0;
  let returnToSettledAfterMicro = false;

  // Micro-scena: 3 Quark (R, G, B) + Gluoni + Elettrone
  const micro = {
    time: 0,
    quarks: [],
    gluons: [],
    gluonTimer: 0,
    electron: { active: false, x: 0, y: 0, vx: 0, vy: 0, angle: 0, radius: 0, trail: [] },
    opacity: 0,
  };

  // Sprite glow pre-renderizzati per prestazioni a 60fps
  const SPRITE_SIZE = 64;
  const glowSprites = PALETTE.map(([r, g, b]) => {
    const sc = document.createElement('canvas');
    sc.width = SPRITE_SIZE;
    sc.height = SPRITE_SIZE;
    const sctx = sc.getContext('2d');
    const half = SPRITE_SIZE / 2;

    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.92)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.32)`);
    grad.addColorStop(0.76, `rgba(${r}, ${g}, ${b}, 0.08)`);
    grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return sc;
  });

  // Stato puntatore / calamita
  const pointer = {
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    active: false,
    down: false,
    downTime: 0,
    downX: 0,
    downY: 0,
    hoverGroup: 0, // 0, 2 (Singolarità), 3 (Quarks), 4 (Idrogeno), 99 (seed centrale)
  };

  // Stato singolarità centrale e fusione in ritorno
  let seedHoverCharge = 0;
  let seedCurrentRadius = 15;
  let seedStartRadius = 15;
  let implodeMerging = false;
  let implodeMergeTime = 0;
  let implodeMergeAlpha = 0;

  // Onda di impulso energetico
  let pulseWave = { active: false, x: 0, y: 0, prevRadius: 0, radius: 0, maxRadius: 0, power: 0 };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function easeInCubic(t) {
    return t * t * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getElectronPosition(angleOffset = 0) {
    const { atom } = layoutBounds;
    const a = orbitAngle + angleOffset;
    const lx = Math.cos(a) * atom.rx;
    const ly = Math.sin(a) * atom.ry;
    const cosT = Math.cos(atom.tilt);
    const sinT = Math.sin(atom.tilt);
    return {
      x: atom.x + lx * cosT - ly * sinT,
      y: atom.y + lx * sinT + ly * cosT,
    };
  }

  function updateZoneTargets() {
    if (totalMaskArea <= 0) return;
    const structuralBudget = Math.max(100, CONFIG.particleCount - ELECTRON_COUNT);
    const density = structuralBudget / totalMaskArea;
    idealSpacing = clamp(Math.sqrt(1 / Math.max(0.0005, density)) * 0.92, 4.5, 16);

    for (let z = 1; z < zones.length; z++) {
      const zone = zones[z];
      zone.targetCount = zone.area * density;
    }

    shCellSize = Math.max(8, Math.ceil(idealSpacing * 1.15));
    shCols = Math.ceil(viewW / shCellSize) + 2;
    shRows = Math.ceil(viewH / shCellSize) + 2;
    shHead = new Int32Array(shCols * shRows);
  }

  function buildLayoutMask() {
    viewW = Math.max(320, Math.floor(window.innerWidth));
    viewH = Math.max(320, Math.floor(window.innerHeight));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const minDim = Math.min(viewW, viewH);

    const seedIdleRadius = clamp(minDim * 0.021, 11, 19);
    const seedMaxRadius = clamp(minDim * 0.16, 86, 155);

    const atomY = viewH * 0.25;
    const orbitRx = clamp(minDim * 0.145, 58, 128);
    const orbitRy = orbitRx * 0.52;
    const nucleusR = clamp(orbitRx * 0.18, 11, 21);

    const textY = viewH * 0.52;

    const tlY = viewH * 0.80;
    const tlW = clamp(viewW * 0.58, 240, 680);
    const tlLeft = cx - tlW * 0.5;
    const tlRight = cx + tlW * 0.5;
    const nodeR = clamp(minDim * 0.023, 13, 20);

    const eraNodes = ERAS.map((era) => ({
      ...era,
      x: tlLeft + tlW * era.t,
      y: tlY,
      r: nodeR,
    }));

    layoutBounds = {
      cx,
      cy,
      seedIdleRadius,
      seedMaxRadius,
      atom: { x: cx, y: atomY, rx: orbitRx, ry: orbitRy, tilt: -0.22, nucleusR },
      timeline: { y: tlY, left: tlLeft, right: tlRight, width: tlW },
      nodes: eraNodes,
    };

    if (simState === STATE.IDLE_SEED) {
      seedCurrentRadius = seedIdleRadius;
      camX = cx;
      camY = cy;
      camZoom = 1;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = viewW;
    offscreen.height = viewH;
    const octx = offscreen.getContext('2d', { willReadFrequently: true });

    zoneGrid = new Uint8Array(viewW * viewH);
    zones = [null];
    totalMaskArea = 0;

    const registerZone = (zoneId, groupId, colorIdx, drawFn) => {
      octx.clearRect(0, 0, viewW, viewH);
      octx.save();
      drawFn(octx);
      octx.restore();

      const img = octx.getImageData(0, 0, viewW, viewH).data;
      const pixels = [];
      let sumX = 0;
      let sumY = 0;

      for (let y = 0; y < viewH; y++) {
        const rowOffset = y * viewW;
        for (let x = 0; x < viewW; x++) {
          const alpha = img[(rowOffset + x) * 4 + 3];
          if (alpha > 45) {
            const idx = rowOffset + x;
            zoneGrid[idx] = zoneId;
            pixels.push({ x, y });
            sumX += x;
            sumY += y;
          }
        }
      }

      const area = pixels.length;
      totalMaskArea += area;
      zones[zoneId] = {
        id: zoneId,
        groupId,
        colorIdx,
        pixels,
        area,
        cx: area > 0 ? sumX / area : cx,
        cy: area > 0 ? sumY / area : cy,
        targetCount: 0,
        currentCount: 0,
        charge: 0,
      };
    };

    // Zone 1..8: HYDROGEN
    const fontSize = clamp(viewW * 0.122, 42, 152);
    const letterSpacing = fontSize * 0.085;
    octx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
    const chars = Array.from('HYDROGEN');
    const widths = chars.map((ch) => octx.measureText(ch).width);
    const totalWordWidth =
      widths.reduce((acc, w) => acc + w, 0) + letterSpacing * Math.max(0, chars.length - 1);

    const letterColors = [7, 7, 6, 6, 6, 5, 5, 5];
    let cursorX = cx - totalWordWidth / 2;
    for (let i = 0; i < chars.length; i++) {
      const charX = cursorX;
      const ch = chars[i];
      registerZone(i + 1, 1, letterColors[i], (c) => {
        c.fillStyle = '#ffffff';
        c.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
        c.textBaseline = 'middle';
        c.textAlign = 'left';
        c.fillText(ch, charX, textY);
      });
      cursorX += widths[i] + letterSpacing;
    }

    // Zone 9: Nucleo protone (oro/magenta)
    registerZone(9, 1, 8, (c) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(cx, atomY, nucleusR, 0, Math.PI * 2);
      c.fill();
    });

    // Zone 10: Orbita elettronica (viola)
    registerZone(10, 1, 6, (c) => {
      c.strokeStyle = '#ffffff';
      c.lineWidth = clamp(orbitRx * 0.068, 4.5, 7);
      c.beginPath();
      c.ellipse(cx, atomY, orbitRx, orbitRy, -0.22, 0, Math.PI * 2);
      c.stroke();
    });

    // Zone 11: Barra dell'asse temporale
    registerZone(11, 1, 6, (c) => {
      c.fillStyle = '#ffffff';
      const barH = 4.5;
      c.beginPath();
      c.roundRect(tlLeft, tlY - barH / 2, tlW, barH, barH / 2);
      c.fill();
    });

    // Zone 12+: Nodi cronologici (0: Singolarità, 1: Quark/Gluoni, 2: Idrogeno)
    eraNodes.forEach((node, idx) => {
      const zId = 12 + idx;
      registerZone(zId, node.groupId, node.colorIdx, (c) => {
        c.strokeStyle = '#ffffff';
        c.fillStyle = '#ffffff';
        c.lineWidth = clamp(node.r * 0.34, 4.5, 6.5);
        c.beginPath();
        c.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        c.stroke();

        c.beginPath();
        c.arc(node.x, node.y, Math.max(4.5, node.r * 0.34), 0, Math.PI * 2);
        c.fill();
      });
    });

    // Chamfer Distance Field simmetrico (2x2)
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

  function createParticle(startX, startY, isElectron) {
    const zCount = Math.max(1, zones.length - 1);
    const initialZone = 1 + Math.floor(Math.random() * zCount);
    const anchor = pickZoneAnchor(initialZone);
    const eAngle = Math.random() * Math.PI * 2;
    const eRad = Math.sqrt(Math.random()) * 7.5;

    return {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      isElectron,
      electronOx: Math.cos(eAngle) * eRad,
      electronOy: Math.sin(eAngle) * eRad,
      goalZone: initialZone,
      anchorX: anchor.x,
      anchorY: anchor.y,
      currentZone: 0,
      colorIdx: Math.random() < 0.68 ? 0 : 1, // Sfumature di bianco iniziali
      sizeFactor: isElectron ? 0.85 + Math.random() * 0.45 : 0.72 + Math.random() * 0.58,
      alphaBase: isElectron ? 0.85 + Math.random() * 0.15 : 0.52 + Math.random() * 0.44,
      expelRank: Math.random(),
      mobility: 0.82 + Math.random() * 0.36,
      burstDrag: 0.948 + Math.random() * 0.022,
      returnDelay: 250 + Math.random() * 1400,
      returnDuration: 850 + Math.random() * 1300,
      magneticWake: 0,
    };
  }

  function syncParticleCount(recreateAll) {
    const targetCount = CONFIG.particleCount;
    const { cx, cy } = layoutBounds;

    if (recreateAll || particles.length === 0) {
      particles = [];
      for (let i = 0; i < targetCount; i++) {
        particles.push(createParticle(cx, cy, i < ELECTRON_COUNT));
      }
      shNext = new Int32Array(particles.length);
      return;
    }

    if (particles.length < targetCount) {
      while (particles.length < targetCount) {
        const idx = particles.length;
        const isElectron = idx < ELECTRON_COUNT;
        const zId = 1 + (idx % Math.max(1, zones.length - 1));
        const anchor = isElectron ? getElectronPosition() : pickZoneAnchor(zId);
        const startX = simState === STATE.SETTLED ? anchor.x + (Math.random() - 0.5) * 16 : cx;
        const startY = simState === STATE.SETTLED ? anchor.y + (Math.random() - 0.5) * 16 : cy;
        const p = createParticle(startX, startY, isElectron);
        p.goalZone = zId;
        p.anchorX = anchor.x;
        p.anchorY = anchor.y;
        p.magneticWake = simState === STATE.SETTLED ? 1 : 0;
        particles.push(p);
      }
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }

    shNext = new Int32Array(particles.length);
  }

  function syncHitboxes() {
    const { cx, cy, seedIdleRadius, nodes } = layoutBounds;

    const seedHitR = Math.max(seedIdleRadius * 2.4, 38);
    btnSeed.style.left = `${cx - seedHitR}px`;
    btnSeed.style.top = `${cy - seedHitR}px`;
    btnSeed.style.width = `${seedHitR * 2}px`;
    btnSeed.style.height = `${seedHitR * 2}px`;

    const hitButtons = [btnNodeSingularity, btnNodeQuarks, btnNodeHydrogen];
    nodes.forEach((node, i) => {
      const btn = hitButtons[i];
      if (!btn || !node) return;
      const hitR = node.r + 14;
      btn.style.left = `${node.x - hitR}px`;
      btn.style.top = `${node.y - hitR}px`;
      btn.style.width = `${hitR * 2}px`;
      btn.style.height = `${hitR * 2}px`;
    });

    const showSeed = simState === STATE.IDLE_SEED;
    const showNodes = simState === STATE.SETTLED;
    btnSeed.hidden = !showSeed;
    btnNodeSingularity.hidden = !showNodes;
    btnNodeQuarks.hidden = !showNodes;
    btnNodeHydrogen.hidden = !showNodes;
  }

  function startBigBangSequence() {
    if (simState !== STATE.IDLE_SEED && simState !== STATE.IMPLODING) return;
    simState = STATE.GROWING;
    stateTime = 0;
    seedStartRadius = seedCurrentRadius;
    camX = layoutBounds.cx;
    camY = layoutBounds.cy;
    camZoom = 1;
    syncHitboxes();
  }

  /**
   * Big Bang puramente in sfumature di bianco:
   * proietta la materia verso l'esterno separandola prima del rallentatore e del riquadro bianco.
   */
  function triggerWhiteBigBang() {
    simState = STATE.BIG_BANG;
    stateTime = 0;
    returnToSettledAfterMicro = false;

    const { cx, cy } = layoutBounds;
    const sphereR = seedCurrentRadius;
    const diag = Math.hypot(viewW, viewH);
    const speedScale = prefersReducedMotion ? 0.35 : 1;

    if (particles.length !== CONFIG.particleCount) {
      syncParticleCount(true);
    } else if (shNext.length !== particles.length) {
      shNext = new Int32Array(particles.length);
    }

    const total = particles.length;
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const u = Math.random();
      const radialNorm = Math.sqrt(u);
      const r = radialNorm * sphereR;
      const angle = Math.random() * Math.PI * 2;

      p.x = cx + Math.cos(angle) * r;
      p.y = cy + Math.sin(angle) * r;

      const burstSpeed =
        (0.22 + radialNorm * 0.68 + Math.random() * 0.72) * (diag * 0.033) * speedScale;
      const swirl = (Math.random() - 0.5) * 0.28;
      p.vx = Math.cos(angle + swirl) * burstSpeed;
      p.vy = Math.sin(angle + swirl) * burstSpeed;

      // Solo sfumature di bianco durante l'esplosione
      p.colorIdx = Math.random() < 0.65 ? 0 : 1;
      p.alphaBase = 0.45 + Math.random() * 0.52;
      p.burstDrag = 0.946 + Math.random() * 0.022;
      p.returnDelay = 250 + Math.random() * 1400;
      p.returnDuration = 850 + Math.random() * 1300;
      p.magneticWake = 0;
      p.currentZone = 0;
    }

    syncHitboxes();
  }

  /**
   * Seleziona la particella bersaglio per il riquadro bianco:
   * - Dopo il Big Bang: una singola particella isolata nello spazio aperto.
   * - Dalla scena Idrogeno (Nodo 2): una particella del nucleo dell'atomo.
   */
  function pickHeroParticle(preferNucleus) {
    if (preferNucleus) {
      let bestIdx = 0;
      let bestDist = Infinity;
      const { atom } = layoutBounds;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.isElectron) continue;
        const d = Math.hypot(p.x - atom.x, p.y - atom.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      heroIdx = bestIdx;
      return particles[heroIdx];
    }

    // Cerca una particella ben isolata ma vicina al centro dello schermo
    const { cx, cy } = layoutBounds;
    const maxCenterR = Math.min(viewW, viewH) * 0.22;

    let bestIdx = 0;
    let bestScore = -Infinity;
    const step = Math.max(1, Math.floor(particles.length / 220));

    for (let i = 0; i < particles.length; i += step) {
      const p = particles[i];
      const distCenter = Math.hypot(p.x - cx, p.y - cy);
      if (distCenter > maxCenterR) continue;

      let nearestSq = Infinity;
      for (let j = 0; j < particles.length; j += 4) {
        if (j === i) continue;
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < nearestSq) nearestSq = dSq;
      }

      const isolation = Math.sqrt(nearestSq);
      const score = isolation - distCenter * 0.55;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    heroIdx = bestIdx;
    const hero = particles[heroIdx];
    hero.colorIdx = 0;
    hero.alphaBase = 1;
    return hero;
  }

  /**
   * Inizializza la micro-scena interna alla particella:
   * 3 Quark (Rosso, Verde, Blu) separati che si avvicinano scambiandosi Gluoni di luce,
   * formando un Protone che poi cattura il primo Elettrone (primo atomo di Idrogeno).
   */
  function initMicroScene() {
    const { cx, cy } = layoutBounds;
    const minDim = Math.min(viewW, viewH);
    const startR = clamp(minDim * 0.22, 95, 180);

    micro.time = 0;
    micro.gluons = [];
    micro.gluonTimer = 0;
    micro.opacity = 0;
    micro.orbitKickApplied = false;

    // 3 Quark separati (Rosso, Verde, Blu) che prima si condensano da energia bianca
    const quarkColors = [2, 3, 4];
    const baseAngles = [-Math.PI / 2, Math.PI / 6 + 0.15, (5 * Math.PI) / 6 - 0.15];

    micro.quarks = quarkColors.map((colorIdx, idx) => {
      const a = baseAngles[idx];
      const x = cx + Math.cos(a) * startR;
      const y = cy + Math.sin(a) * startR;

      // Sotto-particelle che partono disperse in energia bianca e si condensano formando il quark
      const subDots = Array.from({ length: 24 }, () => {
        const sa = Math.random() * Math.PI * 2;
        const sr = Math.sqrt(Math.random()) * clamp(minDim * 0.025, 11, 19);
        const ox = Math.cos(sa) * sr;
        const oy = Math.sin(sa) * sr;
        const scatterAngle = sa + (Math.random() - 0.5) * 1.1;
        const scatterMult = 2.8 + Math.random() * 1.8;
        return {
          ox,
          oy,
          spawnOx: Math.cos(scatterAngle) * sr * scatterMult,
          spawnOy: Math.sin(scatterAngle) * sr * scatterMult,
          phase: Math.random() * Math.PI * 2,
          size: 0.7 + Math.random() * 0.75,
        };
      });

      return {
        x,
        y,
        homeX: x,
        homeY: y,
        vx: 0,
        vy: 0,
        baseAngle: a,
        colorIdx,
        subDots,
      };
    });

    micro.electron = {
      active: false,
      x: cx + minDim * 0.56,
      y: cy - minDim * 0.28,
      angle: -0.45,
      radius: minDim * 0.62,
      targetRadius: clamp(minDim * 0.25, 105, 195),
      trail: [],
    };
  }

  /**
   * Avvia il rallentatore con riquadro bianco e zoom dentro una particella (anche dal Nodo 2 dell'asse).
   */
  function enterMicroQuarksView(fromSettled) {
    returnToSettledAfterMicro = fromSettled;
    pickHeroParticle(fromSettled);
    simState = STATE.SLOW_MO_RETICLE;
    stateTime = 0;
    reticleSize = 112;
    reticleAlpha = 0;
    camX = layoutBounds.cx;
    camY = layoutBounds.cy;
    camZoom = 1;
    initMicroScene();
    syncHitboxes();
  }

  function implodeToSeed() {
    if (simState !== STATE.SETTLED) return;
    simState = STATE.IMPLODING;
    stateTime = 0;
    implodeMerging = false;
    implodeMergeTime = 0;
    implodeMergeAlpha = 0;

    const coreR = layoutBounds.seedIdleRadius * 0.72;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * coreR;
      p.coreOx = Math.cos(angle) * r;
      p.coreOy = Math.sin(angle) * r;
      p.gatherPull = 0.068 + Math.random() * 0.032;
    }

    syncHitboxes();
  }

  function triggerHydrogenPulse() {
    if (simState !== STATE.SETTLED) return;
    const { atom } = layoutBounds;
    pulseWave = {
      active: true,
      x: atom.x,
      y: atom.y,
      prevRadius: 0,
      radius: 10,
      maxRadius: Math.hypot(viewW, viewH) * 0.95,
      power: prefersReducedMotion ? 4.5 : 14.5,
    };
  }

  function updatePointerHover(clientX, clientY) {
    const { cx, cy, seedIdleRadius, nodes } = layoutBounds;

    if (simState === STATE.IDLE_SEED) {
      const distSeed = Math.hypot(clientX - cx, clientY - cy);
      pointer.hoverGroup = distSeed <= Math.max(seedIdleRadius * 2.4, 38) ? 99 : 0;
      canvas.style.cursor = pointer.hoverGroup === 99 ? 'pointer' : 'default';
      return;
    }

    if (simState === STATE.SETTLED) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const dist = Math.hypot(clientX - node.x, clientY - node.y);
        if (dist <= node.r + 14) {
          pointer.hoverGroup = node.groupId;
          canvas.style.cursor = 'pointer';
          return;
        }
      }
    }

    pointer.hoverGroup = 0;
    canvas.style.cursor = pointer.down ? 'grabbing' : 'default';
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

  /**
   * Aggiorna la micro-scena in 3 fasi chiare dopo che la visuale è centrata e pronta:
   * 1) Formazione dei 3 quark separati da fluttuazioni di energia bianca (0 - 1.5s)
   * 2) Avvicinamento e scambio di gluoni fino a legarsi nel protone (1.5s - 4.8s)
   * 3) Cattura del primo elettrone -> primo atomo di Idrogeno (4.8s - 7.8s)
   */
  function updateMicroPhysics(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    micro.time += dtMs;

    const { cx, cy } = layoutBounds;
    const minDim = Math.min(viewW, viewH);
    const quarks = micro.quarks;
    const formDuration = prefersReducedMotion ? 900 : 1500;

    // Fase 1: i 3 quark si stanno formando ancora separati nei propri vertici
    if (micro.time < formDuration) {
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        q.x = q.homeX + Math.sin(micro.time * 0.005 + i * 2) * 2.5;
        q.y = q.homeY + Math.cos(micro.time * 0.0055 + i * 2) * 2.5;
      }
      return;
    }

    // Avvio della fase 2: imprime il momento iniziale ora che la visuale è pronta
    if (!micro.orbitKickApplied) {
      micro.orbitKickApplied = true;
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        const tangAngle = q.baseAngle + Math.PI / 2;
        q.vx = Math.cos(tangAngle) * 1.45;
        q.vy = Math.sin(tangAngle) * 1.45;
      }
    }

    // 1. Forza forte tra i 3 quark: si avvicinano e si legano in un protone danzante
    const eqDist = clamp(minDim * 0.068, 28, 52);
    const bindElapsed = micro.time - formDuration;
    const springStrength = bindElapsed > 1600 ? 0.0155 : 0.01;

    for (let i = 0; i < 3; i++) {
      const q = quarks[i];

      const dxC = cx - q.x;
      const dyC = cy - q.y;
      q.vx += dxC * 0.0046 * dt;
      q.vy += dyC * 0.0046 * dt;

      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const other = quarks[j];
        const dx = other.x - q.x;
        const dy = other.y - q.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        if (dist > eqDist) {
          const pull = (dist - eqDist) * springStrength * dt;
          q.vx += nx * pull;
          q.vy += ny * pull;
        } else {
          const push = (eqDist - dist) * 0.042 * dt;
          q.vx -= nx * push;
          q.vy -= ny * push;
        }
      }

      q.vx += (-dyC * 0.0018 + (Math.random() - 0.5) * 0.42) * dt;
      q.vy += (dxC * 0.0018 + (Math.random() - 0.5) * 0.42) * dt;

      if (pointer.active && simState === STATE.MICRO_QUARKS) {
        const mdx = q.x - pointer.x;
        const mdy = q.y - pointer.y;
        const mDist = Math.hypot(mdx, mdy);
        if (mDist < 130 && mDist > 1) {
          const f = (1 - mDist / 130) * 0.85 * dt;
          q.vx += ((pointer.down ? -mdx : mdx) / mDist) * f;
          q.vy += ((pointer.down ? -mdy : mdy) / mDist) * f;
        }
      }

      q.vx *= Math.pow(0.935, dt);
      q.vy *= Math.pow(0.935, dt);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }

    // 2. Emissione e volo dei gluoni tra i quark in avvicinamento
    const avgSep =
      (Math.hypot(quarks[0].x - quarks[1].x, quarks[0].y - quarks[1].y) +
        Math.hypot(quarks[1].x - quarks[2].x, quarks[1].y - quarks[2].y) +
        Math.hypot(quarks[2].x - quarks[0].x, quarks[2].y - quarks[0].y)) /
      3;

    const emitInterval = clamp(avgSep * 0.44, 36, 118);
    micro.gluonTimer += dtMs;
    if (micro.gluonTimer >= emitInterval && micro.gluons.length < 36) {
      micro.gluonTimer = 0;
      const fromIdx = Math.floor(Math.random() * 3);
      const toIdx = (fromIdx + 1 + Math.floor(Math.random() * 2)) % 3;
      micro.gluons.push({
        fromIdx,
        toIdx,
        t: 0,
        speed: 0.028 + Math.random() * 0.018,
        curveOffset: (Math.random() - 0.5) * clamp(avgSep * 0.55, 22, 65),
        colorIdx: Math.random() < 0.45 ? 0 : quarks[fromIdx].colorIdx,
      });
    }

    for (let i = micro.gluons.length - 1; i >= 0; i--) {
      const g = micro.gluons[i];
      g.t += g.speed * dt;
      if (g.t >= 1) {
        const qFrom = quarks[g.fromIdx];
        const qTo = quarks[g.toIdx];
        const dx = qFrom.x - qTo.x;
        const dy = qFrom.y - qTo.y;
        const len = Math.hypot(dx, dy) || 1;
        qTo.vx += (dx / len) * 0.34;
        qTo.vy += (dy / len) * 0.34;
        micro.gluons.splice(i, 1);
      }
    }

    // 3. Cattura del primo elettrone dopo il legame del protone -> primo atomo di Idrogeno
    const electronTrigger = formDuration + (prefersReducedMotion ? 1600 : 3200);
    if (micro.time > electronTrigger) {
      const el = micro.electron;
      el.active = true;
      el.radius += (el.targetRadius - el.radius) * 0.032 * dt;
      el.angle += 0.042 * dt;
      el.x = cx + Math.cos(el.angle) * el.radius;
      el.y = cy + Math.sin(el.angle) * el.radius * 0.78;

      el.trail.push({ x: el.x, y: el.y, alpha: 0.75 });
      if (el.trail.length > 34) el.trail.shift();
      for (let i = 0; i < el.trail.length; i++) {
        el.trail[i].alpha *= Math.pow(0.93, dt);
      }
    }
  }

  function updateSimulation(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    stateTime += dtMs;

    const { cx, cy, seedIdleRadius, seedMaxRadius, atom } = layoutBounds;
    const orbitSpeed = prefersReducedMotion ? 0.00035 : 0.00165;
    orbitAngle = (orbitAngle + dtMs * orbitSpeed) % (Math.PI * 2);

    // 0. Singolarità bianca iniziale in attesa del tocco
    if (simState === STATE.IDLE_SEED) {
      const targetHover = pointer.hoverGroup === 99 ? 1 : 0;
      seedHoverCharge += (targetHover - seedHoverCharge) * 0.12 * dt;
      const breathAmp = prefersReducedMotion ? 0.5 : 1.9;
      seedCurrentRadius = seedIdleRadius + Math.sin(stateTime * 0.003) * breathAmp + seedHoverCharge * 6;
      return;
    }

    // 1. Espansione della sfera bianca prima del Big Bang
    if (simState === STATE.GROWING) {
      const duration = prefersReducedMotion ? CONFIG.growDurationMs * 0.65 : CONFIG.growDurationMs;
      const progress = clamp(stateTime / duration, 0, 1);
      const eased = easeInOutQuad(progress) * 0.55 + easeInCubic(progress) * 0.45;
      const tremor = prefersReducedMotion ? 0 : Math.sin(stateTime * 0.038) * (progress * 1.5);
      seedCurrentRadius = seedStartRadius + (seedMaxRadius - seedStartRadius) * eased + tremor;

      if (progress >= 1) {
        triggerWhiteBigBang();
      }
      return;
    }

    // 2. Esplosione Big Bang puramente in sfumature di bianco -> separazione particelle
    if (simState === STATE.BIG_BANG) {
      const bangDuration = prefersReducedMotion ? 550 : 880;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const damp = Math.pow(p.burstDrag, dt);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (stateTime >= bangDuration) {
        enterMicroQuarksView(false);
      }
      return;
    }

    // 3. Rallentatore progressivo + centramento del riquadro bianco al centro dello schermo
    if (simState === STATE.SLOW_MO_RETICLE) {
      const dur = prefersReducedMotion ? 900 : 1500;
      const progress = clamp(stateTime / dur, 0, 1);
      const timeScale = 1 - easeOutCubic(progress) * 0.96;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const damp = Math.pow(p.burstDrag, dt * timeScale);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt * timeScale;
        p.y += p.vy * dt * timeScale;
      }

      const hero = particles[heroIdx];
      const centerEase = easeInOutQuad(progress);
      camX = cx + (hero.x - cx) * centerEase;
      camY = cy + (hero.y - cy) * centerEase;
      camZoom = 1 + 0.35 * centerEase;

      reticleAlpha = easeOutCubic(clamp(progress * 1.4, 0, 1));
      reticleSize = 116 - 68 * easeOutCubic(progress);

      if (progress >= 1) {
        simState = STATE.CAMERA_ZOOM_IN;
        stateTime = 0;
        zoomStartX = hero.x;
        zoomStartY = hero.y;
      }
      return;
    }

    // 4. Zoom della visuale perfettamente centrato dentro il riquadro bianco (i quark restano separati fino a fine zoom)
    if (simState === STATE.CAMERA_ZOOM_IN) {
      const dur = prefersReducedMotion ? 950 : 1600;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      const hero = particles[heroIdx];
      camX = hero.x;
      camY = hero.y;
      camZoom = 1.35 * Math.pow(16.66, eased); // Zoom fino a ~22.5x esattamente al centro

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * dt * 0.035;
        p.y += p.vy * dt * 0.035;
      }

      // Rivela i 3 semi separati di energia bianca verso la fine dello zoom senza ancora avvicinarli
      micro.opacity = clamp((camZoom - 4.0) / 10.0, 0, 1);

      if (progress >= 1) {
        simState = STATE.MICRO_QUARKS;
        stateTime = 0;
        micro.opacity = 1;
      }
      return;
    }

    // 5. Interno della particella: Formazione quark -> Avvicinamento & Gluoni -> Protone -> Elettrone
    if (simState === STATE.MICRO_QUARKS) {
      micro.opacity = 1;
      updateMicroPhysics(dtMs);

      const microTotalDuration = prefersReducedMotion ? 4400 : 7800;
      if (stateTime >= microTotalDuration) {
        simState = STATE.CAMERA_ZOOM_OUT;
        stateTime = 0;
        if (!returnToSettledAfterMicro) {
          for (let i = 0; i < particles.length; i++) {
            particles[i].magneticWake = 0;
          }
        }
      }
      return;
    }

    // 6. Zoom-out dal protone/atomo appena formato verso la scena Idrogeno + asse del tempo
    if (simState === STATE.CAMERA_ZOOM_OUT) {
      const dur = prefersReducedMotion ? 950 : 1550;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      camZoom = 22.5 * Math.pow(1 / 22.5, eased);
      const hero = particles[heroIdx];
      camX = hero.x + (cx - hero.x) * eased;
      camY = hero.y + (cy - hero.y) * eased;
      micro.opacity = clamp(1 - progress * 1.45, 0, 1);
      updateMicroPhysics(dtMs * 0.5);

      // Risveglio fluido delle particelle macro mentre torniamo alla scala dell'universo
      const macroStepMs = dtMs * (0.35 + 0.65 * eased);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.magneticWake = clamp(p.magneticWake + macroStepMs / 1100, 0, 1);
      }

      stepMacroDensityPhysics(dt, dtMs);

      if (progress >= 1) {
        simState = STATE.SETTLED;
        stateTime = 0;
        camZoom = 1;
        camX = cx;
        camY = cy;
        micro.opacity = 0;
        syncHitboxes();
      }
      return;
    }

    // 7. Riavvolgimento alla singolarità bianca centrale (Nodo 1 sull'asse)
    if (simState === STATE.IMPLODING) {
      const total = particles.length;
      const gatherThreshSq = Math.pow(seedIdleRadius * 2.1, 2);
      let gatheredCount = 0;
      const mergeShrink = implodeMerging ? 1 - implodeMergeAlpha * 0.45 : 1;

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const targetX = cx + (p.coreOx || 0) * mergeShrink;
        const targetY = cy + (p.coreOy || 0) * mergeShrink;
        const dx = targetX - p.x;
        const dy = targetY - p.y;

        const pull = (implodeMerging ? 0.16 : p.gatherPull || 0.08) * dt;
        const damp = Math.pow(implodeMerging ? 0.72 : 0.8, dt);
        p.vx = (p.vx + dx * pull) * damp;
        p.vy = (p.vy + dy * pull) * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Sbianca gradualmente durante la fusione nella singolarità iniziale
        if (Math.random() < 0.08) {
          p.colorIdx = Math.random() < 0.7 ? 0 : 1;
        }

        const cdx = p.x - cx;
        const cdy = p.y - cy;
        if (cdx * cdx + cdy * cdy <= gatherThreshSq) {
          gatheredCount++;
        }
      }

      if (!implodeMerging) {
        if (gatheredCount >= total * 0.97 || stateTime > 1700) {
          implodeMerging = true;
          implodeMergeTime = 0;
        }
      } else {
        implodeMergeTime += dtMs;
        const mergeDuration = prefersReducedMotion ? 220 : 420;
        implodeMergeAlpha = easeInOutQuad(clamp(implodeMergeTime / mergeDuration, 0, 1));
        seedCurrentRadius = seedIdleRadius;

        if (implodeMergeAlpha >= 1) {
          simState = STATE.IDLE_SEED;
          stateTime = 0;
          seedHoverCharge = 0;
          seedCurrentRadius = seedIdleRadius;
          implodeMerging = false;
          implodeMergeAlpha = 0;
          syncHitboxes();
        }
      }
      return;
    }

    // 8. Scena SETTLED (Presentazione Idrogeno + Asse del tempo + Moto browniano + Calamita)
    for (let i = 0; i < particles.length; i++) {
      if (particles[i].magneticWake < 1) {
        particles[i].magneticWake = clamp(particles[i].magneticWake + dtMs / 1000, 0, 1);
      }
    }
    stepMacroDensityPhysics(dt, dtMs);
  }

  /**
   * Fisica atomica di densità uniforme, cariche +/-, moto browniano e calamita del mouse.
   */
  function stepMacroDensityPhysics(dt, dtMs) {
    if (pulseWave.active) {
      pulseWave.prevRadius = pulseWave.radius;
      pulseWave.radius += 26 * dt;
      if (pulseWave.radius > pulseWave.maxRadius) {
        pulseWave.active = false;
      }
    }

    const total = particles.length;
    const zoneCount = zones.length;
    const softness = CONFIG.edgeSoftness;
    const electronPos = getElectronPosition();

    for (let z = 1; z < zoneCount; z++) {
      zones[z].currentCount = 0;
    }
    if (shNext.length !== total) {
      shNext = new Int32Array(total);
    }
    shHead.fill(-1);

    for (let i = 0; i < total; i++) {
      const p = particles[i];

      if (p.x >= -shCellSize && p.x < viewW + shCellSize && p.y >= -shCellSize && p.y < viewH + shCellSize) {
        const cxCell = clamp(Math.floor(p.x / shCellSize) + 1, 0, shCols - 1);
        const cyCell = clamp(Math.floor(p.y / shCellSize) + 1, 0, shRows - 1);
        const cellIdx = cyCell * shCols + cxCell;
        shNext[i] = shHead[cellIdx];
        shHead[cellIdx] = i;
      }

      if (p.isElectron) {
        p.currentZone = 0;
        continue;
      }

      const ix = Math.round(p.x);
      const iy = Math.round(p.y);
      let zId = 0;
      if (ix >= 0 && ix < viewW && iy >= 0 && iy < viewH) {
        zId = zoneGrid[iy * viewW + ix];
        if (zId === 0 && softness > 0) {
          const df = sampleDistanceField(p.x, p.y);
          if (df.distPx <= softness) {
            zId = df.nearestZone;
          }
        }
      }

      p.currentZone = zId;
      if (zId > 0 && p.magneticWake > 0.25) {
        zones[zId].currentCount++;
      }
    }

    let fallbackBestZone = 1;
    let fallbackMaxDeficit = -Infinity;
    for (let z = 1; z < zoneCount; z++) {
      const zone = zones[z];
      zone.charge = (zone.targetCount - zone.currentCount) / Math.max(1, zone.targetCount);
      if (zone.charge > fallbackMaxDeficit) {
        fallbackMaxDeficit = zone.charge;
        fallbackBestZone = z;
      }
    }

    const brownianBase = CONFIG.brownianStrength * (prefersReducedMotion ? 0.12 : 1);
    const magnetRad = CONFIG.magnetRadius;
    const magnetRadSq = magnetRad * magnetRad;
    const pointerActive = pointer.active && simState === STATE.SETTLED;
    const isAttracting = pointer.down;
    const magnetForce = CONFIG.magnetForce * (isAttracting ? 1.45 : 1.0);
    const repelDist = idealSpacing;
    const repelDistSq = repelDist * repelDist;
    const repelStrength = 0.26;

    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const wake = p.magneticWake;

      if (pulseWave.active) {
        const wdx = p.x - pulseWave.x;
        const wdy = p.y - pulseWave.y;
        const wdist = Math.hypot(wdx, wdy) || 1;
        if (wdist >= pulseWave.prevRadius - 20 && wdist <= pulseWave.radius + 12) {
          const falloff = Math.max(0.25, 1 - wdist / pulseWave.maxRadius);
          const angle = Math.atan2(wdy, wdx) + (Math.random() - 0.5) * 0.38;
          const kick = pulseWave.power * falloff * (0.55 + Math.random() * 0.5);
          p.vx += Math.cos(angle) * kick;
          p.vy += Math.sin(angle) * kick;
        }
      }

      const brownian = brownianBase * (0.3 + 0.7 * wake);
      p.vx += (Math.random() - 0.5) * brownian * dt;
      p.vy += (Math.random() - 0.5) * brownian * dt;

      if (!p.isElectron && wake > 0.2 && p.x >= -shCellSize && p.x < viewW + shCellSize && p.y >= -shCellSize && p.y < viewH + shCellSize) {
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
                if (!q.isElectron) {
                  const rdx = p.x - q.x;
                  const rdy = p.y - q.y;
                  const rDistSq = rdx * rdx + rdy * rdy;
                  if (rDistSq < repelDistSq && rDistSq > 0.01) {
                    const rDist = Math.sqrt(rDistSq);
                    const push = (1 - rDist / repelDist) * repelStrength * wake * dt;
                    p.vx += (rdx / rDist) * push;
                    p.vy += (rdy / rDist) * push;
                  }
                }
              }
              j = shNext[j];
            }
          }
        }
      }

      if (wake > 0.001) {
        if (p.isElectron) {
          const ex = electronPos.x + p.electronOx - p.x;
          const ey = electronPos.y + p.electronOy - p.y;
          const pull = 0.22 * wake * dt;
          p.vx += ex * pull;
          p.vy += ey * pull;
          if (wake > 0.45 && Math.random() < 0.14) {
            p.colorIdx = Math.random() < 0.35 ? 0 : 5;
          }
        } else {
          const zId = p.currentZone;

          if (zId > 0) {
            const zone = zones[zId];

            if (wake > 0.4 && p.colorIdx !== zone.colorIdx && Math.random() < 0.1) {
              if (zId === 9 && Math.random() < 0.35) {
                p.colorIdx = 7; // accento caldo nel protone
              } else if (zId === 13) {
                // Nodo 1 (Quark/Gluoni): mostra i 3 colori QCD!
                p.colorIdx = 2 + Math.floor(Math.random() * 3);
              } else {
                p.colorIdx = zone.colorIdx;
              }
            }

            const excessThreshold = clamp(-zone.charge * 1.35, 0, 0.85);
            if (zone.charge < -0.045 && p.expelRank < excessThreshold) {
              const outX = p.x - zone.cx;
              const outY = p.y - zone.cy;
              const outLen = Math.hypot(outX, outY) || 1;
              const expelPush = (-zone.charge) * 0.85 * wake * dt;
              p.vx += (outX / outLen) * expelPush + (Math.random() - 0.5) * 0.25 * dt;
              p.vy += (outY / outLen) * expelPush + (Math.random() - 0.5) * 0.25 * dt;

              p.goalZone = fallbackBestZone;
              const newAnc = pickZoneAnchor(fallbackBestZone);
              p.anchorX = newAnc.x;
              p.anchorY = newAnc.y;
            } else {
              const df = sampleDistanceField(p.x, p.y);
              if (df.distPx > 0) {
                const borderRatio = softness > 0 ? clamp(df.distPx / softness, 0, 1.5) : 1;
                const edgePull = (softness === 0 ? 0.42 : 0.075 * borderRatio * borderRatio) * wake * dt;
                p.vx += df.inwardX * edgePull;
                p.vy += df.inwardY * edgePull;
              }
              p.goalZone = zId;
            }
          } else {
            let bestZ = fallbackBestZone;
            let bestScore = -Infinity;

            for (let z = 1; z < zoneCount; z++) {
              const zone = zones[z];
              const dx = zone.cx - p.x;
              const dy = zone.cy - p.y;
              const dist = Math.hypot(dx, dy);

              if (zone.charge < -0.04 && dist < 160) {
                const invDist = 1 / Math.max(18, dist);
                const rep = (-zone.charge) * (1 - dist / 160) * 0.9 * wake * dt;
                p.vx -= dx * invDist * rep;
                p.vy -= dy * invDist * rep;
              }

              const hunger = zone.charge > 0 ? zone.charge + 0.08 : (zone.charge + 0.02) * 0.15;
              const score = hunger / (dist + 95);
              if (score > bestScore) {
                bestScore = score;
                bestZ = z;
              }
            }

            if (p.goalZone !== bestZ || Math.random() < 0.015) {
              p.goalZone = bestZ;
              const anc = pickZoneAnchor(bestZ);
              p.anchorX = anc.x;
              p.anchorY = anc.y;
            }

            const df = sampleDistanceField(p.x, p.y);
            if (df.nearestZone === p.goalZone && df.distPx < 90) {
              const guideStrength = (0.28 + 0.25 * wake) * p.mobility * wake * dt;
              const ax = p.anchorX - p.x;
              const ay = p.anchorY - p.y;
              const aLen = Math.hypot(ax, ay) || 1;
              p.vx += (df.inwardX * 0.72 + (ax / aLen) * 0.28) * guideStrength;
              p.vy += (df.inwardY * 0.72 + (ay / aLen) * 0.28) * guideStrength;
            } else {
              const ax = p.anchorX - p.x;
              const ay = p.anchorY - p.y;
              const dist = Math.hypot(ax, ay) || 1;
              const farBoost = clamp(dist / 360, 0.45, 1.85);
              const pull = 0.34 * farBoost * p.mobility * wake * dt;
              p.vx += (ax / dist) * pull;
              p.vy += (ay / dist) * pull;
            }
          }
        }
      }

      if (pointerActive) {
        const mdx = p.x - pointer.x;
        const mdy = p.y - pointer.y;
        const distSq = mdx * mdx + mdy * mdy;

        if (distSq < magnetRadSq && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const falloff = 1 - dist / magnetRad;
          const smoothFalloff = falloff * falloff;
          const nx = mdx / dist;
          const ny = mdy / dist;

          if (isAttracting) {
            const pull = smoothFalloff * magnetForce * 1.65 * dt;
            p.vx -= nx * pull + ny * pull * 0.18;
            p.vy -= ny * pull - nx * pull * 0.18;
          } else {
            const push = smoothFalloff * magnetForce * 1.35 * dt;
            p.vx += nx * push + pointer.vx * smoothFalloff * 0.05;
            p.vy += ny * push + pointer.vy * smoothFalloff * 0.05;
          }
        }
      }

      const baseDamp = p.isElectron ? 0.76 * wake + p.burstDrag * (1 - wake) : p.burstDrag * (1 - wake) + CONFIG.damping * wake;
      const damp = Math.pow(baseDamp, dt);
      p.vx *= damp;
      p.vy *= damp;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    pointer.vx *= 0.78;
    pointer.vy *= 0.78;
  }

  /**
   * Disegna la singolarità iniziale puramente in bianco e sfumature di bianco.
   */
  function drawWhiteSeedSphere(cx, cy, r, alphaScale, growthNorm) {
    const haloSpread = r * (2.4 + seedHoverCharge * 0.4 + growthNorm * 0.7);
    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, haloSpread);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.36, 'rgba(248, 250, 255, 0.96)');
    grad.addColorStop(0.58, 'rgba(218, 224, 236, 0.34)');
    grad.addColorStop(0.82, 'rgba(180, 190, 210, 0.08)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alphaScale;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloSpread, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Disegna il riquadro bianco attorno alla singola particella isolata,
   * che poi si espande oltre lo schermo quando la visuale ci entra dentro.
   */
  function drawWhiteReticle(sx, sy, size, alpha) {
    if (alpha <= 0.01 || size > Math.max(viewW, viewH) * 2.2) return;

    const half = size * 0.5;
    const corner = Math.min(half * 0.45, Math.max(8, size * 0.16));
    const left = sx - half;
    const right = sx + half;
    const top = sy - half;
    const bottom = sy + half;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Sottile cornice quadrata bianca
    ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.42).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, size, size);

    // Angoli bianchi nitidi del mirino
    ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.95).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(left, top + corner);
    ctx.lineTo(left, top);
    ctx.lineTo(left + corner, top);
    // Top-right
    ctx.moveTo(right - corner, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + corner);
    // Bottom-right
    ctx.moveTo(right, bottom - corner);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right - corner, bottom);
    // Bottom-left
    ctx.moveTo(left + corner, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - corner);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Disegna la micro-scena dentro la particella: 3 Quark (R, G, B), scambio di Gluoni luminosi
   * e arrivo del primo Elettrone (formazione del primo atomo di Idrogeno).
   */
  function renderMicroScene(centerX, centerY, scaleFactor, opacity) {
    if (opacity <= 0.01) return;
    const { cx, cy } = layoutBounds;
    const quarks = micro.quarks;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Trasformazione ancorata esattamente alla particella inquadrata durante zoom-in e zoom-out
    const tx = (x) => centerX + (x - cx) * scaleFactor;
    const ty = (y) => centerY + (y - cy) * scaleFactor;

    // 1. Filamenti tratteggiati di forza forte tra i 3 quark
    for (let i = 0; i < 3; i++) {
      const qA = quarks[i];
      const qB = quarks[(i + 1) % 3];
      const x1 = tx(qA.x);
      const y1 = ty(qA.y);
      const x2 = tx(qB.x);
      const y2 = ty(qB.y);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (dist > 6) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.11 * opacity).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.8, 1.2 * scaleFactor);
        ctx.setLineDash([3 * scaleFactor, 6 * scaleFactor]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 2. Gluoni: particelline di luce che viaggiano da un quark all'altro
    for (let i = 0; i < micro.gluons.length; i++) {
      const g = micro.gluons[i];
      const qA = quarks[g.fromIdx];
      const qB = quarks[g.toIdx];

      const x1 = qA.x;
      const y1 = qA.y;
      const x2 = qB.x;
      const y2 = qB.y;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const midX = (x1 + x2) * 0.5 + nx * g.curveOffset;
      const midY = (y1 + y2) * 0.5 + ny * g.curveOffset;

      // Posizione sulla curva di Bézier quadratica
      const t = g.t;
      const omt = 1 - t;
      const gx = omt * omt * x1 + 2 * omt * t * midX + t * t * x2;
      const gy = omt * omt * y1 + 2 * omt * t * midY + t * t * y2;

      const sx = tx(gx);
      const sy = ty(gy);
      const gRad = (5.5 + Math.sin(t * Math.PI) * 3.5) * scaleFactor;

      ctx.globalAlpha = opacity * 0.95;
      ctx.drawImage(glowSprites[g.colorIdx], sx - gRad, sy - gRad, gRad * 2, gRad * 2);

      // Scia luminosa del gluone
      const tPrev = Math.max(0, t - 0.09);
      const omtP = 1 - tPrev;
      const px = omtP * omtP * x1 + 2 * omtP * tPrev * midX + tPrev * tPrev * x2;
      const py = omtP * omtP * y1 + 2 * omtP * tPrev * midY + tPrev * tPrev * y2;
      ctx.globalAlpha = opacity * 0.45;
      ctx.drawImage(
        glowSprites[0],
        tx(px) - gRad * 0.55,
        ty(py) - gRad * 0.55,
        gRad * 1.1,
        gRad * 1.1
      );
    }

    // 3. I 3 Quark: prima si condensano da energia bianca, poi brillano nei propri colori (R, G, B)
    const now = performance.now() * 0.004;
    const formDuration = prefersReducedMotion ? 900 : 1500;
    const formProgress = clamp(micro.time / formDuration, 0, 1);
    const condenseEase = easeOutCubic(formProgress);
    const colorMix = easeInOutQuad(clamp((formProgress - 0.2) / 0.8, 0, 1));

    for (let i = 0; i < 3; i++) {
      const q = quarks[i];
      const qx = tx(q.x);
      const qy = ty(q.y);

      // Alone morbido del singolo quark (da bianco puro a colore QCD)
      const coreGlow = (18 + 10 * condenseEase) * scaleFactor;
      if (colorMix < 0.99) {
        ctx.globalAlpha = opacity * 0.34 * (1 - colorMix);
        ctx.drawImage(glowSprites[0], qx - coreGlow, qy - coreGlow, coreGlow * 2, coreGlow * 2);
      }
      if (colorMix > 0.01) {
        ctx.globalAlpha = opacity * 0.44 * colorMix;
        ctx.drawImage(
          glowSprites[q.colorIdx],
          qx - coreGlow,
          qy - coreGlow,
          coreGlow * 2,
          coreGlow * 2
        );
      }

      // Sotto-particelle che si condensano formando ciascun quark
      for (let k = 0; k < q.subDots.length; k++) {
        const sd = q.subDots[k];
        const curOx = sd.spawnOx + (sd.ox - sd.spawnOx) * condenseEase;
        const curOy = sd.spawnOy + (sd.oy - sd.spawnOy) * condenseEase;
        const jx = Math.cos(now + sd.phase) * 2.2;
        const jy = Math.sin(now * 1.2 + sd.phase) * 2.2;
        const sx = tx(q.x + curOx + jx);
        const sy = ty(q.y + curOy + jy);
        const sr = 4.6 * sd.size * scaleFactor;

        if (colorMix < 0.99) {
          ctx.globalAlpha = opacity * 0.85 * (1 - colorMix);
          ctx.drawImage(glowSprites[0], sx - sr, sy - sr, sr * 2, sr * 2);
        }
        if (colorMix > 0.01) {
          ctx.globalAlpha = opacity * 0.88 * colorMix;
          ctx.drawImage(glowSprites[q.colorIdx], sx - sr, sy - sr, sr * 2, sr * 2);
        }
      }
    }

    // 4. Primo Elettrone che entra in orbita attorno al protone appena legato
    if (micro.electron.active) {
      const el = micro.electron;
      for (let i = 0; i < el.trail.length; i++) {
        const tr = el.trail[i];
        const trRad = 4.2 * scaleFactor;
        ctx.globalAlpha = tr.alpha * opacity * 0.55;
        ctx.drawImage(
          glowSprites[5],
          tx(tr.x) - trRad,
          ty(tr.y) - trRad,
          trRad * 2,
          trRad * 2
        );
      }

      const ex = tx(el.x);
      const ey = ty(el.y);
      const eRad = 15 * scaleFactor;
      ctx.globalAlpha = opacity;
      ctx.drawImage(glowSprites[5], ex - eRad, ey - eRad, eRad * 2, eRad * 2);
      ctx.drawImage(glowSprites[0], ex - eRad * 0.55, ey - eRad * 0.55, eRad * 1.1, eRad * 1.1);
    }

    ctx.restore();
  }

  function renderFrame() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewW, viewH);

    const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

    if (simState === STATE.IDLE_SEED || simState === STATE.GROWING) {
      const r = Math.max(1, seedCurrentRadius);
      const growthNorm = clamp((r - seedIdleRadius) / Math.max(1, seedMaxRadius - seedIdleRadius), 0, 1);
      drawWhiteSeedSphere(cx, cy, r, 1, growthNorm);
      return;
    }

    // Disegna le particelle macroscopiche (con eventuale trasformazione di camera)
    const dotBase = CONFIG.dotSize;
    const total = particles.length;
    const hoverGroup = pointer.hoverGroup;
    const particleMergeFade =
      simState === STATE.IMPLODING && implodeMerging ? Math.max(0, 1 - implodeMergeAlpha * 0.9) : 1;

    // Dissolvenza dell'alone bianco esterno dell'eroe mentre entriamo nella micro-scena
    const macroFadeDuringMicro =
      simState === STATE.MICRO_QUARKS
        ? 0
        : simState === STATE.CAMERA_ZOOM_IN || simState === STATE.CAMERA_ZOOM_OUT
          ? clamp(1 - (camZoom - 2.5) / 7.5, 0, 1)
          : 1;

    if (macroFadeDuringMicro > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const zoomScale = camZoom;
      const cullPad = dotBase * 5 * Math.min(zoomScale, 6);

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const sx = cx + (p.x - camX) * zoomScale;
        const sy = cy + (p.y - camY) * zoomScale;

        if (sx < -cullPad || sx > viewW + cullPad || sy < -cullPad || sy > viewH + cullPad) {
          continue;
        }

        const zId = p.currentZone;
        const isHoveredNode =
          simState === STATE.SETTLED &&
          hoverGroup !== 0 &&
          zId > 0 &&
          zones[zId] &&
          zones[zId].groupId === hoverGroup;

        let alpha = p.alphaBase * particleMergeFade * macroFadeDuringMicro;
        if (simState === STATE.SETTLED && zId === 0 && !p.isElectron) {
          alpha *= 0.72;
        }
        if (isHoveredNode) {
          alpha = Math.min(1, alpha + 0.22);
        }

        const radius =
          dotBase *
          p.sizeFactor *
          (p.isElectron && simState === STATE.SETTLED ? 1.25 : isHoveredNode ? 1.18 : 1.0);
        const spriteRadius = radius * 3.4 * Math.min(zoomScale, 5.5);

        ctx.globalAlpha = alpha;
        ctx.drawImage(
          glowSprites[p.colorIdx],
          sx - spriteRadius,
          sy - spriteRadius,
          spriteRadius * 2,
          spriteRadius * 2
        );
      }
    }

    // Disegna il riquadro bianco attorno alla particella isolata (e lo espande nello zoom-in)
    if (simState === STATE.SLOW_MO_RETICLE || simState === STATE.CAMERA_ZOOM_IN) {
      const hero = particles[heroIdx];
      const hsx = cx + (hero.x - camX) * camZoom;
      const hsy = cy + (hero.y - camY) * camZoom;
      const boxSize =
        simState === STATE.SLOW_MO_RETICLE ? reticleSize : (48 / 1.35) * camZoom;
      const boxAlpha =
        simState === STATE.SLOW_MO_RETICLE
          ? reticleAlpha
          : clamp(1 - (camZoom - 8) / 8, 0, 1);
      drawWhiteReticle(hsx, hsy, boxSize, boxAlpha);
    }

    // Disegna la micro-struttura (3 Quark + Gluoni + Elettrone) ancorata alla particella bersaglio
    if (micro.opacity > 0.01) {
      const hero = particles[heroIdx];
      const microCenterX =
        simState === STATE.MICRO_QUARKS ? cx : cx + (hero.x - camX) * camZoom;
      const microCenterY =
        simState === STATE.MICRO_QUARKS ? cy : cy + (hero.y - camY) * camZoom;
      const microScale =
        simState === STATE.MICRO_QUARKS
          ? 1
          : clamp(camZoom / 22.5, 0.06, 1);
      renderMicroScene(microCenterX, microCenterY, microScale, micro.opacity);
    }

    // Fusione nella singolarità bianca centrale
    if (simState === STATE.IMPLODING && implodeMerging && implodeMergeAlpha > 0) {
      drawWhiteSeedSphere(cx, cy, seedIdleRadius, implodeMergeAlpha, 0);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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

  window.addEventListener('pointermove', (e) => {
    const dx = pointer.active ? e.clientX - pointer.x : 0;
    const dy = pointer.active ? e.clientY - pointer.y : 0;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.vx = clamp(dx, -40, 40);
    pointer.vy = clamp(dy, -40, 40);
    pointer.active = true;

    updatePointerHover(e.clientX, e.clientY);
  });

  window.addEventListener('pointerdown', (e) => {
    if (tuningPanel.contains(e.target)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    pointer.down = true;
    pointer.downTime = performance.now();
    pointer.downX = e.clientX;
    pointer.downY = e.clientY;

    updatePointerHover(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', (e) => {
    if (!pointer.down) return;
    const movedDist = Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY);
    const elapsed = performance.now() - pointer.downTime;
    pointer.down = false;

    if (movedDist < 8 && elapsed < 360) {
      updatePointerHover(e.clientX, e.clientY);
      if (simState === STATE.IDLE_SEED && pointer.hoverGroup === 99) {
        startBigBangSequence();
      } else if (simState === STATE.SETTLED) {
        if (pointer.hoverGroup === 2) {
          implodeToSeed();
        } else if (pointer.hoverGroup === 3) {
          enterMicroQuarksView(true);
        } else if (pointer.hoverGroup === 4) {
          triggerHydrogenPulse();
        }
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
  });

  document.addEventListener('mouseleave', () => {
    pointer.active = false;
    pointer.down = false;
    pointer.hoverGroup = 0;
  });

  // Eventi tastiera sulle hit-area accessibili
  btnSeed.addEventListener('click', (e) => {
    if (e.detail === 0) startBigBangSequence();
  });
  btnNodeSingularity.addEventListener('click', (e) => {
    if (e.detail === 0) implodeToSeed();
  });
  btnNodeQuarks.addEventListener('click', (e) => {
    if (e.detail === 0) enterMicroQuarksView(true);
  });
  btnNodeHydrogen.addEventListener('click', (e) => {
    if (e.detail === 0) triggerHydrogenPulse();
  });

  // Pannello segreto di taratura (tasto D)
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

    if (e.key === 'd' || e.key === 'D') {
      toggleTuningPanel();
    } else if (e.key === 'Escape' && !tuningPanel.hidden) {
      tuningPanel.hidden = true;
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
    simState = STATE.IDLE_SEED;
    stateTime = 0;
    seedCurrentRadius = layoutBounds.seedIdleRadius;
    seedHoverCharge = 0;
    camZoom = 1;
    camX = layoutBounds.cx;
    camY = layoutBounds.cy;
    micro.opacity = 0;
    syncHitboxes();
    startBigBangSequence();
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
  startLoop();
})();

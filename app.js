(() => {
  'use strict';

  /**
   * Configurazione centralizzata: modifica questi valori (o premi D nella pagina)
   * per regolare dimensione, numero, morbidezza dei confini e fisica degli atomi.
   */
  const DEFAULT_CONFIG = {
    particleCount: 4000,
    dotSize: 1.9,
    brownianStrength: 0.42,
    edgeSoftness: 7,
    damping: 0.885,
    magnetRadius: 145,
    magnetForce: 1.3,
    growDurationMs: 1450,
  };

  const CONFIG = { ...DEFAULT_CONFIG };

  /**
   * Registro estensibile delle epoche cosmiche (Step 1: Singolarità + Idrogeno).
   * Nei prossimi step basterà aggiungere qui Nebulose, Stelle e Ferro nel Sangue.
   */
  const ERAS = [
    { id: 'singularity', t: 0.0, groupId: 2, colorIdx: 0 },
    { id: 'hydrogen', t: 0.26, groupId: 3, colorIdx: 3 },
  ];

  // Palette nebulosa vibrante (indice -> [R, G, B])
  const NEBULA_COLORS = [
    [255, 198, 92],   // 0: Oro plasma / Nucleo / Singolarità
    [242, 72, 174],   // 1: Magenta nebulosa
    [156, 94, 255],   // 2: Viola cosmico
    [52, 232, 244],   // 3: Turchese / Elettrone / Idrogeno
    [245, 248, 255],  // 4: Bianco stellare ad alta energia
  ];

  // Riferimenti DOM
  const stageWrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const btnSeed = document.getElementById('btn-seed');
  const btnNodeSingularity = document.getElementById('btn-node-singularity');
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

  // Stato globale della simulazione
  const STATE = {
    IDLE_SEED: 'IDLE_SEED',
    GROWING: 'GROWING',
    EXPLODING: 'EXPLODING',
    SETTLED: 'SETTLED',
    IMPLODING: 'IMPLODING',
  };

  let simState = STATE.IDLE_SEED;
  let stateTime = 0;
  let explosionElapsed = 0;
  let orbitAngle = 0;
  let lastTimestamp = 0;
  let rafId = null;
  let isPaused = false;

  // Dimensioni logiche viewport
  let viewW = Math.floor(window.innerWidth);
  let viewH = Math.floor(window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Griglie layout e Chamfer Distance Field (1..8 = HYDROGEN, 9 = Nucleo, 10 = Orbita, 11 = Asse, 12.. = Nodi epoche)
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

  // Pool finito di particelle (incluse quelle dinamiche dell'elettrone in orbita)
  let particles = [];
  const ELECTRON_COUNT = 58;

  // Spatial Hash Grid isotropo per densità uniforme
  let shCellSize = 12;
  let shCols = 0;
  let shRows = 0;
  let shHead = new Int32Array(0);
  let shNext = new Int32Array(0);

  // Sprite glow pre-renderizzati per prestazioni a 60fps con blending additivo
  const SPRITE_SIZE = 64;
  const glowSprites = NEBULA_COLORS.map(([r, g, b]) => {
    const sc = document.createElement('canvas');
    sc.width = SPRITE_SIZE;
    sc.height = SPRITE_SIZE;
    const sctx = sc.getContext('2d');
    const half = SPRITE_SIZE / 2;

    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 0.94)`);
    grad.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.34)`);
    grad.addColorStop(0.74, `rgba(${r}, ${g}, ${b}, 0.08)`);
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
    hoverGroup: 0, // 0, 2 (nodo Singolarità), 3 (nodo Idrogeno), 99 (singolarità centrale)
  };

  // Stato animazione singolarità centrale e fusione in ritorno
  let seedHoverCharge = 0;
  let seedCurrentRadius = 15;
  let seedStartRadius = 15;
  let implodeMerging = false;
  let implodeMergeTime = 0;
  let implodeMergeAlpha = 0;

  // Onda di impulso energetico dal nodo Idrogeno / atomo
  let pulseWave = { active: false, x: 0, y: 0, prevRadius: 0, radius: 0, maxRadius: 0, power: 0 };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function easeInCubic(t) {
    return t * t * t;
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Calcola la posizione orbitale dell'elettrone sull'ellisse inclinata attorno al nucleo.
   */
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

  /**
   * Calcola le quote bersaglio di ciascuna zona statica in base alla sua area:
   * ogni lettera, componente dell'atomo e parte dell'asse mantiene la stessa densità.
   */
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

  /**
   * Costruisce la scena di presentazione (Step 1):
   * - Modello dell'atomo di Idrogeno (nucleo + orbita)
   * - Titolo HYDROGEN formato dagli atomi
   * - Asse del tempo in basso formato dagli atomi con i primi 2 nodi (Singolarità, Idrogeno)
   */
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

    // Geometria verticale armonica: Atomo -> HYDROGEN -> Asse del tempo
    const atomY = viewH * 0.25;
    const orbitRx = clamp(minDim * 0.145, 58, 128);
    const orbitRy = orbitRx * 0.52;
    const nucleusR = clamp(orbitRx * 0.18, 11, 21);

    const textY = viewH * 0.52;

    const tlY = viewH * 0.80;
    const tlW = clamp(viewW * 0.58, 240, 680);
    const tlLeft = cx - tlW * 0.5;
    const tlRight = cx + tlW * 0.5;
    const nodeR = clamp(minDim * 0.024, 14, 21);

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

    // Zone 1..8: ogni lettera di HYDROGEN con gradiente nebulosa (magenta -> viola -> turchese)
    const fontSize = clamp(viewW * 0.122, 42, 152);
    const letterSpacing = fontSize * 0.085;
    octx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif`;
    const chars = Array.from('HYDROGEN');
    const widths = chars.map((ch) => octx.measureText(ch).width);
    const totalWordWidth =
      widths.reduce((acc, w) => acc + w, 0) + letterSpacing * Math.max(0, chars.length - 1);

    const letterColors = [1, 1, 2, 2, 2, 3, 3, 3];
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

    // Zone 9: Nucleo dell'atomo di Idrogeno (1 protone: oro/magenta caldo)
    registerZone(9, 1, 0, (c) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(cx, atomY, nucleusR, 0, Math.PI * 2);
      c.fill();
    });

    // Zone 10: Anello orbitale ellittico inclinato (viola cosmico)
    registerZone(10, 1, 2, (c) => {
      c.strokeStyle = '#ffffff';
      c.lineWidth = clamp(orbitRx * 0.068, 4.5, 7);
      c.beginPath();
      c.ellipse(cx, atomY, orbitRx, orbitRy, -0.22, 0, Math.PI * 2);
      c.stroke();
    });

    // Zone 11: Barra dell'asse del tempo in basso (viola/indaco morbido)
    registerZone(11, 1, 2, (c) => {
      c.fillStyle = '#ffffff';
      const barH = 5.5;
      c.beginPath();
      c.roundRect(tlLeft, tlY - barH / 2, tlW, barH, barH / 2);
      c.fill();
    });

    // Zone 12+: Nodi dell'asse del tempo (Step 1: Singolarità e Idrogeno)
    eraNodes.forEach((node, idx) => {
      const zId = 12 + idx;
      registerZone(zId, node.groupId, node.colorIdx, (c) => {
        c.strokeStyle = '#ffffff';
        c.fillStyle = '#ffffff';
        c.lineWidth = clamp(node.r * 0.34, 5, 7);
        c.beginPath();
        c.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        c.stroke();

        // Nucleo centrale del nodo
        c.beginPath();
        c.arc(node.x, node.y, Math.max(5, node.r * 0.35), 0, Math.PI * 2);
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
      colorIdx: isElectron ? 3 : Math.floor(Math.random() * 4),
      sizeFactor: isElectron ? 0.85 + Math.random() * 0.45 : 0.72 + Math.random() * 0.58,
      alphaBase: isElectron ? 0.85 + Math.random() * 0.15 : 0.72 + Math.random() * 0.25,
      expelRank: Math.random(),
      mobility: 0.82 + Math.random() * 0.36,
      burstDrag: 0.945 + Math.random() * 0.025,
      returnDelay: 350 + Math.random() * 1950,
      returnDuration: 850 + Math.random() * 1350,
      magneticWake: 1,
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
        particles.push(p);
      }
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }

    shNext = new Int32Array(particles.length);
  }

  /**
   * Sincronizza le hit-area trasparenti con la singolarità centrale e i 2 nodi dell'asse.
   */
  function syncHitboxes() {
    const { cx, cy, seedIdleRadius, nodes } = layoutBounds;

    const seedHitR = Math.max(seedIdleRadius * 2.3, 36);
    btnSeed.style.left = `${cx - seedHitR}px`;
    btnSeed.style.top = `${cy - seedHitR}px`;
    btnSeed.style.width = `${seedHitR * 2}px`;
    btnSeed.style.height = `${seedHitR * 2}px`;

    const nodeSing = nodes[0];
    if (nodeSing) {
      const hitR = nodeSing.r + 14;
      btnNodeSingularity.style.left = `${nodeSing.x - hitR}px`;
      btnNodeSingularity.style.top = `${nodeSing.y - hitR}px`;
      btnNodeSingularity.style.width = `${hitR * 2}px`;
      btnNodeSingularity.style.height = `${hitR * 2}px`;
    }

    const nodeHydro = nodes[1];
    if (nodeHydro) {
      const hitR = nodeHydro.r + 14;
      btnNodeHydrogen.style.left = `${nodeHydro.x - hitR}px`;
      btnNodeHydrogen.style.top = `${nodeHydro.y - hitR}px`;
      btnNodeHydrogen.style.width = `${hitR * 2}px`;
      btnNodeHydrogen.style.height = `${hitR * 2}px`;
    }

    const showSeed = simState === STATE.IDLE_SEED;
    const showNodes = simState === STATE.SETTLED || simState === STATE.EXPLODING;
    btnSeed.hidden = !showSeed;
    btnNodeSingularity.hidden = !showNodes;
    btnNodeHydrogen.hidden = !showNodes;
  }

  function startBigBangSequence() {
    if (simState !== STATE.IDLE_SEED && simState !== STATE.IMPLODING) return;
    simState = STATE.GROWING;
    stateTime = 0;
    seedStartRadius = seedCurrentRadius;
    syncHitboxes();
  }

  /**
   * Big Bang: scaraventa tutte le particelle di plasma caldo oltre i bordi dello schermo;
   * ciascuna rientra con il proprio tempo formando la scena dell'Idrogeno e l'asse temporale.
   */
  function triggerExplosionFromSphere() {
    simState = STATE.EXPLODING;
    stateTime = 0;
    explosionElapsed = 0;

    const { cx, cy } = layoutBounds;
    const sphereR = seedCurrentRadius;
    const diag = Math.hypot(viewW, viewH);
    const speedScale = prefersReducedMotion ? 0.28 : 1;

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
        (0.28 + radialNorm * 0.72 + Math.random() * 0.95) * (diag * 0.044) * speedScale;
      const swirl = (Math.random() - 0.5) * 0.34;
      p.vx = Math.cos(angle + swirl) * burstSpeed;
      p.vy = Math.sin(angle + swirl) * burstSpeed;

      // Colori caldi di plasma primordiale al momento dell'esplosione
      p.colorIdx = Math.random() < 0.22 ? 4 : Math.floor(Math.random() * 4);
      p.burstDrag = 0.942 + Math.random() * 0.026;
      p.returnDelay = prefersReducedMotion
        ? 160 + Math.random() * 420
        : p.isElectron
          ? 650 + Math.random() * 1100
          : 320 + Math.random() * 2000;
      p.returnDuration = prefersReducedMotion ? 500 + Math.random() * 500 : 850 + Math.random() * 1450;
      p.magneticWake = 0;
      p.currentZone = 0;
    }

    syncHitboxes();
  }

  /**
   * Riavvolge tutte le particelle al centro, le raggruppa e le fonde nella singolarità unica.
   */
  function implodeToSeed() {
    if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
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

  /**
   * Impulso energetico dal nucleo di Idrogeno (cliccando il nodo Idrogeno sull'asse).
   */
  function triggerHydrogenPulse() {
    if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
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
      pointer.hoverGroup = distSeed <= Math.max(seedIdleRadius * 2.3, 36) ? 99 : 0;
      canvas.style.cursor = pointer.hoverGroup === 99 ? 'pointer' : 'default';
      return;
    }

    if (simState === STATE.SETTLED || simState === STATE.EXPLODING) {
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

  function updateSimulation(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    stateTime += dtMs;

    const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

    // Avanza l'orbita dell'elettrone dell'Idrogeno
    const orbitSpeed = prefersReducedMotion ? 0.00035 : 0.00165;
    orbitAngle = (orbitAngle + dtMs * orbitSpeed) % (Math.PI * 2);

    if (simState === STATE.IDLE_SEED) {
      const targetHover = pointer.hoverGroup === 99 ? 1 : 0;
      seedHoverCharge += (targetHover - seedHoverCharge) * 0.12 * dt;

      const breathAmp = prefersReducedMotion ? 0.5 : 1.9;
      const breath = Math.sin(stateTime * 0.003) * breathAmp;
      seedCurrentRadius = seedIdleRadius + breath + seedHoverCharge * 6;
      return;
    }

    if (simState === STATE.GROWING) {
      const duration = prefersReducedMotion ? CONFIG.growDurationMs * 0.65 : CONFIG.growDurationMs;
      const progress = clamp(stateTime / duration, 0, 1);
      const eased = easeInOutQuad(progress) * 0.55 + easeInCubic(progress) * 0.45;
      const subtleTremor =
        prefersReducedMotion ? 0 : Math.sin(stateTime * 0.038) * (progress * 1.5);

      seedCurrentRadius =
        seedStartRadius + (seedMaxRadius - seedStartRadius) * eased + subtleTremor;

      if (progress >= 1) {
        triggerExplosionFromSphere();
      }
      return;
    }

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

    explosionElapsed += dtMs;
    if (simState === STATE.EXPLODING && stateTime > 1250) {
      simState = STATE.SETTLED;
    }

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

    // 1. Spatial Hash + conteggi densità per le zone strutturali
    for (let z = 1; z < zoneCount; z++) {
      zones[z].currentCount = 0;
    }
    if (shNext.length !== total) {
      shNext = new Int32Array(total);
    }
    shHead.fill(-1);

    for (let i = 0; i < total; i++) {
      const p = particles[i];

      if (p.magneticWake < 1) {
        const wakeRaw = clamp((explosionElapsed - p.returnDelay) / p.returnDuration, 0, 1);
        p.magneticWake = easeInOutQuad(wakeRaw);
      }

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

    // 2. Carica atomica positiva/negativa per ogni zona strutturale
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
    const pointerActive = pointer.active;
    const isAttracting = pointer.down;
    const magnetForce = CONFIG.magnetForce * (isAttracting ? 1.45 : 1.0);
    const repelDist = idealSpacing;
    const repelDistSq = repelDist * repelDist;
    const repelStrength = 0.26;

    // 3. Integrazione forze
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

      // Repulsione locale isotropa tra particelle strutturali
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
          // Elettrone orbitante: le sue particelle inseguono il pacchetto orbitale lungo l'orbita
          const ex = electronPos.x + p.electronOx - p.x;
          const ey = electronPos.y + p.electronOy - p.y;
          const pull = 0.22 * wake * dt;
          p.vx += ex * pull;
          p.vy += ey * pull;
          if (wake > 0.45 && Math.random() < 0.14) {
            p.colorIdx = Math.random() < 0.35 ? 4 : 3; // turchese brillante / bianco stella
          }
        } else {
          const zId = p.currentZone;

          if (zId > 0) {
            const zone = zones[zId];

            // Transizione fluida verso il colore educativo della zona
            if (wake > 0.4 && p.colorIdx !== zone.colorIdx && Math.random() < 0.1) {
              // Accenti occasionali caldi nel nucleo (oro/magenta) o nel nodo Idrogeno (turchese/magenta)
              if (zId === 9 && Math.random() < 0.32) {
                p.colorIdx = 1;
              } else if (zId === 13 && Math.random() < 0.25) {
                p.colorIdx = 1;
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

      // Calamita del mouse
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
   * Disegna la singolarità primordiale luminosa sul nero assoluto.
   */
  function drawSeedSphere(cx, cy, r, alphaScale, growthNorm) {
    const haloSpread = r * (2.6 + seedHoverCharge * 0.45 + growthNorm * 0.75);
    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, haloSpread);
    grad.addColorStop(0.0, 'rgba(255, 252, 245, 1)');
    grad.addColorStop(0.32, 'rgba(255, 210, 128, 0.96)');
    grad.addColorStop(0.52, 'rgba(236, 78, 175, 0.42)');
    grad.addColorStop(0.75, 'rgba(130, 82, 245, 0.14)');
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
   * Disegna su sfondo cosmico nero (#000000) con sprite nebulosa a blending additivo.
   */
  function renderFrame() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewW, viewH);

    const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

    if (simState === STATE.IDLE_SEED || simState === STATE.GROWING) {
      const r = Math.max(1, seedCurrentRadius);
      const growthNorm = clamp((r - seedIdleRadius) / Math.max(1, seedMaxRadius - seedIdleRadius), 0, 1);
      drawSeedSphere(cx, cy, r, 1, growthNorm);
      return;
    }

    ctx.globalCompositeOperation = 'lighter';

    const dotBase = CONFIG.dotSize;
    const cullPad = dotBase * 5;
    const total = particles.length;
    const hoverGroup = pointer.hoverGroup;
    const particleMergeFade =
      simState === STATE.IMPLODING && implodeMerging ? Math.max(0, 1 - implodeMergeAlpha * 0.9) : 1;

    for (let i = 0; i < total; i++) {
      const p = particles[i];
      if (p.x < -cullPad || p.x > viewW + cullPad || p.y < -cullPad || p.y > viewH + cullPad) {
        continue;
      }

      const zId = p.currentZone;
      const isHoveredNode =
        hoverGroup !== 0 && zId > 0 && zones[zId] && zones[zId].groupId === hoverGroup;

      let alpha = p.alphaBase * particleMergeFade;
      if (zId === 0 && !p.isElectron && simState !== STATE.IMPLODING) {
        alpha *= 0.72;
      }
      if (isHoveredNode) {
        alpha = Math.min(1, alpha + 0.22);
      }

      // Scala sprite affinché il nucleo corrisponda a dotSize e l'alone formi il glow della nebulosa
      const radius = dotBase * p.sizeFactor * (p.isElectron ? 1.25 : isHoveredNode ? 1.18 : 1.0);
      const spriteRadius = radius * 3.4;

      ctx.globalAlpha = alpha;
      ctx.drawImage(
        glowSprites[p.colorIdx],
        p.x - spriteRadius,
        p.y - spriteRadius,
        spriteRadius * 2,
        spriteRadius * 2
      );
    }

    if (simState === STATE.IMPLODING && implodeMerging && implodeMergeAlpha > 0) {
      drawSeedSphere(cx, cy, seedIdleRadius, implodeMergeAlpha, 0);
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

  // Eventi puntatore sulla scena
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
      } else if (pointer.hoverGroup === 2) {
        implodeToSeed();
      } else if (pointer.hoverGroup === 3) {
        triggerHydrogenPulse();
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
    if (simState === STATE.IDLE_SEED) {
      startBigBangSequence();
    } else {
      simState = STATE.IDLE_SEED;
      stateTime = 0;
      seedCurrentRadius = layoutBounds.seedIdleRadius;
      seedHoverCharge = 0;
      syncHitboxes();
      startBigBangSequence();
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
  startLoop();
})();

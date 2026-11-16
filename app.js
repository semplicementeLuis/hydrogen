(() => {
  'use strict';

  /**
   * Configurazione centralizzata (premi D per tarare in tempo reale).
   */
  const DEFAULT_CONFIG = {
    particleCount: 3600,
    dotSize: 1.8,
    growDurationMs: 1400,
  };

  const CONFIG = { ...DEFAULT_CONFIG };

  // Scale di zoom fisse della telecamera continua (tutto nello stesso spazio mondo centrato in 0,0)
  const MICRO_ZOOM = 24.0;
  const COSMIC_ZOOM = 0.50;
  const STAR_ZOOM = 2.2;

  // Palette luminosa: bianchi Big Bang + colori QCD (R,G,B) + atomi cosmici + strati nucleosintesi stellare
  const PALETTE = [
    [255, 255, 255],  // 0: Bianco puro (Singolarità, Big Bang, Gluoni)
    [208, 218, 236],  // 1: Bianco-argento sfumato (Big Bang / Plasma primordiale)
    [255, 78, 108],   // 2: Quark Rosso (QCD)
    [56, 238, 156],   // 3: Quark Verde (QCD)
    [76, 166, 255],   // 4: Quark Blu (QCD) / Idrogeno (H)
    [68, 232, 246],   // 5: Elettrone / Idrogeno ionizzato ciano
    [148, 96, 255],   // 6: Viola cosmico (filamenti rete cosmica)
    [255, 196, 98],   // 7: Elio-4 (He) oro caldo
    [238, 86, 178],   // 8: Idrogeno-alfa nei nodi caldi
    [255, 124, 54],   // 9: Ossigeno (O)
    [194, 204, 224],  // 10: Ferro (Fe)
  ];

  // Riferimenti DOM
  const stageWrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const btnSeed = document.getElementById('btn-seed');
  const btnMicroContinue = document.getElementById('btn-micro-continue');
  const btnCosmicNext = document.getElementById('btn-cosmic-next');
  const btnStarNext = document.getElementById('btn-star-next');

  const tuningPanel = document.getElementById('tuning-panel');
  const tuningClose = document.getElementById('tuning-close');
  const ctrlCount = document.getElementById('ctrl-count');
  const ctrlSize = document.getElementById('ctrl-size');
  const ctrlReplay = document.getElementById('ctrl-replay');
  const ctrlReset = document.getElementById('ctrl-reset');

  const outCount = document.getElementById('out-count');
  const outSize = document.getElementById('out-size');

  // Preferenza ridotta per il movimento
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
  });

  // Macchina a stati cronologica in piano sequenza continuo (Capitoli 0-1 -> 2 -> 3)
  const STATE = {
    IDLE_SEED: 'IDLE_SEED',
    GROWING: 'GROWING',
    BIG_BANG: 'BIG_BANG',
    SLOW_MO_RETICLE: 'SLOW_MO_RETICLE',
    CAMERA_ZOOM_IN: 'CAMERA_ZOOM_IN',
    MICRO_QUARKS: 'MICRO_QUARKS',
    CAMERA_ZOOM_OUT: 'CAMERA_ZOOM_OUT',
    COSMIC_WEB: 'COSMIC_WEB',
    STAR_RETICLE: 'STAR_RETICLE',
    STAR_ZOOM_IN: 'STAR_ZOOM_IN',
    STELLAR_FUSION: 'STELLAR_FUSION',
    IMPLODING: 'IMPLODING',
  };

  let simState = STATE.IDLE_SEED;
  let stateTime = 0;
  let lastTimestamp = 0;
  let rafId = null;
  let isPaused = false;

  // Dimensioni logiche viewport
  let viewW = Math.floor(window.innerWidth);
  let viewH = Math.floor(window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  let layoutBounds = {
    cx: 0,
    cy: 0,
    seedIdleRadius: 15,
    seedMaxRadius: 115,
  };

  // Pool unico di particelle per tutta la simulazione (coordinate mondo centrate in 0,0)
  let particles = [];

  // Camera continua unica
  let camX = 0;
  let camY = 0;
  let camZoom = 1;
  let camStartX = 0;
  let camStartY = 0;
  let camStartZoom = 1;
  let heroIdx = 0;
  let targetClusterNodeIdx = 5;
  let reticleSize = 116;
  let reticleAlpha = 0;

  // Capitolo 1: Micro-scena ancorata in coordinate mondo su particles[heroIdx]
  const micro = {
    time: 0,
    quarks: [],
    gluons: [],
    gluonTimer: 0,
    orbitKickApplied: false,
    electron: { active: false, ox: 0, oy: 0, angle: 0, radius: 0, targetRadius: 0, trail: [] },
  };

  // Capitolo 2: Spatial Hash in coordinate mondo per la rete cosmica estesa oltre i bordi
  const SH_CELL = 12;
  let shSpanW = 1200;
  let shSpanH = 800;
  let shCols = 0;
  let shRows = 0;
  let shHead = new Int32Array(0);
  let shNext = new Int32Array(0);

  const cosmic = {
    active: false,
    elapsed: 0,
    nodes: [],
    filaments: [],
  };

  // Capitolo 3: Stella nella stessa scena (gradiente continuo H -> He -> C -> O -> Si -> Fe)
  const STELLAR_STOPS = [
    { t: 0.00, rgb: [76, 166, 255] },   // Idrogeno (esterno)
    { t: 0.22, rgb: [255, 200, 96] },   // Elio
    { t: 0.42, rgb: [56, 238, 164] },   // Carbonio
    { t: 0.62, rgb: [255, 130, 56] },   // Ossigeno
    { t: 0.80, rgb: [96, 232, 255] },   // Silicio
    { t: 1.00, rgb: [248, 72, 106] },   // Ferro (nucleo denso e calmo)
  ];

  function sampleStellarRGB(t) {
    const u = clamp(t, 0, 1);
    for (let i = 0; i < STELLAR_STOPS.length - 1; i++) {
      const a = STELLAR_STOPS[i];
      const b = STELLAR_STOPS[i + 1];
      if (u <= b.t) {
        const localT = (u - a.t) / Math.max(0.0001, b.t - a.t);
        return [
          Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * localT),
          Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * localT),
          Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * localT),
        ];
      }
    }
    return STELLAR_STOPS[STELLAR_STOPS.length - 1].rgb;
  }

  const SPRITE_SIZE = 64;

  function makeGlowSprite(r, g, b, coreWhiteMix = 0.85) {
    const sc = document.createElement('canvas');
    sc.width = SPRITE_SIZE;
    sc.height = SPRITE_SIZE;
    const sctx = sc.getContext('2d');
    const half = SPRITE_SIZE / 2;

    const cr = Math.round(r + (255 - r) * coreWhiteMix);
    const cg = Math.round(g + (255 - g) * coreWhiteMix);
    const cb = Math.round(b + (255 - b) * coreWhiteMix);

    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, `rgba(${cr}, ${cg}, ${cb}, 0.94)`);
    grad.addColorStop(0.22, `rgba(${r}, ${g}, ${b}, 0.86)`);
    grad.addColorStop(0.46, `rgba(${r}, ${g}, ${b}, 0.26)`);
    grad.addColorStop(0.76, `rgba(${r}, ${g}, ${b}, 0.06)`);
    grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);

    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return sc;
  }

  const glowSprites = PALETTE.map(([r, g, b]) => makeGlowSprite(r, g, b, 0.88));
  const STELLAR_GRADIENT_COUNT = 64;
  const stellarSprites = Array.from({ length: STELLAR_GRADIENT_COUNT }, (_, i) => {
    const [r, g, b] = sampleStellarRGB(i / (STELLAR_GRADIENT_COUNT - 1));
    return makeGlowSprite(r, g, b, 0.22);
  });

  const star = {
    active: false,
    elapsed: 0,
    blend: 0,
    fusionDepth: 0,
    worldRadius: 96,
    coreCount: 0,
    connectedFilaments: [],
  };

  // Stato puntatore SOLO per riconoscere click/tap e hover sui pulsanti invisibili (zero forze su particelle)
  const pointer = {
    down: false,
    downTime: 0,
    downX: 0,
    downY: 0,
    hoverSeed: false,
  };

  // Stato singolarità centrale
  let seedHoverCharge = 0;
  let seedCurrentRadius = 15;
  let seedStartRadius = 15;
  let implodeMerging = false;
  let implodeMergeTime = 0;
  let implodeMergeAlpha = 0;

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

  /**
   * Scala ottica continua basata esclusivamente su camZoom: nessuno scatto di dimensione al cambio stato.
   */
  function opticalRadiusScale(zoom) {
    if (zoom <= 0.5) {
      return Math.max(0.24, 0.42 * (zoom / 0.5));
    }
    if (zoom <= 1.0) {
      return 0.42 + 0.58 * easeInOutQuad((zoom - 0.5) / 0.5);
    }
    return 1.0 + 0.16 * Math.log1p(zoom - 1.0);
  }

  function updateViewportSize() {
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

    layoutBounds = {
      cx,
      cy,
      seedIdleRadius: clamp(minDim * 0.021, 11, 19),
      seedMaxRadius: clamp(minDim * 0.16, 86, 155),
    };

    shSpanW = viewW * 1.3;
    shSpanH = viewH * 1.3;
    shCols = Math.ceil((shSpanW * 2) / SH_CELL) + 2;
    shRows = Math.ceil((shSpanH * 2) / SH_CELL) + 2;
    shHead = new Int32Array(shCols * shRows);

    if (simState === STATE.IDLE_SEED) {
      seedCurrentRadius = layoutBounds.seedIdleRadius;
      camX = 0;
      camY = 0;
      camZoom = 1;
    }

    syncHitboxes();
  }

  function createParticle(startX, startY) {
    const isHelium = Math.random() < 0.25;
    const baseColorIdx = isHelium ? 7 : Math.random() < 0.45 ? 4 : Math.random() < 0.65 ? 5 : 6;
    return {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      species: isHelium ? 'He' : 'H',
      mass: isHelium ? 1.38 : 1.0,
      baseColorIdx,
      coolColorIdx: baseColorIdx,
      colorIdx: Math.random() < 0.68 ? 0 : 1,
      recombMix: 0,
      sizeFactor: isHelium ? 0.85 + Math.random() * 0.55 : 0.65 + Math.random() * 0.52,
      alphaBase: 0.45 + Math.random() * 0.52,
      burstDrag: 0.946 + Math.random() * 0.022,
      coreOx: 0,
      coreOy: 0,
      gatherPull: 0.08,
      cosmicRole: Math.random(),
      filSpread: (Math.random() - 0.5) * 14,
      starRole: 'cosmic',
      starRPref: 40,
      starPhase: Math.random() * Math.PI * 2,
      starNoise: (Math.random() - 0.5) * 0.05,
      starHeat: 0,
      heatMix: 0,
      canRecruitFeeder: false,
      feederDelay: 0,
      isFilamentFeeder: false,
      feederFilIdx: 0,
      feederT: 0.8,
      feederFade: 1,
    };
  }

  function syncParticleCount(recreateAll) {
    const targetCount = CONFIG.particleCount;

    if (recreateAll || particles.length === 0) {
      particles = [];
      for (let i = 0; i < targetCount; i++) {
        particles.push(createParticle(0, 0));
      }
      shNext = new Int32Array(particles.length);
      return;
    }

    if (particles.length < targetCount) {
      while (particles.length < targetCount) {
        const isCosmic =
          simState === STATE.COSMIC_WEB ||
          simState === STATE.CAMERA_ZOOM_OUT ||
          simState === STATE.STAR_RETICLE;
        const p = createParticle(
          isCosmic ? (Math.random() - 0.5) * (viewW / COSMIC_ZOOM) * 1.15 : 0,
          isCosmic ? (Math.random() - 0.5) * (viewH / COSMIC_ZOOM) * 1.15 : 0
        );
        if (isCosmic) {
          p.recombMix = 1;
        }
        particles.push(p);
      }
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
    shNext = new Int32Array(particles.length);
  }

  function syncHitboxes() {
    const { cx, cy, seedIdleRadius } = layoutBounds;

    const seedHitR = Math.max(seedIdleRadius * 2.4, 38);
    btnSeed.style.left = `${cx - seedHitR}px`;
    btnSeed.style.top = `${cy - seedHitR}px`;
    btnSeed.style.width = `${seedHitR * 2}px`;
    btnSeed.style.height = `${seedHitR * 2}px`;

    const fullScreenHitboxes = [btnMicroContinue, btnCosmicNext, btnStarNext];
    for (const btn of fullScreenHitboxes) {
      btn.style.left = '0px';
      btn.style.top = '0px';
      btn.style.width = `${viewW}px`;
      btn.style.height = `${viewH}px`;
    }

    btnSeed.hidden = simState !== STATE.IDLE_SEED;
    btnMicroContinue.hidden = simState !== STATE.MICRO_QUARKS;
    btnCosmicNext.hidden = simState !== STATE.COSMIC_WEB;
    btnStarNext.hidden = simState !== STATE.STELLAR_FUSION;
  }

  function startBigBangSequence() {
    if (simState !== STATE.IDLE_SEED && simState !== STATE.IMPLODING) return;
    simState = STATE.GROWING;
    stateTime = 0;
    cosmic.active = false;
    star.active = false;
    star.blend = 0;
    seedStartRadius = seedCurrentRadius;
    camX = 0;
    camY = 0;
    camZoom = 1;
    syncHitboxes();
  }

  /**
   * Big Bang nello spazio mondo (0,0): espande le stesse particelle fino a coprire
   * anche l'orizzonte cosmico esteso che apparirà durante lo zoom out a 0.50x.
   */
  function triggerWhiteBigBang() {
    simState = STATE.BIG_BANG;
    stateTime = 0;

    const sphereR = seedCurrentRadius;
    const horizonR = Math.hypot(viewW * 1.18, viewH * 1.18);
    const total = CONFIG.particleCount;
    syncParticleCount(true);

    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const radialNorm = Math.pow(Math.random(), 0.72);
      const startR = Math.sqrt(Math.random()) * sphereR;
      const angle = Math.random() * Math.PI * 2;

      p.x = Math.cos(angle) * startR;
      p.y = Math.sin(angle) * startR;

      const drag = prefersReducedMotion
        ? 0.964 + Math.random() * 0.014
        : 0.946 + Math.random() * 0.022;
      p.burstDrag = drag;

      // Velocità iniziale calibrata perché la stessa onda riempia sia lo schermo 1x sia lo zoom-out cosmico 0.50x
      const effectiveSum = prefersReducedMotion ? 26.5 : 21.5;
      const targetTravel = radialNorm * horizonR;
      const burstSpeed = targetTravel / effectiveSum;
      const swirl = (Math.random() - 0.5) * 0.24;

      p.vx = Math.cos(angle + swirl) * burstSpeed;
      p.vy = Math.sin(angle + swirl) * burstSpeed;

      p.colorIdx = Math.random() < 0.65 ? 0 : 1;
      p.coolColorIdx = p.baseColorIdx;
      p.recombMix = 0;
      p.alphaBase = 0.45 + Math.random() * 0.52;
    }

    syncHitboxes();
  }

  function pickCenterIsolatedParticle() {
    const maxCenterR = Math.min(viewW, viewH) * 0.2;

    let bestIdx = 0;
    let bestScore = -Infinity;
    const step = Math.max(1, Math.floor(particles.length / 240));

    for (let i = 0; i < particles.length; i += step) {
      const p = particles[i];
      const distCenter = Math.hypot(p.x, p.y);
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
    hero.species = 'H';
    hero.mass = 1.0;
    hero.baseColorIdx = 4;
    hero.coolColorIdx = 4;
    hero.colorIdx = 0;
    hero.alphaBase = 1;
    hero.cosmicRole = 0.35;
    return hero;
  }

  /**
   * Inizializza la micro-struttura in offset mondo attorno a particles[heroIdx]
   * così lo zoom in e lo zoom out mantengono esattamente la stessa geometria nello spazio mondo.
   */
  function initMicroScene() {
    const minDim = Math.min(viewW, viewH);
    const startR = clamp(minDim * 0.22, 95, 180) / MICRO_ZOOM;
    const subDotR = clamp(minDim * 0.025, 11, 19) / MICRO_ZOOM;

    micro.time = 0;
    micro.gluons = [];
    micro.gluonTimer = 0;
    micro.orbitKickApplied = false;

    const quarkColors = [2, 3, 4];
    const baseAngles = [-Math.PI / 2, Math.PI / 6 + 0.15, (5 * Math.PI) / 6 - 0.15];

    micro.quarks = quarkColors.map((colorIdx, idx) => {
      const a = baseAngles[idx];
      const ox = Math.cos(a) * startR;
      const oy = Math.sin(a) * startR;

      const subDots = Array.from({ length: 24 }, () => {
        const sa = Math.random() * Math.PI * 2;
        const sr = Math.sqrt(Math.random()) * subDotR;
        const dotOx = Math.cos(sa) * sr;
        const dotOy = Math.sin(sa) * sr;
        const scatterAngle = sa + (Math.random() - 0.5) * 1.1;
        const scatterMult = 2.6 + Math.random() * 1.7;
        return {
          ox: dotOx,
          oy: dotOy,
          spawnOx: Math.cos(scatterAngle) * sr * scatterMult,
          spawnOy: Math.sin(scatterAngle) * sr * scatterMult,
          phase: Math.random() * Math.PI * 2,
          size: 0.7 + Math.random() * 0.75,
        };
      });

      return {
        ox,
        oy,
        homeOx: ox,
        homeOy: oy,
        vx: 0,
        vy: 0,
        baseAngle: a,
        colorIdx,
        subDots,
      };
    });

    micro.electron = {
      active: false,
      ox: (minDim * 0.56) / MICRO_ZOOM,
      oy: (-minDim * 0.28) / MICRO_ZOOM,
      angle: -0.45,
      radius: (minDim * 0.62) / MICRO_ZOOM,
      targetRadius: clamp(minDim * 0.25, 105, 195) / MICRO_ZOOM,
      trail: [],
    };
  }

  /**
   * Genera SOLO i nodi gravitazionali e i filamenti della Rete Cosmica nel mondo esistente (0,0),
   * SENZA spostare o teletrasportare alcuna particella del Big Bang.
   */
  function initCosmicFieldOnly() {
    cosmic.active = true;
    cosmic.elapsed = 0;

    const spanW = viewW / COSMIC_ZOOM;
    const spanH = viewH / COSMIC_ZOOM;

    const anchors = [
      // 14 nodi visibili nel campo a 0.50x
      { rx: 0.10, ry: 0.17, mass: 0.9 },
      { rx: 0.33, ry: 0.15, mass: 1.05 },
      { rx: 0.58, ry: 0.18, mass: 0.95 },
      { rx: 0.85, ry: 0.16, mass: 1.0 },
      { rx: 0.17, ry: 0.45, mass: 1.1 },
      { rx: 0.44, ry: 0.44, mass: 1.35 },
      { rx: 0.69, ry: 0.46, mass: 1.2 },
      { rx: 0.90, ry: 0.47, mass: 0.95 },
      { rx: 0.12, ry: 0.74, mass: 0.95 },
      { rx: 0.36, ry: 0.72, mass: 1.15 },
      { rx: 0.59, ry: 0.70, mass: 1.05 },
      { rx: 0.84, ry: 0.75, mass: 1.15 },
      { rx: 0.25, ry: 0.90, mass: 0.85 },
      { rx: 0.70, ry: 0.89, mass: 0.9 },
      // 10 nodi di ancoraggio fuori schermo (-0.16..1.16)
      { rx: -0.14, ry: 0.12, mass: 0.8, offscreen: true },
      { rx: 0.28, ry: -0.16, mass: 0.8, offscreen: true },
      { rx: 0.72, ry: -0.15, mass: 0.8, offscreen: true },
      { rx: 1.15, ry: 0.14, mass: 0.8, offscreen: true },
      { rx: -0.16, ry: 0.52, mass: 0.8, offscreen: true },
      { rx: 1.16, ry: 0.50, mass: 0.8, offscreen: true },
      { rx: -0.14, ry: 0.88, mass: 0.8, offscreen: true },
      { rx: 1.15, ry: 0.86, mass: 0.8, offscreen: true },
      { rx: 0.22, ry: 1.16, mass: 0.8, offscreen: true },
      { rx: 0.74, ry: 1.16, mass: 0.8, offscreen: true },
    ];

    cosmic.nodes = anchors.map((a, idx) => ({
      id: idx,
      x: (a.rx - 0.5 + (Math.random() - 0.5) * 0.04) * spanW,
      y: (a.ry - 0.5 + (Math.random() - 0.5) * 0.04) * spanH,
      mass: a.mass,
      offscreen: !!a.offscreen,
      spin: idx % 2 === 0 ? 1 : -1,
    }));

    const pairs = [
      [0, 1], [1, 2], [2, 3],
      [0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7],
      [4, 5], [5, 6], [6, 7],
      [4, 8], [4, 9], [5, 9], [5, 10], [6, 10], [6, 11], [7, 11],
      [8, 9], [9, 10], [10, 11],
      [8, 12], [9, 12], [12, 13], [10, 13], [11, 13],
      [0, 14], [0, 15], [1, 15], [2, 16], [3, 16], [3, 17],
      [4, 18], [8, 18], [7, 19], [11, 19],
      [8, 20], [12, 20], [11, 21], [13, 21],
      [12, 22], [13, 23],
    ];

    cosmic.filaments = pairs.map(([aIdx, bIdx], idx) => {
      const a = cosmic.nodes[aIdx];
      const b = cosmic.nodes[bIdx];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        nx: -dy / len,
        ny: dx / len,
        bend: (idx % 2 === 0 ? 1 : -1) * clamp(len * 0.085, 20, 52),
        lenSq: Math.max(1, dx * dx + dy * dy),
      };
    });

    shNext = new Int32Array(particles.length);
  }

  /**
   * Classifica le particelle secondo la loro posizione REALE nella Rete Cosmica senza spostarne nemmeno una:
   * - 'core': già dentro l'ammasso bersaglio (mantiene l'ordine radiale iniziale)
   * - 'feeder': già lungo uno dei filamenti connessi all'ammasso (scorre dentro la stella)
   * - 'cosmic': tutto il resto dell'universo (resta intatto nella propria distribuzione cosmica)
   */
  function initStarMetadataOnly() {
    const node = cosmic.nodes[targetClusterNodeIdx];
    const minDim = Math.min(viewW, viewH);
    star.active = false;
    star.elapsed = 0;
    star.blend = 0;
    star.fusionDepth = 0;
    star.worldRadius = clamp((minDim * 0.30) / STAR_ZOOM, 75, 118);
    star.coreCount = 0;

    const connected = [];
    for (let i = 0; i < cosmic.filaments.length; i++) {
      const f = cosmic.filaments[i];
      const dA = Math.hypot(f.ax - node.x, f.ay - node.y);
      const dB = Math.hypot(f.bx - node.x, f.by - node.y);
      if (dA < 2 || dB < 2) {
        const fromNodeIsA = dA < dB;
        connected.push({
          ax: fromNodeIsA ? f.ax : f.bx,
          ay: fromNodeIsA ? f.ay : f.by,
          bx: fromNodeIsA ? f.bx : f.ax,
          by: fromNodeIsA ? f.by : f.ay,
          nx: f.nx,
          ny: f.ny,
          bend: fromNodeIsA ? f.bend : -f.bend,
          lenSq: f.lenSq,
        });
      }
    }
    if (connected.length === 0 && cosmic.filaments.length > 0) {
      connected.push(cosmic.filaments[0]);
    }
    star.connectedFilaments = connected;

    const farCutoff = Math.hypot(viewW, viewH) * 0.85;
    let recruitSlot = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dNode = Math.hypot(p.x - node.x, p.y - node.y);
      p.starPhase = Math.random() * Math.PI * 2;
      p.starHeat = 0;
      p.heatMix = 0;
      p.feederFade = 1;
      p.isFilamentFeeder = false;
      p.canRecruitFeeder = false;

      if (dNode < star.worldRadius * 1.45) {
        p.starRole = 'core';
        // Mantiene l'ordine radiale iniziale dell'ammasso evitando rimescolamenti caotici
        p.starRPref = clamp(dNode * 0.72, 3, star.worldRadius * 0.96);
        star.coreCount++;
        continue;
      }

      // Verifica se la particella si trova già su uno dei filamenti connessi a node
      let bestFilIdx = -1;
      let bestFilDistSq = 55 * 55;
      let bestT = 0.5;
      for (let f = 0; f < connected.length; f++) {
        const fil = connected[f];
        const abx = fil.bx - fil.ax;
        const aby = fil.by - fil.ay;
        const t = clamp(((p.x - fil.ax) * abx + (p.y - fil.ay) * aby) / fil.lenSq, 0, 1);
        const curve = Math.sin(t * Math.PI) * fil.bend;
        const fx = fil.ax + abx * t + fil.nx * curve;
        const fy = fil.ay + aby * t + fil.ny * curve;
        const dSq = (p.x - fx) * (p.x - fx) + (p.y - fy) * (p.y - fy);
        if (dSq < bestFilDistSq) {
          bestFilDistSq = dSq;
          bestFilIdx = f;
          bestT = t;
        }
      }

      if ((p.cosmicRole || 0.5) < 0.52 && bestFilIdx !== -1 && bestT > 0.08) {
        p.starRole = 'feeder';
        p.isFilamentFeeder = true;
        p.feederFilIdx = bestFilIdx;
        p.feederT = bestT;
        p.starRPref = clamp(star.worldRadius * (0.28 + 0.68 * Math.pow(Math.random(), 0.9)), 12, star.worldRadius * 0.96);
      } else {
        p.starRole = 'cosmic';
        p.starRPref = clamp(star.worldRadius * (0.35 + 0.62 * Math.pow(Math.random(), 0.9)), 14, star.worldRadius * 0.96);
        // Solo particelle molto lontane e fuori dallo schermo zoomato possono entrare in fila lungo i filamenti
        if (dNode > farCutoff && i % 6 === 0) {
          p.canRecruitFeeder = true;
          p.feederDelay = (recruitSlot++ % 180) * 55;
        }
      }
    }
  }

  function enterSlowMoReticle() {
    pickCenterIsolatedParticle();
    simState = STATE.SLOW_MO_RETICLE;
    stateTime = 0;
    reticleSize = 116;
    reticleAlpha = 0;
    camX = 0;
    camY = 0;
    camZoom = 1;
    initMicroScene();
    syncHitboxes();
  }

  function transitionToCosmicWeb() {
    if (simState !== STATE.MICRO_QUARKS) return;
    simState = STATE.CAMERA_ZOOM_OUT;
    stateTime = 0;
    const hero = particles[heroIdx];
    camStartX = hero.x;
    camStartY = hero.y;
    camStartZoom = MICRO_ZOOM;
    initCosmicFieldOnly();
    syncHitboxes();
  }

  function enterStarBirthSequence(clickX, clickY) {
    if (simState !== STATE.COSMIC_WEB) return;

    const refWX = clickX !== undefined ? camX + (clickX - layoutBounds.cx) / camZoom : camX;
    const refWY = clickY !== undefined ? camY + (clickY - layoutBounds.cy) / camZoom : camY;

    let bestNode = 5;
    let bestDist = Infinity;
    for (let i = 0; i < cosmic.nodes.length; i++) {
      const node = cosmic.nodes[i];
      if (node.offscreen) continue;
      const d = Math.hypot(node.x - refWX, node.y - refWY);
      if (d < bestDist) {
        bestDist = d;
        bestNode = i;
      }
    }
    targetClusterNodeIdx = bestNode;

    simState = STATE.STAR_RETICLE;
    stateTime = 0;
    reticleSize = 128;
    reticleAlpha = 0;
    camStartX = camX;
    camStartY = camY;
    camStartZoom = camZoom;
    initStarMetadataOnly();
    syncHitboxes();
  }

  function beginImplosionToSeed() {
    simState = STATE.IMPLODING;
    stateTime = 0;
    camStartX = camX;
    camStartY = camY;
    camStartZoom = camZoom;
    star.active = false;
    cosmic.active = false;
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
      p.starRole = 'cosmic';
      p.canRecruitFeeder = false;
      p.isFilamentFeeder = false;
      p.feederFade = 1;
    }

    syncHitboxes();
  }

  function updatePointerHover(clientX, clientY) {
    const { cx, cy, seedIdleRadius } = layoutBounds;

    if (simState === STATE.IDLE_SEED) {
      const distSeed = Math.hypot(clientX - cx, clientY - cy);
      pointer.hoverSeed = distSeed <= Math.max(seedIdleRadius * 2.4, 38);
      canvas.style.cursor = pointer.hoverSeed ? 'pointer' : 'default';
      return;
    }

    pointer.hoverSeed = false;
    if (
      simState === STATE.MICRO_QUARKS ||
      simState === STATE.COSMIC_WEB ||
      simState === STATE.STELLAR_FUSION
    ) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  /**
   * Avanzamento raffreddamento/ricombinazione continuo delle particelle primordiali.
   */
  function advanceRecombination(ratePerFrame, dt) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.recombMix < 1) {
        p.recombMix = Math.min(1, p.recombMix + ratePerFrame * dt);
      }
    }
  }

  function updateMicroPhysics(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    micro.time += dtMs;

    const minDim = Math.min(viewW, viewH);
    const quarks = micro.quarks;
    const formDuration = prefersReducedMotion ? 1000 : 1800;

    if (micro.time < formDuration) {
      const jitterScale = 2.2 / MICRO_ZOOM;
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        q.ox = q.homeOx + Math.sin(micro.time * 0.004 + i * 2) * jitterScale;
        q.oy = q.homeOy + Math.cos(micro.time * 0.0045 + i * 2) * jitterScale;
      }
      return;
    }

    if (!micro.orbitKickApplied) {
      micro.orbitKickApplied = true;
      const kick = 0.72 / MICRO_ZOOM;
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        const tangAngle = q.baseAngle + Math.PI / 2;
        q.vx = Math.cos(tangAngle) * kick;
        q.vy = Math.sin(tangAngle) * kick;
      }
    }

    const bindElapsed = micro.time - formDuration;
    const bindRamp = easeInOutQuad(clamp(bindElapsed / 4200, 0, 1));
    const eqDist = clamp(minDim * 0.068, 28, 52) / MICRO_ZOOM;
    const springStrength = 0.0014 + bindRamp * 0.0038;
    const randAmp = 0.18 / MICRO_ZOOM;

    for (let i = 0; i < 3; i++) {
      const q = quarks[i];
      const dxC = -q.ox;
      const dyC = -q.oy;
      q.vx += dxC * (0.0008 + bindRamp * 0.0014) * dt;
      q.vy += dyC * (0.0008 + bindRamp * 0.0014) * dt;

      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const other = quarks[j];
        const dx = other.ox - q.ox;
        const dy = other.oy - q.oy;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const nx = dx / dist;
        const ny = dy / dist;

        if (dist > eqDist) {
          const pull = (dist - eqDist) * springStrength * dt;
          q.vx += nx * pull;
          q.vy += ny * pull;
        } else {
          const push = (eqDist - dist) * 0.022 * dt;
          q.vx -= nx * push;
          q.vy -= ny * push;
        }
      }

      q.vx += (-dyC * 0.00085 + (Math.random() - 0.5) * randAmp) * dt;
      q.vy += (dxC * 0.00085 + (Math.random() - 0.5) * randAmp) * dt;

      q.vx *= Math.pow(0.955, dt);
      q.vy *= Math.pow(0.955, dt);
      q.ox += q.vx * dt;
      q.oy += q.vy * dt;
    }

    const avgSepScreen =
      ((Math.hypot(quarks[0].ox - quarks[1].ox, quarks[0].oy - quarks[1].oy) +
        Math.hypot(quarks[1].ox - quarks[2].ox, quarks[1].oy - quarks[2].oy) +
        Math.hypot(quarks[2].ox - quarks[0].ox, quarks[2].oy - quarks[0].oy)) /
        3) *
      MICRO_ZOOM;

    const emitInterval = clamp(avgSepScreen * 0.85, 95, 220);
    micro.gluonTimer += dtMs;
    if (micro.gluonTimer >= emitInterval && micro.gluons.length < 28) {
      micro.gluonTimer = 0;
      const fromIdx = Math.floor(Math.random() * 3);
      const toIdx = (fromIdx + 1 + Math.floor(Math.random() * 2)) % 3;
      micro.gluons.push({
        fromIdx,
        toIdx,
        t: 0,
        speed: 0.0085 + Math.random() * 0.005,
        curveOffset: ((Math.random() - 0.5) * clamp(avgSepScreen * 0.55, 22, 65)) / MICRO_ZOOM,
        colorIdx: Math.random() < 0.45 ? 0 : quarks[fromIdx].colorIdx,
      });
    }

    const gluonKick = 0.18 / MICRO_ZOOM;
    for (let i = micro.gluons.length - 1; i >= 0; i--) {
      const g = micro.gluons[i];
      g.t += g.speed * dt;
      if (g.t >= 1) {
        const qFrom = quarks[g.fromIdx];
        const qTo = quarks[g.toIdx];
        const dx = qFrom.ox - qTo.ox;
        const dy = qFrom.oy - qTo.oy;
        const len = Math.hypot(dx, dy) || 0.0001;
        qTo.vx += (dx / len) * gluonKick;
        qTo.vy += (dy / len) * gluonKick;
        micro.gluons.splice(i, 1);
      }
    }

    const electronTrigger = formDuration + (prefersReducedMotion ? 2600 : 5400);
    if (micro.time > electronTrigger) {
      const el = micro.electron;
      el.active = true;
      el.radius += (el.targetRadius - el.radius) * 0.018 * dt;
      el.angle += 0.022 * dt;
      el.ox = Math.cos(el.angle) * el.radius;
      el.oy = Math.sin(el.angle) * el.radius * 0.78;

      el.trail.push({ ox: el.ox, oy: el.oy, alpha: 0.75 });
      if (el.trail.length > 42) el.trail.shift();
      for (let i = 0; i < el.trail.length; i++) {
        el.trail[i].alpha *= Math.pow(0.95, dt);
      }

      // Mentre l'atomo si ricombina, il plasma attorno inizia dolcemente a raffreddarsi
      advanceRecombination(0.0045, dt);
    }
  }

  /**
   * Fisica cosmica nello spazio mondo esteso a 0.50x: nessuna forza del mouse sulle particelle.
   */
  function updateCosmicWebPhysics(dtMs, forceMultiplier = 1) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    cosmic.elapsed += dtMs;

    const gravityRamp = easeInOutQuad(clamp((cosmic.elapsed - 500) / 5200, 0, 1)) * forceMultiplier;
    const total = particles.length;

    if (shNext.length !== total) {
      shNext = new Int32Array(total);
    }
    shHead.fill(-1);
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      if (p.x >= -shSpanW && p.x < shSpanW && p.y >= -shSpanH && p.y < shSpanH) {
        const cxCell = clamp(Math.floor((p.x + shSpanW) / SH_CELL) + 1, 0, shCols - 1);
        const cyCell = clamp(Math.floor((p.y + shSpanH) / SH_CELL) + 1, 0, shRows - 1);
        const cellIdx = cyCell * shCols + cxCell;
        shNext[i] = shHead[cellIdx];
        shHead[cellIdx] = i;
      }
    }

    const nodes = cosmic.nodes;
    const filaments = cosmic.filaments;
    const nodeCount = nodes.length;
    const filCount = filaments.length;

    const repelDist = 6.4;
    const repelDistSq = repelDist * repelDist;
    const repelStrength = 0.16 * forceMultiplier;

    for (let i = 0; i < total; i++) {
      const p = particles[i];
      if (star.active && p.starRole !== 'cosmic') continue;
      const mass = p.mass;
      const role = p.cosmicRole || 0.5;

      const thermal = (0.14 - 0.055 * gravityRamp) * (prefersReducedMotion ? 0.25 : 1) * forceMultiplier;
      p.vx += (Math.random() - 0.5) * thermal * dt;
      p.vy += (Math.random() - 0.5) * thermal * dt;

      if (p.x >= -shSpanW && p.x < shSpanW && p.y >= -shSpanH && p.y < shSpanH) {
        const cxCell = clamp(Math.floor((p.x + shSpanW) / SH_CELL) + 1, 0, shCols - 1);
        const cyCell = clamp(Math.floor((p.y + shSpanH) / SH_CELL) + 1, 0, shRows - 1);
        for (let oy = -1; oy <= 1; oy++) {
          if (cyCell + oy < 0 || cyCell + oy >= shRows) continue;
          const rowBase = (cyCell + oy) * shCols;
          for (let ox = -1; ox <= 1; ox++) {
            if (cxCell + ox < 0 || cxCell + ox >= shCols) continue;
            let j = shHead[rowBase + cxCell + ox];
            while (j !== -1) {
              if (j !== i) {
                const q = particles[j];
                const rdx = p.x - q.x;
                const rdy = p.y - q.y;
                const rDistSq = rdx * rdx + rdy * rdy;
                if (rDistSq < repelDistSq && rDistSq > 0.001) {
                  const rDist = Math.sqrt(rDistSq);
                  const push = (1 - rDist / repelDist) * repelStrength * dt;
                  p.vx += (rdx / rDist) * push;
                  p.vy += (rdy / rDist) * push;
                }
              }
              j = shNext[j];
            }
          }
        }
      }

      if (gravityRamp > 0.001 && role < 0.88) {
        if (role < 0.48) {
          let bestFilDistSq = Infinity;
          let bestFilDx = 0;
          let bestFilDy = 0;
          let bestFilTangentX = 0;
          let bestFilTangentY = 0;

          for (let f = 0; f < filCount; f++) {
            const fil = filaments[f];
            const abx = fil.bx - fil.ax;
            const aby = fil.by - fil.ay;
            const t = clamp(((p.x - fil.ax) * abx + (p.y - fil.ay) * aby) / fil.lenSq, 0, 1);
            const curve = Math.sin(t * Math.PI) * fil.bend;
            const targetX = fil.ax + abx * t + fil.nx * (curve + (p.filSpread || 0));
            const targetY = fil.ay + aby * t + fil.ny * (curve + (p.filSpread || 0));
            const dx = targetX - p.x;
            const dy = targetY - p.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestFilDistSq) {
              bestFilDistSq = dSq;
              bestFilDx = dx;
              bestFilDy = dy;
              const len = Math.sqrt(fil.lenSq) || 1;
              bestFilTangentX = abx / len;
              bestFilTangentY = aby / len;
            }
          }

          const filDist = Math.sqrt(bestFilDistSq) || 1;
          if (filDist > 3.0) {
            const falloff = filDist < 520 ? 1 - filDist / 520 : 0.08;
            const filPull = (0.03 + 0.14 * falloff) * gravityRamp * mass * dt;
            p.vx += (bestFilDx / filDist) * filPull;
            p.vy += (bestFilDy / filDist) * filPull;
          }
          if (filDist < 32) {
            const streamDir = i % 2 === 0 ? 1 : -1;
            p.vx += bestFilTangentX * 0.015 * streamDir * gravityRamp * dt;
            p.vy += bestFilTangentY * 0.015 * streamDir * gravityRamp * dt;
          }
        }

        const nodeAffinity = role >= 0.48 ? 1.0 : 0.16;
        let nearestNodeDist = Infinity;

        for (let n = 0; n < nodeCount; n++) {
          const node = nodes[n];
          const dx = node.x - p.x;
          const dy = node.y - p.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          if (dist < nearestNodeDist) nearestNodeDist = dist;

          if (dist > 560) continue;

          const softSq = distSq + 5600;
          const gPull = (node.mass * 280 * nodeAffinity * gravityRamp * mass * dt) / softSq;
          const nx = dx / Math.max(8, dist);
          const ny = dy / Math.max(8, dist);
          p.vx += nx * gPull;
          p.vy += ny * gPull;

          if (dist > 6 && dist < 104) {
            const haloNorm = 1 - dist / 104;
            const tang = 0.042 * haloNorm * node.mass * gravityRamp * dt * node.spin;
            p.vx += -ny * tang;
            p.vy += nx * tang;
          }
        }

        if (nearestNodeDist < 48) {
          if (p.species === 'H' && Math.random() < 0.05) {
            p.coolColorIdx = nearestNodeDist < 18 ? 0 : 8;
          } else if (p.species === 'He' && Math.random() < 0.05) {
            p.coolColorIdx = nearestNodeDist < 16 ? 0 : 7;
          }
        } else if (p.coolColorIdx !== p.baseColorIdx && Math.random() < 0.03) {
          p.coolColorIdx = p.baseColorIdx;
        }
      }

      const damp = Math.pow(0.935, dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /**
   * Calcola il parametro lungo il filamento subito fuori dai bordi visibili dello schermo zoomato.
   */
  function getFilamentOffscreenT(fil) {
    const filLen = Math.sqrt(fil.lenSq) || 1;
    const cornerWorldDist = Math.hypot(viewW * 0.5, viewH * 0.5) / Math.max(0.5, camZoom);
    return clamp((cornerWorldDist * 1.12) / filLen, 0.34, 0.96);
  }

  /**
   * Fisica continua del Capitolo 3 sulla STESSA scena senza distruggere la distribuzione cosmica:
   * - Solo 'core' (ammasso locale) e 'feeder' (flussi lungo i filamenti connessi) partecipano alla stella
   * - Tutto il resto dell'universo ('cosmic') continua indisturbato la propria fisica della rete cosmica
   * - Densità crescente ma senza bruciare al bianco, centro più fermo, gradiente continuo H -> Fe
   */
  function updateStellarClusterPhysics(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    star.elapsed += dtMs;

    const blendDur = prefersReducedMotion ? 1100 : 2100;
    star.blend = easeInOutQuad(clamp(star.elapsed / blendDur, 0, 1));
    const sBlend = star.blend;

    const fusionDuration = prefersReducedMotion ? 7000 : 13500;
    const fusionActiveTime = Math.max(0, star.elapsed - 1600);
    star.fusionDepth = easeInOutQuad(clamp(fusionActiveTime / fusionDuration, 0, 1));
    const depth = star.fusionDepth;

    const node = cosmic.nodes[targetClusterNodeIdx];
    const filList = star.connectedFilaments;
    const starR = star.worldRadius;
    const coreContraction = 1 - 0.16 * depth;
    const maxStarCoreParticles = 580;

    const halfViewWorldW = (viewW * 0.5) / camZoom;
    const halfViewWorldH = (viewH * 0.5) / camZoom;

    const total = particles.length;
    for (let i = 0; i < total; i++) {
      const p = particles[i];

      // Reclutamento graduale e scaglionato SOLO dai lontani serbatoi fuori schermo verso i filamenti connessi
      if (
        p.starRole === 'cosmic' &&
        p.canRecruitFeeder &&
        camZoom >= STAR_ZOOM * 0.65 &&
        star.elapsed > 700 + p.feederDelay &&
        filList.length > 0
      ) {
        const offScreen =
          Math.abs(p.x - camX) > halfViewWorldW * 1.15 ||
          Math.abs(p.y - camY) > halfViewWorldH * 1.15;
        if (offScreen) {
          const filIdx = i % filList.length;
          const fil = filList[filIdx];
          const entryT = getFilamentOffscreenT(fil);
          const t = Math.min(0.98, entryT + 0.04 + Math.random() * 0.18);
          const curve = Math.sin(t * Math.PI) * fil.bend;
          const candX = fil.ax + (fil.bx - fil.ax) * t + fil.nx * (curve + (p.filSpread || 0) * 0.7);
          const candY = fil.ay + (fil.by - fil.ay) * t + fil.ny * (curve + (p.filSpread || 0) * 0.7);
          const candOff =
            Math.abs(candX - camX) > halfViewWorldW * 1.06 ||
            Math.abs(candY - camY) > halfViewWorldH * 1.06;
          if (candOff) {
            p.starRole = 'feeder';
            p.isFilamentFeeder = true;
            p.canRecruitFeeder = false;
            p.feederFilIdx = filIdx;
            p.feederT = t;
            p.feederFade = 0;
            p.x = candX;
            p.y = candY;
            p.vx = 0;
            p.vy = 0;
          }
        }
      }

      if (p.starRole === 'cosmic') {
        continue;
      }

      if (p.starRole === 'feeder' && filList.length > 0) {
        const fil = filList[p.feederFilIdx % filList.length];
        const speed = (0.00052 + 0.00042 * (p.mass - 0.9)) * (prefersReducedMotion ? 0.35 : 1);
        p.feederT -= speed * dt;

        const t = Math.max(0.01, p.feederT);
        const curve = Math.sin(t * Math.PI) * fil.bend;
        const targetX = fil.ax + (fil.bx - fil.ax) * t + fil.nx * (curve + (p.filSpread || 0) * 0.7);
        const targetY = fil.ay + (fil.by - fil.ay) * t + fil.ny * (curve + (p.filSpread || 0) * 0.7);

        p.vx += (targetX - p.x) * 0.055 * dt;
        p.vy += (targetY - p.y) * 0.055 * dt;
        p.vx *= Math.pow(0.86, dt);
        p.vy *= Math.pow(0.86, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const distNode = Math.hypot(p.x - node.x, p.y - node.y);

        // Il flusso lungo il filamento accresce gradualmente la stella finché non è matura
        if (distNode < starR * 0.95 && star.coreCount < maxStarCoreParticles && p.feederFade > 0.5) {
          p.starRole = 'core';
          p.isFilamentFeeder = false;
          p.feederFade = 1;
          p.starRPref = clamp(distNode * (0.45 + 0.45 * Math.random()), 10, starR * 0.95);
          star.coreCount++;
          continue;
        }

        if (distNode < starR * 0.32) {
          p.feederFade = clamp((distNode - starR * 0.14) / (starR * 0.18), 0, 1);
        } else {
          p.feederFade = Math.min(1, p.feederFade + 0.04 * dt);
        }

        if (p.feederT <= 0.03 || p.feederFade <= 0.01) {
          const entryT = getFilamentOffscreenT(fil);
          const resetT = Math.min(0.98, entryT + 0.04 + Math.random() * 0.16);
          const resetCurve = Math.sin(resetT * Math.PI) * fil.bend;
          p.feederT = resetT;
          p.feederFade = 0;
          p.x = fil.ax + (fil.bx - fil.ax) * resetT + fil.nx * (resetCurve + (p.filSpread || 0) * 0.7);
          p.y = fil.ay + (fil.by - fil.ay) * resetT + fil.ny * (resetCurve + (p.filSpread || 0) * 0.7);
          p.vx = 0;
          p.vy = 0;
          p.starHeat = 0;
          p.heatMix = 0;
          continue;
        }

        if (distNode < starR * 1.15) {
          const edgeHeat = clamp((1 - distNode / (starR * 1.15)) * 0.24, 0, 0.24);
          p.starHeat += (edgeHeat - p.starHeat) * 0.08 * dt;
          p.heatMix = Math.min(1, p.heatMix + 0.04 * dt);
        } else {
          p.heatMix = Math.max(0, p.heatMix - 0.04 * dt);
        }
        continue;
      }

      // Corpo stellare ('core') attorno a node.x, node.y
      const dx = p.x - node.x;
      const dy = p.y - node.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;

      const rRatio = clamp(dist / starR, 0, 1);
      // Centro più fermo e compatto; strati esterni più mobili
      const mobility = 0.04 + 0.96 * Math.pow(rRatio, 1.55);

      const convWave = Math.sin(star.elapsed * 0.0014 + p.starPhase) * (starR * 0.035 * mobility);
      const targetR = Math.max(1.5, p.starRPref * coreContraction + convWave);
      const radialErr = targetR - dist;

      const radialSpring = (0.014 + 0.016 * (1 - rRatio * 0.5)) * (0.18 + 0.82 * sBlend);
      p.vx += nx * radialErr * radialSpring * dt;
      p.vy += ny * radialErr * radialSpring * dt;

      const swirl = 0.058 * mobility * (0.25 + 0.75 * sBlend) * (prefersReducedMotion ? 0.25 : 1) * node.spin;
      const jitter = 0.016 * mobility * (prefersReducedMotion ? 0.2 : 1);
      p.vx += (-ny * swirl + (Math.random() - 0.5) * jitter) * dt;
      p.vy += (nx * swirl + (Math.random() - 0.5) * jitter) * dt;

      const damp = Math.pow(0.89 - 0.05 * (1 - mobility), dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Gradiente cromatico radiale puro e morbido (zero macchie coriandolo)
      const radialDepth = clamp(1 - dist / (starR * 1.04), 0, 1);
      const targetHeat = clamp(Math.pow(radialDepth, 1.15) * depth + p.starNoise, 0, 1);
      p.starHeat += (targetHeat - p.starHeat) * 0.04 * dt;
      const targetHeatMix = clamp(sBlend * (dist < starR * 1.35 ? 1 : 0.2), 0, 1);
      p.heatMix += (targetHeatMix - p.heatMix) * 0.04 * dt;
    }
  }

  function updateSimulation(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    stateTime += dtMs;

    const { seedIdleRadius, seedMaxRadius } = layoutBounds;

    if (simState === STATE.IDLE_SEED) {
      const targetHover = pointer.hoverSeed ? 1 : 0;
      seedHoverCharge += (targetHover - seedHoverCharge) * 0.12 * dt;
      const breathAmp = prefersReducedMotion ? 0.5 : 1.9;
      seedCurrentRadius = seedIdleRadius + Math.sin(stateTime * 0.003) * breathAmp + seedHoverCharge * 6;
      return;
    }

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

    if (simState === STATE.BIG_BANG) {
      const bangDuration = prefersReducedMotion ? 720 : 920;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const damp = Math.pow(p.burstDrag, dt);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (stateTime >= bangDuration) {
        enterSlowMoReticle();
      }
      return;
    }

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
      camX = hero.x * centerEase;
      camY = hero.y * centerEase;
      camZoom = 1 + 0.35 * centerEase;

      reticleAlpha = easeOutCubic(clamp(progress * 1.4, 0, 1));
      reticleSize = 116 - 68 * easeOutCubic(progress);

      if (progress >= 1) {
        simState = STATE.CAMERA_ZOOM_IN;
        stateTime = 0;
      }
      return;
    }

    if (simState === STATE.CAMERA_ZOOM_IN) {
      const dur = prefersReducedMotion ? 1050 : 1750;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      const hero = particles[heroIdx];
      camX = hero.x;
      camY = hero.y;
      camZoom = 1.35 * Math.pow(MICRO_ZOOM / 1.35, eased);

      // Le altre particelle del Big Bang continuano la loro leggerissima deriva inerziale nello stesso mondo
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vx *= Math.pow(0.96, dt);
        p.vy *= Math.pow(0.96, dt);
        p.x += p.vx * dt * 0.03;
        p.y += p.vy * dt * 0.03;
      }

      if (progress >= 1) {
        simState = STATE.MICRO_QUARKS;
        stateTime = 0;
        camZoom = MICRO_ZOOM;
        syncHitboxes();
      }
      return;
    }

    if (simState === STATE.MICRO_QUARKS) {
      const hero = particles[heroIdx];
      camX = hero.x;
      camY = hero.y;
      updateMicroPhysics(dtMs);
      return;
    }

    if (simState === STATE.CAMERA_ZOOM_OUT) {
      const dur = prefersReducedMotion ? 1200 : 2400;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      camZoom = camStartZoom * Math.pow(COSMIC_ZOOM / camStartZoom, eased);
      camX = camStartX * (1 - eased);
      camY = camStartY * (1 - eased);

      // Completa con dolcezza il raffreddamento da plasma bianco a H/He su tutte le particelle
      advanceRecombination(0.018, dt);

      // L'atomo micro e la rete cosmica condividono lo stesso identico mondo
      updateMicroPhysics(dtMs * 0.45);
      updateCosmicWebPhysics(dtMs, easeInOutQuad(clamp(progress * 1.15, 0, 1)));

      if (progress >= 1) {
        simState = STATE.COSMIC_WEB;
        stateTime = 0;
        camZoom = COSMIC_ZOOM;
        camX = 0;
        camY = 0;
        for (let i = 0; i < particles.length; i++) {
          particles[i].recombMix = 1;
        }
        syncHitboxes();
      }
      return;
    }

    if (simState === STATE.COSMIC_WEB) {
      updateCosmicWebPhysics(dtMs, 1);
      return;
    }

    if (simState === STATE.STAR_RETICLE) {
      const dur = prefersReducedMotion ? 850 : 1300;
      const progress = clamp(stateTime / dur, 0, 1);
      const node = cosmic.nodes[targetClusterNodeIdx];
      const ease = easeInOutQuad(progress);

      camX = camStartX + (node.x - camStartX) * ease;
      camY = camStartY + (node.y - camStartY) * ease;
      camZoom = camStartZoom * Math.pow(0.85 / camStartZoom, ease);

      reticleAlpha = easeOutCubic(clamp(progress * 1.4, 0, 1));
      reticleSize = 128 - 64 * easeOutCubic(progress);

      updateCosmicWebPhysics(dtMs, 1);

      if (progress >= 1) {
        simState = STATE.STAR_ZOOM_IN;
        stateTime = 0;
        camStartX = camX;
        camStartY = camY;
        camStartZoom = camZoom;
        star.active = true;
        star.elapsed = 0;
      }
      return;
    }

    if (simState === STATE.STAR_ZOOM_IN) {
      const dur = prefersReducedMotion ? 1200 : 2200;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);
      const node = cosmic.nodes[targetClusterNodeIdx];

      camX = node.x;
      camY = node.y;
      camZoom = camStartZoom * Math.pow(STAR_ZOOM / camStartZoom, eased);

      updateCosmicWebPhysics(dtMs, 1);
      updateStellarClusterPhysics(dtMs);

      if (progress >= 1) {
        simState = STATE.STELLAR_FUSION;
        stateTime = 0;
        camZoom = STAR_ZOOM;
        syncHitboxes();
      }
      return;
    }

    if (simState === STATE.STELLAR_FUSION) {
      updateCosmicWebPhysics(dtMs, 1);
      updateStellarClusterPhysics(dtMs);
      return;
    }

    if (simState === STATE.IMPLODING) {
      const total = particles.length;
      const gatherThreshSq = Math.pow(seedIdleRadius * 2.1, 2);
      let gatheredCount = 0;
      const mergeShrink = implodeMerging ? 1 - implodeMergeAlpha * 0.45 : 1;

      const camEase = easeInOutCubic(clamp(stateTime / 900, 0, 1));
      camX = camStartX * (1 - camEase);
      camY = camStartY * (1 - camEase);
      camZoom = camStartZoom * Math.pow(1.0 / Math.max(0.1, camStartZoom), camEase);

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const targetX = p.coreOx * mergeShrink;
        const targetY = p.coreOy * mergeShrink;
        const dx = targetX - p.x;
        const dy = targetY - p.y;

        const pull = (implodeMerging ? 0.16 : p.gatherPull) * dt;
        const damp = Math.pow(implodeMerging ? 0.72 : 0.8, dt);
        p.vx = (p.vx + dx * pull) * damp;
        p.vy = (p.vy + dy * pull) * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.recombMix = Math.max(0, p.recombMix - 0.045 * dt);
        p.heatMix = Math.max(0, p.heatMix - 0.06 * dt);

        if (p.x * p.x + p.y * p.y <= gatherThreshSq) {
          gatheredCount++;
        }
      }

      if (!implodeMerging) {
        if (gatheredCount >= total * 0.97 || stateTime > 1650) {
          implodeMerging = true;
          implodeMergeTime = 0;
        }
      } else {
        implodeMergeTime += dtMs;
        const mergeDuration = prefersReducedMotion ? 220 : 400;
        implodeMergeAlpha = easeInOutQuad(clamp(implodeMergeTime / mergeDuration, 0, 1));
        seedCurrentRadius = seedIdleRadius;

        if (implodeMergeAlpha >= 1) {
          simState = STATE.IDLE_SEED;
          stateTime = 0;
          camX = 0;
          camY = 0;
          camZoom = 1;
          seedHoverCharge = 0;
          seedCurrentRadius = seedIdleRadius;
          implodeMerging = false;
          implodeMergeAlpha = 0;
          syncHitboxes();
        }
      }
    }
  }

  function drawWhiteSeedSphere(sx, sy, r, alphaScale, growthNorm) {
    const haloSpread = r * (2.4 + seedHoverCharge * 0.4 + growthNorm * 0.7);
    const grad = ctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, haloSpread);
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
    ctx.arc(sx, sy, haloSpread, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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

    ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.42).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, size, size);

    ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.95).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(left, top + corner);
    ctx.lineTo(left, top);
    ctx.lineTo(left + corner, top);
    ctx.moveTo(right - corner, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + corner);
    ctx.moveTo(right, bottom - corner);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right - corner, bottom);
    ctx.moveTo(left + corner, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - corner);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Disegna la struttura interna di particles[heroIdx] direttamente in coordinate mondo,
   * scalata proporzionalmente dalla telecamera unica (camZoom / MICRO_ZOOM).
   */
  function renderMicroScene(heroWorldX, heroWorldY, opacity) {
    if (opacity <= 0.01) return;
    const { cx, cy } = layoutBounds;
    const quarks = micro.quarks;
    const scaleFactor = camZoom / MICRO_ZOOM;

    const tx = (wx) => cx + (wx - camX) * camZoom;
    const ty = (wy) => cy + (wy - camY) * camZoom;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const formDuration = prefersReducedMotion ? 1000 : 1800;
    const formProgress = clamp(micro.time / formDuration, 0, 1);
    const condenseEase = easeOutCubic(formProgress);
    const colorMix = easeInOutQuad(clamp((formProgress - 0.2) / 0.8, 0, 1));

    if (micro.time >= formDuration) {
      const filamentAlpha = clamp((micro.time - formDuration) / 800, 0, 1) * 0.14 * opacity;
      for (let i = 0; i < 3; i++) {
        const qA = quarks[i];
        const qB = quarks[(i + 1) % 3];
        const x1 = tx(heroWorldX + qA.ox);
        const y1 = ty(heroWorldY + qA.oy);
        const x2 = tx(heroWorldX + qB.ox);
        const y2 = ty(heroWorldY + qB.oy);
        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist > 6) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${filamentAlpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, 1.2 * scaleFactor);
          ctx.setLineDash([3 * scaleFactor, 6 * scaleFactor]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    for (let i = 0; i < micro.gluons.length; i++) {
      const g = micro.gluons[i];
      const qA = quarks[g.fromIdx];
      const qB = quarks[g.toIdx];

      const x1 = heroWorldX + qA.ox;
      const y1 = heroWorldY + qA.oy;
      const x2 = heroWorldX + qB.ox;
      const y2 = heroWorldY + qB.oy;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 0.0001;
      const nx = -dy / len;
      const ny = dx / len;
      const midX = (x1 + x2) * 0.5 + nx * g.curveOffset;
      const midY = (y1 + y2) * 0.5 + ny * g.curveOffset;

      const t = g.t;
      const omt = 1 - t;
      const gx = omt * omt * x1 + 2 * omt * t * midX + t * t * x2;
      const gy = omt * omt * y1 + 2 * omt * t * midY + t * t * y2;

      const sx = tx(gx);
      const sy = ty(gy);
      const gRad = (6.2 + Math.sin(t * Math.PI) * 3.8) * scaleFactor;

      ctx.globalAlpha = opacity * 0.96;
      ctx.drawImage(glowSprites[g.colorIdx], sx - gRad, sy - gRad, gRad * 2, gRad * 2);

      for (let s = 1; s <= 3; s++) {
        const tPrev = Math.max(0, t - s * 0.045);
        const omtP = 1 - tPrev;
        const px = omtP * omtP * x1 + 2 * omtP * tPrev * midX + tPrev * tPrev * x2;
        const py = omtP * omtP * y1 + 2 * omtP * tPrev * midY + tPrev * tPrev * y2;
        const trailRad = gRad * (0.68 - s * 0.14);
        ctx.globalAlpha = opacity * (0.5 - s * 0.12);
        ctx.drawImage(
          glowSprites[0],
          tx(px) - trailRad,
          ty(py) - trailRad,
          trailRad * 2,
          trailRad * 2
        );
      }
    }

    const now = performance.now() * 0.004;
    const dotJitterWorld = 2.1 / MICRO_ZOOM;
    for (let i = 0; i < 3; i++) {
      const q = quarks[i];
      const qx = tx(heroWorldX + q.ox);
      const qy = ty(heroWorldY + q.oy);

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

      for (let k = 0; k < q.subDots.length; k++) {
        const sd = q.subDots[k];
        const curOx = sd.spawnOx + (sd.ox - sd.spawnOx) * condenseEase;
        const curOy = sd.spawnOy + (sd.oy - sd.spawnOy) * condenseEase;
        const jx = Math.cos(now + sd.phase) * dotJitterWorld;
        const jy = Math.sin(now * 1.2 + sd.phase) * dotJitterWorld;
        const sx = tx(heroWorldX + q.ox + curOx + jx);
        const sy = ty(heroWorldY + q.oy + curOy + jy);
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

    if (micro.electron.active) {
      const el = micro.electron;
      for (let i = 0; i < el.trail.length; i++) {
        const tr = el.trail[i];
        const trRad = 4.2 * scaleFactor;
        ctx.globalAlpha = tr.alpha * opacity * 0.55;
        ctx.drawImage(
          glowSprites[5],
          tx(heroWorldX + tr.ox) - trRad,
          ty(heroWorldY + tr.oy) - trRad,
          trRad * 2,
          trRad * 2
        );
      }

      const ex = tx(heroWorldX + el.ox);
      const ey = ty(heroWorldY + el.oy);
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
      drawWhiteSeedSphere(cx + (0 - camX) * camZoom, cy + (0 - camY) * camZoom, r, 1, growthNorm);
      return;
    }

    const dotBase = CONFIG.dotSize;
    const total = particles.length;
    const particleMergeFade =
      simState === STATE.IMPLODING && implodeMerging ? Math.max(0, 1 - implodeMergeAlpha * 0.9) : 1;

    // Cross-dissolve continuo tra il punto particella singolo `hero` e la sua vista interna `micro`
    // basato esclusivamente su camZoom (mai un salto booleano tra stati)
    const inMicroChapter =
      simState === STATE.CAMERA_ZOOM_IN ||
      simState === STATE.MICRO_QUARKS ||
      simState === STATE.CAMERA_ZOOM_OUT;
    const microOpacity = inMicroChapter ? clamp((camZoom - 2.2) / 5.5, 0, 1) : 0;
    const heroMacroFactor = clamp(1 - (camZoom - 2.2) / 5.5, 0, 1);

    const sBlend = star.active ? star.blend : 0;
    const targetNode = star.active ? cosmic.nodes[targetClusterNodeIdx] : null;

    // Alone stellare continuo proporzionale a star.blend (zero apparizioni improvvise)
    if (star.active && sBlend > 0.01 && targetNode) {
      const nsx = cx + (targetNode.x - camX) * camZoom;
      const nsy = cy + (targetNode.y - camY) * camZoom;
      const glowR = star.worldRadius * camZoom * 1.15;
      const depth = star.fusionDepth;
      const [cr, cg, cb] = sampleStellarRGB(depth);
      const bgGrad = ctx.createRadialGradient(nsx, nsy, 0, nsx, nsy, glowR);
      bgGrad.addColorStop(0.0, `rgba(${cr}, ${cg}, ${cb}, ${(sBlend * (0.09 + 0.10 * depth)).toFixed(3)})`);
      bgGrad.addColorStop(0.45, `rgba(255, 165, 92, ${(sBlend * (0.04 + 0.04 * depth)).toFixed(3)})`);
      bgGrad.addColorStop(0.82, `rgba(76, 166, 255, ${(sBlend * 0.03).toFixed(3)})`);
      bgGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(nsx, nsy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const optScale = opticalRadiusScale(camZoom);
    const cosmicVoidFactor = cosmic.active
      ? easeInOutQuad(clamp(cosmic.elapsed / 2500, 0, 1)) * (1 - sBlend * 0.35)
      : 0;
    const cullPad = dotBase * optScale * 6;

    // Rendering continuo di TUTTE le particelle nello stesso spazio mondo (nessun array secondario, nessun taglio)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const sx = cx + (p.x - camX) * camZoom;
      const sy = cy + (p.y - camY) * camZoom;

      if (sx < -cullPad || sx > viewW + cullPad || sy < -cullPad || sy > viewH + cullPad) {
        continue;
      }

      let alpha = p.alphaBase * particleMergeFade;
      if (i === heroIdx) {
        alpha *= heroMacroFactor;
      }
      if (p.isFilamentFeeder) {
        alpha *= p.feederFade;
      }
      if (cosmicVoidFactor > 0.01 && (p.cosmicRole || 0) >= 0.88 && p.starRole === 'cosmic') {
        alpha *= 1 - 0.52 * cosmicVoidFactor;
      }
      if (sBlend > 0.01 && targetNode && p.starRole === 'core') {
        const distWorld = Math.hypot(p.x - targetNode.x, p.y - targetNode.y);
        if (distWorld < star.worldRadius * 0.38) {
          const coreAtten = 0.44 + 0.56 * (distWorld / (star.worldRadius * 0.38));
          alpha *= 1 - sBlend * (1 - coreAtten);
        }
        alpha *= 1 - 0.22 * sBlend;
      }

      if (alpha <= 0.01) continue;

      const spriteRadius = dotBase * p.sizeFactor * optScale * 2.25;
      const heatMix = star.active ? p.heatMix : 0;

      if (heatMix > 0.01) {
        const stIdx = clamp(
          Math.round(p.starHeat * (STELLAR_GRADIENT_COUNT - 1)),
          0,
          STELLAR_GRADIENT_COUNT - 1
        );
        if (heatMix < 0.99) {
          const coolAlpha = alpha * (1 - heatMix);
          const rm = p.recombMix;
          if (rm < 0.99) {
            ctx.globalAlpha = coolAlpha * (1 - rm);
            ctx.drawImage(glowSprites[p.colorIdx], sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
          }
          if (rm > 0.01) {
            ctx.globalAlpha = coolAlpha * rm;
            ctx.drawImage(glowSprites[p.coolColorIdx ?? p.baseColorIdx], sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
          }
        }
        ctx.globalAlpha = alpha * heatMix;
        ctx.drawImage(stellarSprites[stIdx], sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
      } else {
        const rm = p.recombMix;
        const cooledSprite = glowSprites[p.coolColorIdx ?? p.baseColorIdx];
        if (rm <= 0.01) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(glowSprites[p.colorIdx], sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
        } else if (rm >= 0.99) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(cooledSprite, sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
        } else {
          ctx.globalAlpha = alpha * (1 - rm);
          ctx.drawImage(glowSprites[p.colorIdx], sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
          ctx.globalAlpha = alpha * rm;
          ctx.drawImage(cooledSprite, sx - spriteRadius, sy - spriteRadius, spriteRadius * 2, spriteRadius * 2);
        }
      }
    }

    // Riquadri bianchi di puntamento (Capitolo 1 sulla particella isolata, Capitolo 3 sull'ammasso cosmico)
    if (simState === STATE.SLOW_MO_RETICLE || simState === STATE.CAMERA_ZOOM_IN) {
      const hero = particles[heroIdx];
      const hsx = cx + (hero.x - camX) * camZoom;
      const hsy = cy + (hero.y - camY) * camZoom;
      const boxSize = simState === STATE.SLOW_MO_RETICLE ? reticleSize : (48 / 1.35) * camZoom;
      const boxAlpha =
        simState === STATE.SLOW_MO_RETICLE ? reticleAlpha : clamp(1 - (camZoom - 8) / 8, 0, 1);
      drawWhiteReticle(hsx, hsy, boxSize, boxAlpha);
    } else if (simState === STATE.STAR_RETICLE || simState === STATE.STAR_ZOOM_IN) {
      const node = cosmic.nodes[targetClusterNodeIdx];
      const nsx = cx + (node.x - camX) * camZoom;
      const nsy = cy + (node.y - camY) * camZoom;
      const boxSize = simState === STATE.STAR_RETICLE ? reticleSize : (64 / 0.85) * camZoom;
      const boxAlpha =
        simState === STATE.STAR_RETICLE ? reticleAlpha : clamp(1 - (camZoom - 1.45) / 1.15, 0, 1);
      drawWhiteReticle(nsx, nsy, boxSize, boxAlpha);
    }

    // Micro-struttura atomica nello stesso identico spazio mondo attorno a particles[heroIdx]
    if (microOpacity > 0.01) {
      const hero = particles[heroIdx];
      renderMicroScene(hero.x, hero.y, microOpacity);
    }

    if (simState === STATE.IMPLODING && implodeMerging && implodeMergeAlpha > 0) {
      drawWhiteSeedSphere(cx + (0 - camX) * camZoom, cy + (0 - camY) * camZoom, seedIdleRadius, implodeMergeAlpha, 0);
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
    updatePointerHover(e.clientX, e.clientY);
  });

  window.addEventListener('pointerdown', (e) => {
    if (tuningPanel.contains(e.target)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

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
      if (simState === STATE.IDLE_SEED && pointer.hoverSeed) {
        startBigBangSequence();
      } else if (simState === STATE.MICRO_QUARKS && !tuningPanel.contains(e.target)) {
        transitionToCosmicWeb();
      } else if (simState === STATE.COSMIC_WEB && !tuningPanel.contains(e.target)) {
        enterStarBirthSequence(e.clientX, e.clientY);
      } else if (simState === STATE.STELLAR_FUSION && !tuningPanel.contains(e.target)) {
        beginImplosionToSeed();
      }
    }

    updatePointerHover(e.clientX, e.clientY);
  });

  window.addEventListener('pointercancel', () => {
    pointer.down = false;
  });

  document.addEventListener('mouseleave', () => {
    pointer.down = false;
    pointer.hoverSeed = false;
  });

  btnSeed.addEventListener('click', (e) => {
    if (e.detail === 0) startBigBangSequence();
  });
  btnMicroContinue.addEventListener('click', (e) => {
    if (e.detail === 0) transitionToCosmicWeb();
  });
  btnCosmicNext.addEventListener('click', (e) => {
    if (e.detail === 0) enterStarBirthSequence();
  });
  btnStarNext.addEventListener('click', (e) => {
    if (e.detail === 0) beginImplosionToSeed();
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

    outCount.value = `${CONFIG.particleCount}`;
    outSize.value = `${CONFIG.dotSize.toFixed(1)} px`;

    [ctrlCount, ctrlSize].forEach(syncSliderCSS);
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
    syncParticleCount(false);
  });

  ctrlSize.addEventListener('input', () => {
    CONFIG.dotSize = Number(ctrlSize.value);
    outSize.value = `${CONFIG.dotSize.toFixed(1)} px`;
    syncSliderCSS(ctrlSize);
  });

  ctrlReplay.addEventListener('click', () => {
    simState = STATE.IDLE_SEED;
    stateTime = 0;
    seedCurrentRadius = layoutBounds.seedIdleRadius;
    seedHoverCharge = 0;
    camZoom = 1;
    camX = 0;
    camY = 0;
    cosmic.active = false;
    star.active = false;
    star.blend = 0;
    star.elapsed = 0;
    star.fusionDepth = 0;
    syncHitboxes();
    startBigBangSequence();
  });

  ctrlReset.addEventListener('click', () => {
    Object.assign(CONFIG, DEFAULT_CONFIG);
    syncTuningUI();
    syncParticleCount(false);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateViewportSize();
    }, 90);
  });

  syncTuningUI();
  updateViewportSize();
  startLoop();
})();

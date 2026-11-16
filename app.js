(() => {
  'use strict';

  /**
   * Configurazione centralizzata (premi D per tarare in tempo reale).
   */
  const DEFAULT_CONFIG = {
    particleCount: 3600,
    dotSize: 1.8,
    magnetRadius: 145,
    magnetForce: 1.3,
    growDurationMs: 1400,
  };

  const CONFIG = { ...DEFAULT_CONFIG };

  // Palette: bianchi Big Bang + colori QCD (R,G,B) + atomi primordiali & nebulose
  const PALETTE = [
    [255, 255, 255],  // 0: Bianco puro (Singolarità, Big Bang, Gluoni, nuclei caldi)
    [208, 218, 236],  // 1: Bianco-argento sfumato (Big Bang / Idrogeno freddo)
    [255, 78, 108],   // 2: Quark Rosso (QCD)
    [56, 238, 156],   // 3: Quark Verde (QCD)
    [76, 166, 255],   // 4: Quark Blu / Idrogeno cosmico blu
    [68, 232, 246],   // 5: Elettrone / Idrogeno ciano
    [148, 96, 255],   // 6: Viola cosmico (filamenti rete cosmica)
    [255, 196, 98],   // 7: Elio-4 primordiale / oro caldo
    [238, 86, 178],   // 8: Idrogeno-alfa ionizzato (nodi nebulosa caldi)
  ];

  // Riferimenti DOM
  const stageWrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const btnSeed = document.getElementById('btn-seed');
  const btnMicroContinue = document.getElementById('btn-micro-continue');
  const btnCosmicNext = document.getElementById('btn-cosmic-next');

  const tuningPanel = document.getElementById('tuning-panel');
  const tuningClose = document.getElementById('tuning-close');
  const ctrlCount = document.getElementById('ctrl-count');
  const ctrlSize = document.getElementById('ctrl-size');
  const ctrlMagnetRadius = document.getElementById('ctrl-magnet-radius');
  const ctrlMagnetForce = document.getElementById('ctrl-magnet-force');
  const ctrlReplay = document.getElementById('ctrl-replay');
  const ctrlReset = document.getElementById('ctrl-reset');

  const outCount = document.getElementById('out-count');
  const outSize = document.getElementById('out-size');
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
    COSMIC_WEB: 'COSMIC_WEB',
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

  // Pool finito di particelle / atomi
  let particles = [];

  // Camera & Riquadro bianco
  let camX = 0;
  let camY = 0;
  let camZoom = 1;
  let heroIdx = 0;
  let reticleSize = 116;
  let reticleAlpha = 0;

  // Micro-scena: 3 Quark (R, G, B) + scambio Gluoni + Elettrone
  const micro = {
    time: 0,
    quarks: [],
    gluons: [],
    gluonTimer: 0,
    orbitKickApplied: false,
    electron: { active: false, x: 0, y: 0, angle: 0, radius: 0, targetRadius: 0, trail: [] },
    opacity: 0,
  };

  // Capitolo 2: Rete Cosmica (nodi di materia oscura, filamenti e griglia di autogravità PM)
  const PM_COLS = 48;
  const PM_ROWS = 28;
  const pmDensity = new Float32Array(PM_COLS * PM_ROWS);
  const pmSmooth = new Float32Array(PM_COLS * PM_ROWS);

  const cosmic = {
    elapsed: 0,
    nodes: [],
    filaments: [],
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
    hoverSeed: false,
  };

  // Stato singolarità centrale e fusione in ritorno
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

    if (simState === STATE.IDLE_SEED) {
      seedCurrentRadius = layoutBounds.seedIdleRadius;
      camX = cx;
      camY = cy;
      camZoom = 1;
    }

    syncHitboxes();
  }

  function createParticle(startX, startY) {
    // Composizione cosmologica primordiale: ~75% Idrogeno (1), ~25% Elio-4 (2)
    const isHelium = Math.random() < 0.25;
    return {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      species: isHelium ? 'He' : 'H',
      mass: isHelium ? 1.38 : 1.0,
      baseColorIdx: isHelium ? 7 : Math.random() < 0.45 ? 4 : Math.random() < 0.65 ? 5 : 6,
      colorIdx: Math.random() < 0.68 ? 0 : 1,
      sizeFactor: isHelium ? 0.85 + Math.random() * 0.55 : 0.65 + Math.random() * 0.52,
      alphaBase: 0.45 + Math.random() * 0.52,
      burstDrag: 0.946 + Math.random() * 0.022,
      coreOx: 0,
      coreOy: 0,
      gatherPull: 0.08,
      cosmicX: 0,
      cosmicY: 0,
    };
  }

  function syncParticleCount(recreateAll) {
    const targetCount = CONFIG.particleCount;
    const { cx, cy } = layoutBounds;

    if (recreateAll || particles.length === 0) {
      particles = [];
      for (let i = 0; i < targetCount; i++) {
        particles.push(createParticle(cx, cy));
      }
      return;
    }

    if (particles.length < targetCount) {
      while (particles.length < targetCount) {
        const p = createParticle(
          simState === STATE.COSMIC_WEB ? Math.random() * viewW : cx,
          simState === STATE.COSMIC_WEB ? Math.random() * viewH : cy
        );
        if (simState === STATE.COSMIC_WEB) {
          p.colorIdx = p.baseColorIdx;
        }
        particles.push(p);
      }
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  function syncHitboxes() {
    const { cx, cy, seedIdleRadius } = layoutBounds;

    const seedHitR = Math.max(seedIdleRadius * 2.4, 38);
    btnSeed.style.left = `${cx - seedHitR}px`;
    btnSeed.style.top = `${cy - seedHitR}px`;
    btnSeed.style.width = `${seedHitR * 2}px`;
    btnSeed.style.height = `${seedHitR * 2}px`;

    btnMicroContinue.style.left = '0px';
    btnMicroContinue.style.top = '0px';
    btnMicroContinue.style.width = `${viewW}px`;
    btnMicroContinue.style.height = `${viewH}px`;

    btnCosmicNext.style.left = '0px';
    btnCosmicNext.style.top = '0px';
    btnCosmicNext.style.width = `${viewW}px`;
    btnCosmicNext.style.height = `${viewH}px`;

    btnSeed.hidden = simState !== STATE.IDLE_SEED;
    btnMicroContinue.hidden = simState !== STATE.MICRO_QUARKS;
    btnCosmicNext.hidden = simState !== STATE.COSMIC_WEB;
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

  function triggerWhiteBigBang() {
    simState = STATE.BIG_BANG;
    stateTime = 0;

    const { cx, cy } = layoutBounds;
    const sphereR = seedCurrentRadius;
    const diag = Math.hypot(viewW, viewH);
    const speedScale = prefersReducedMotion ? 0.35 : 1;

    syncParticleCount(true);

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

      p.colorIdx = Math.random() < 0.65 ? 0 : 1;
      p.alphaBase = 0.45 + Math.random() * 0.52;
      p.burstDrag = 0.946 + Math.random() * 0.022;
    }

    syncHitboxes();
  }

  function pickCenterIsolatedParticle() {
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

  function initMicroScene() {
    const { cx, cy } = layoutBounds;
    const minDim = Math.min(viewW, viewH);
    const startR = clamp(minDim * 0.22, 95, 180);

    micro.time = 0;
    micro.gluons = [];
    micro.gluonTimer = 0;
    micro.opacity = 0;
    micro.orbitKickApplied = false;

    const quarkColors = [2, 3, 4];
    const baseAngles = [-Math.PI / 2, Math.PI / 6 + 0.15, (5 * Math.PI) / 6 - 0.15];

    micro.quarks = quarkColors.map((colorIdx, idx) => {
      const a = baseAngles[idx];
      const x = cx + Math.cos(a) * startR;
      const y = cy + Math.sin(a) * startR;

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
   * Prepara il Capitolo 2 (Rete Cosmica):
   * - Popola tutto lo spazio con un'immensità di atomi primordiali (~75% H, ~25% He)
   * - Genera nodi di ammassi gravitazionali collegati da filamenti cosmici
   */
  function initCosmicWebScene() {
    cosmic.elapsed = 0;

    // 8 pozzi gravitazionali (aloni di materia oscura primordiale) distribuiti organicamente
    const anchors = [
      { rx: 0.22, ry: 0.28, mass: 1.15 },
      { rx: 0.48, ry: 0.22, mass: 0.95 },
      { rx: 0.76, ry: 0.27, mass: 1.25 },
      { rx: 0.16, ry: 0.64, mass: 0.9 },
      { rx: 0.43, ry: 0.53, mass: 1.45 }, // grande ammasso principale vicino al centro
      { rx: 0.68, ry: 0.58, mass: 1.1 },
      { rx: 0.31, ry: 0.81, mass: 0.85 },
      { rx: 0.82, ry: 0.78, mass: 1.0 },
    ];

    cosmic.nodes = anchors.map((a, idx) => ({
      id: idx,
      x: (a.rx + (Math.random() - 0.5) * 0.06) * viewW,
      y: (a.ry + (Math.random() - 0.5) * 0.06) * viewH,
      mass: a.mass,
      spin: idx % 2 === 0 ? 1 : -1,
    }));

    // Filamenti cosmici che collegano i nodi vicini formando la rete
    const pairs = [
      [0, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 5],
      [3, 4], [4, 5], [3, 6], [4, 6], [5, 7], [6, 7], [1, 5],
    ];
    cosmic.filaments = pairs.map(([aIdx, bIdx]) => {
      const a = cosmic.nodes[aIdx];
      const b = cosmic.nodes[bIdx];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        lenSq: Math.max(1, dx * dx + dy * dy),
      };
    });

    // Distribuisce gli atomi su tutta la distesa cosmica (leggermente oltre i bordi)
    // mantenendo il nostro atomo protagonista al centro
    const padX = viewW * 0.08;
    const padY = viewH * 0.08;
    const hero = particles[heroIdx];

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (i === heroIdx) {
        p.x = hero.x;
        p.y = hero.y;
      } else {
        p.x = -padX + Math.random() * (viewW + padX * 2);
        p.y = -padY + Math.random() * (viewH + padY * 2);
      }
      // Lievi moti termici primordiali
      const angle = Math.random() * Math.PI * 2;
      const v = 0.08 + Math.random() * 0.28;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.colorIdx = p.baseColorIdx;
      p.alphaBase = 0.48 + Math.random() * 0.48;
    }
  }

  function enterSlowMoReticle() {
    pickCenterIsolatedParticle();
    simState = STATE.SLOW_MO_RETICLE;
    stateTime = 0;
    reticleSize = 116;
    reticleAlpha = 0;
    camX = layoutBounds.cx;
    camY = layoutBounds.cy;
    camZoom = 1;
    initMicroScene();
    syncHitboxes();
  }

  function transitionToCosmicWeb() {
    if (simState !== STATE.MICRO_QUARKS) return;
    simState = STATE.CAMERA_ZOOM_OUT;
    stateTime = 0;
    initCosmicWebScene();
    syncHitboxes();
  }

  function beginImplosionToSeed() {
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

  function updatePointerHover(clientX, clientY) {
    const { cx, cy, seedIdleRadius } = layoutBounds;

    if (simState === STATE.IDLE_SEED) {
      const distSeed = Math.hypot(clientX - cx, clientY - cy);
      pointer.hoverSeed = distSeed <= Math.max(seedIdleRadius * 2.4, 38);
      canvas.style.cursor = pointer.hoverSeed ? 'pointer' : 'default';
      return;
    }

    pointer.hoverSeed = false;
    if (pointer.down) {
      canvas.style.cursor = 'grabbing';
    } else if (simState === STATE.MICRO_QUARKS) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  function updateMicroPhysics(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    micro.time += dtMs;

    const { cx, cy } = layoutBounds;
    const minDim = Math.min(viewW, viewH);
    const quarks = micro.quarks;
    const formDuration = prefersReducedMotion ? 1000 : 1800;

    if (micro.time < formDuration) {
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        q.x = q.homeX + Math.sin(micro.time * 0.004 + i * 2) * 2.2;
        q.y = q.homeY + Math.cos(micro.time * 0.0045 + i * 2) * 2.2;
      }
      return;
    }

    if (!micro.orbitKickApplied) {
      micro.orbitKickApplied = true;
      for (let i = 0; i < 3; i++) {
        const q = quarks[i];
        const tangAngle = q.baseAngle + Math.PI / 2;
        q.vx = Math.cos(tangAngle) * 0.72;
        q.vy = Math.sin(tangAngle) * 0.72;
      }
    }

    const bindElapsed = micro.time - formDuration;
    const bindRamp = easeInOutQuad(clamp(bindElapsed / 4200, 0, 1));
    const eqDist = clamp(minDim * 0.068, 28, 52);
    const springStrength = 0.0014 + bindRamp * 0.0038;

    for (let i = 0; i < 3; i++) {
      const q = quarks[i];

      const dxC = cx - q.x;
      const dyC = cy - q.y;
      q.vx += dxC * (0.0008 + bindRamp * 0.0014) * dt;
      q.vy += dyC * (0.0008 + bindRamp * 0.0014) * dt;

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
          const push = (eqDist - dist) * 0.022 * dt;
          q.vx -= nx * push;
          q.vy -= ny * push;
        }
      }

      q.vx += (-dyC * 0.00085 + (Math.random() - 0.5) * 0.18) * dt;
      q.vy += (dxC * 0.00085 + (Math.random() - 0.5) * 0.18) * dt;

      if (pointer.active && simState === STATE.MICRO_QUARKS) {
        const mdx = q.x - pointer.x;
        const mdy = q.y - pointer.y;
        const mDist = Math.hypot(mdx, mdy);
        if (mDist < CONFIG.magnetRadius && mDist > 1) {
          const f = (1 - mDist / CONFIG.magnetRadius) * 0.45 * CONFIG.magnetForce * dt;
          q.vx += ((pointer.down ? -mdx : mdx) / mDist) * f;
          q.vy += ((pointer.down ? -mdy : mdy) / mDist) * f;
        }
      }

      q.vx *= Math.pow(0.955, dt);
      q.vy *= Math.pow(0.955, dt);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }

    const avgSep =
      (Math.hypot(quarks[0].x - quarks[1].x, quarks[0].y - quarks[1].y) +
        Math.hypot(quarks[1].x - quarks[2].x, quarks[1].y - quarks[2].y) +
        Math.hypot(quarks[2].x - quarks[0].x, quarks[2].y - quarks[0].y)) /
      3;

    const emitInterval = clamp(avgSep * 0.85, 95, 220);
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
        qTo.vx += (dx / len) * 0.18;
        qTo.vy += (dy / len) * 0.18;
        micro.gluons.splice(i, 1);
      }
    }

    const electronTrigger = formDuration + (prefersReducedMotion ? 2600 : 5400);
    if (micro.time > electronTrigger) {
      const el = micro.electron;
      el.active = true;
      el.radius += (el.targetRadius - el.radius) * 0.018 * dt;
      el.angle += 0.022 * dt;
      el.x = cx + Math.cos(el.angle) * el.radius;
      el.y = cy + Math.sin(el.angle) * el.radius * 0.78;

      el.trail.push({ x: el.x, y: el.y, alpha: 0.75 });
      if (el.trail.length > 42) el.trail.shift();
      for (let i = 0; i < el.trail.length; i++) {
        el.trail[i].alpha *= Math.pow(0.95, dt);
      }
    }
  }

  /**
   * Fisica scientifica del Capitolo 2 (Instabilità di Jeans & Rete Cosmica):
   * - Griglia Particle-Mesh (48x28) per autogravità reale locale
   * - Flusso lungo i filamenti cosmici verso i nodi / ammassi rotanti
   * - Segregazione di massa (Elio ~25% leggermente più pesante cade prima nei nuclei)
   * - Riscaldamento cromatico e pressione termica nei nuclei densi delle nebulose
   */
  function updateCosmicWebPhysics(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    cosmic.elapsed += dtMs;

    // La gravità cresce gradualmente dal gas uniforme verso il collasso filamentare
    const gravityRamp = easeInOutQuad(clamp((cosmic.elapsed - 600) / 5500, 0, 1));
    const total = particles.length;
    const cellW = viewW / PM_COLS;
    const cellH = viewH / PM_ROWS;

    // 1. Deposita la massa degli atomi nella griglia Particle-Mesh
    pmDensity.fill(0);
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const gx = Math.floor(p.x / cellW);
      const gy = Math.floor(p.y / cellH);
      if (gx >= 0 && gx < PM_COLS && gy >= 0 && gy < PM_ROWS) {
        pmDensity[gy * PM_COLS + gx] += p.mass;
      }
    }

    // 2. Smooth 3x3 della griglia per ottenere un potenziale gravitazionale continuo
    for (let gy = 0; gy < PM_ROWS; gy++) {
      const row = gy * PM_COLS;
      for (let gx = 0; gx < PM_COLS; gx++) {
        let sum = 0;
        let wSum = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const ny = gy + oy;
          if (ny < 0 || ny >= PM_ROWS) continue;
          const nRow = ny * PM_COLS;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = gx + ox;
            if (nx < 0 || nx >= PM_COLS) continue;
            const w = ox === 0 && oy === 0 ? 4 : ox === 0 || oy === 0 ? 2 : 1;
            sum += pmDensity[nRow + nx] * w;
            wSum += w;
          }
        }
        pmSmooth[row + gx] = sum / wSum;
      }
    }

    const nodes = cosmic.nodes;
    const filaments = cosmic.filaments;
    const nodeCount = nodes.length;
    const filCount = filaments.length;

    const magnetRad = CONFIG.magnetRadius;
    const magnetRadSq = magnetRad * magnetRad;
    const pointerActive = pointer.active && simState === STATE.COSMIC_WEB;
    const isAttracting = pointer.down;
    const magnetForce = CONFIG.magnetForce;

    // 3. Integra gravità dei filamenti, pozzi dei nodi, gradiente PM, rotazione e pressione termica
    for (let i = 0; i < total; i++) {
      const p = particles[i];
      const mass = p.mass;

      // Agitazione termica (più bassa man mano che l'universo si raffredda e collassa)
      const thermal = (0.14 - 0.06 * gravityRamp) * (prefersReducedMotion ? 0.25 : 1);
      p.vx += (Math.random() - 0.5) * thermal * dt;
      p.vy += (Math.random() - 0.5) * thermal * dt;

      if (gravityRamp > 0.001) {
        // a) Attrazione verso il filamento cosmico più vicino
        let bestFilDistSq = Infinity;
        let bestFilDx = 0;
        let bestFilDy = 0;

        for (let f = 0; f < filCount; f++) {
          const fil = filaments[f];
          const abx = fil.bx - fil.ax;
          const aby = fil.by - fil.ay;
          const t = clamp(((p.x - fil.ax) * abx + (p.y - fil.ay) * aby) / fil.lenSq, 0, 1);
          const projX = fil.ax + abx * t;
          const projY = fil.ay + aby * t;
          const dx = projX - p.x;
          const dy = projY - p.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestFilDistSq) {
            bestFilDistSq = dSq;
            bestFilDx = dx;
            bestFilDy = dy;
          }
        }

        const filDist = Math.sqrt(bestFilDistSq) || 1;
        if (filDist > 12 && filDist < 260) {
          const filPull = (1 - filDist / 260) * 0.045 * gravityRamp * mass * dt;
          p.vx += (bestFilDx / filDist) * filPull;
          p.vy += (bestFilDy / filDist) * filPull;
        }

        // b) Attrazione gravitazionale verso i nodi / ammassi + conservazione momento angolare
        let nearestNodeDist = Infinity;
        for (let n = 0; n < nodeCount; n++) {
          const node = nodes[n];
          const dx = node.x - p.x;
          const dy = node.y - p.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          if (dist < nearestNodeDist) nearestNodeDist = dist;

          // Gravità ammorbidita 1 / (r^2 + eps^2)
          const softSq = distSq + 2400;
          const gPull = (node.mass * 240 * gravityRamp * mass * dt) / softSq;
          p.vx += (dx / Math.max(12, dist)) * gPull;
          p.vy += (dy / Math.max(12, dist)) * gPull;

          // Rotazione e pressione termica nel nucleo della nebulosa (impedisce collasso puntiforme)
          if (dist < 130) {
            const coreNorm = 1 - dist / 130;
            const tang = (0.042 * coreNorm * node.mass * gravityRamp * dt) * node.spin;
            const nx = dx / Math.max(8, dist);
            const ny = dy / Math.max(8, dist);
            p.vx += -ny * tang;
            p.vy += nx * tang;

            if (dist < 26) {
              const pressure = (1 - dist / 26) * 0.19 * gravityRamp * dt;
              p.vx -= nx * pressure;
              p.vy -= ny * pressure;
            }
          }
        }

        // c) Autogravità reale dalla griglia Particle-Mesh (gradiente di densità locale)
        const gx = clamp(Math.floor(p.x / cellW), 1, PM_COLS - 2);
        const gy = clamp(Math.floor(p.y / cellH), 1, PM_ROWS - 2);
        const cIdx = gy * PM_COLS + gx;
        const gradX = pmSmooth[cIdx + 1] - pmSmooth[cIdx - 1];
        const gradY = pmSmooth[cIdx + PM_COLS] - pmSmooth[cIdx - PM_COLS];
        const pmPull = 0.0085 * gravityRamp * mass * dt;
        p.vx += gradX * pmPull;
        p.vy += gradY * pmPull;

        // d) Riscaldamento cromatico dei nuclei densi delle nebulose (H-alfa magenta / oro / bianco)
        const localDens = pmSmooth[cIdx];
        if (localDens > 16 || nearestNodeDist < 28) {
          if (p.species === 'H' && Math.random() < 0.08) {
            p.colorIdx = nearestNodeDist < 16 || localDens > 34 ? 0 : 8;
          } else if (p.species === 'He' && Math.random() < 0.08) {
            p.colorIdx = nearestNodeDist < 14 ? 0 : 7;
          }
        } else if (p.colorIdx !== p.baseColorIdx && Math.random() < 0.04) {
          p.colorIdx = p.baseColorIdx;
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
          const smooth = falloff * falloff;
          const nx = mdx / dist;
          const ny = mdy / dist;
          if (isAttracting) {
            const pull = smooth * magnetForce * 1.15 * dt;
            p.vx -= nx * pull + ny * pull * 0.25;
            p.vy -= ny * pull - nx * pull * 0.25;
          } else {
            const push = smooth * magnetForce * 0.9 * dt;
            p.vx += nx * push + pointer.vx * smooth * 0.04;
            p.vy += ny * push + pointer.vy * smooth * 0.04;
          }
        }
      }

      const damp = Math.pow(0.955, dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    pointer.vx *= 0.78;
    pointer.vy *= 0.78;
  }

  function updateSimulation(dtMs) {
    const dt = Math.min(dtMs / 16.6667, 2.2);
    stateTime += dtMs;

    const { cx, cy, seedIdleRadius, seedMaxRadius } = layoutBounds;

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
      camX = cx + (hero.x - cx) * centerEase;
      camY = cy + (hero.y - cy) * centerEase;
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
      const dur = prefersReducedMotion ? 950 : 1600;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      const hero = particles[heroIdx];
      camX = hero.x;
      camY = hero.y;
      camZoom = 1.35 * Math.pow(16.66, eased);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * dt * 0.035;
        p.y += p.vy * dt * 0.035;
      }

      micro.opacity = clamp((camZoom - 4.0) / 10.0, 0, 1);

      if (progress >= 1) {
        simState = STATE.MICRO_QUARKS;
        stateTime = 0;
        micro.opacity = 1;
        syncHitboxes();
      }
      return;
    }

    if (simState === STATE.MICRO_QUARKS) {
      micro.opacity = 1;
      updateMicroPhysics(dtMs);
      return;
    }

    // Zoom-out dal primo atomo di Idrogeno verso l'immensità degli atomi nello spazio (Capitolo 2)
    if (simState === STATE.CAMERA_ZOOM_OUT) {
      const dur = prefersReducedMotion ? 950 : 1650;
      const progress = clamp(stateTime / dur, 0, 1);
      const eased = easeInOutCubic(progress);

      const hero = particles[heroIdx];
      camZoom = 22.5 * Math.pow(1 / 22.5, eased);
      camX = hero.x + (cx - hero.x) * eased;
      camY = hero.y + (cy - hero.y) * eased;
      micro.opacity = clamp(1 - progress * 1.55, 0, 1);
      updateMicroPhysics(dtMs * 0.4);
      updateCosmicWebPhysics(dtMs * 0.45);

      if (progress >= 1) {
        simState = STATE.COSMIC_WEB;
        stateTime = 0;
        camZoom = 1;
        camX = cx;
        camY = cy;
        micro.opacity = 0;
        syncHitboxes();
      }
      return;
    }

    // Capitolo 2 attivo: aggregazione gravitazionale in filamenti, ammassi e nebulose
    if (simState === STATE.COSMIC_WEB) {
      updateCosmicWebPhysics(dtMs);
      return;
    }

    if (simState === STATE.IMPLODING) {
      const total = particles.length;
      const gatherThreshSq = Math.pow(seedIdleRadius * 2.1, 2);
      let gatheredCount = 0;
      const mergeShrink = implodeMerging ? 1 - implodeMergeAlpha * 0.45 : 1;

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const targetX = cx + p.coreOx * mergeShrink;
        const targetY = cy + p.coreOy * mergeShrink;
        const dx = targetX - p.x;
        const dy = targetY - p.y;

        const pull = (implodeMerging ? 0.16 : p.gatherPull) * dt;
        const damp = Math.pow(implodeMerging ? 0.72 : 0.8, dt);
        p.vx = (p.vx + dx * pull) * damp;
        p.vy = (p.vy + dy * pull) * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

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
          seedHoverCharge = 0;
          seedCurrentRadius = seedIdleRadius;
          implodeMerging = false;
          implodeMergeAlpha = 0;
          syncHitboxes();
        }
      }
    }
  }

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

  function renderMicroScene(centerX, centerY, scaleFactor, opacity) {
    if (opacity <= 0.01) return;
    const { cx, cy } = layoutBounds;
    const quarks = micro.quarks;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const tx = (x) => centerX + (x - cx) * scaleFactor;
    const ty = (y) => centerY + (y - cy) * scaleFactor;

    const formDuration = prefersReducedMotion ? 1000 : 1800;
    const formProgress = clamp(micro.time / formDuration, 0, 1);
    const condenseEase = easeOutCubic(formProgress);
    const colorMix = easeInOutQuad(clamp((formProgress - 0.2) / 0.8, 0, 1));

    if (micro.time >= formDuration) {
      const filamentAlpha = clamp((micro.time - formDuration) / 800, 0, 1) * 0.14 * opacity;
      for (let i = 0; i < 3; i++) {
        const qA = quarks[i];
        const qB = quarks[(i + 1) % 3];
        const x1 = tx(qA.x);
        const y1 = ty(qA.y);
        const x2 = tx(qB.x);
        const y2 = ty(qB.y);
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
    for (let i = 0; i < 3; i++) {
      const q = quarks[i];
      const qx = tx(q.x);
      const qy = ty(q.y);

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
        const jx = Math.cos(now + sd.phase) * 2.1;
        const jy = Math.sin(now * 1.2 + sd.phase) * 2.1;
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

    const dotBase = CONFIG.dotSize;
    const total = particles.length;
    const particleMergeFade =
      simState === STATE.IMPLODING && implodeMerging ? Math.max(0, 1 - implodeMergeAlpha * 0.9) : 1;

    const macroFadeDuringMicro =
      simState === STATE.MICRO_QUARKS
        ? 0
        : simState === STATE.CAMERA_ZOOM_IN
          ? clamp(1 - (camZoom - 2.5) / 7.5, 0, 1)
          : simState === STATE.CAMERA_ZOOM_OUT
            ? clamp(1 - (camZoom - 1.5) / 9.0, 0, 1)
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

        const alpha = p.alphaBase * particleMergeFade * macroFadeDuringMicro;
        const radius = dotBase * p.sizeFactor;
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
      if (simState === STATE.IDLE_SEED && pointer.hoverSeed) {
        startBigBangSequence();
      } else if (simState === STATE.MICRO_QUARKS && !tuningPanel.contains(e.target)) {
        transitionToCosmicWeb();
      } else if (simState === STATE.COSMIC_WEB && !tuningPanel.contains(e.target)) {
        beginImplosionToSeed();
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
    pointer.hoverSeed = false;
  });

  btnSeed.addEventListener('click', (e) => {
    if (e.detail === 0) startBigBangSequence();
  });
  btnMicroContinue.addEventListener('click', (e) => {
    if (e.detail === 0) transitionToCosmicWeb();
  });
  btnCosmicNext.addEventListener('click', (e) => {
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
    ctrlMagnetRadius.value = CONFIG.magnetRadius;
    ctrlMagnetForce.value = CONFIG.magnetForce;

    outCount.value = `${CONFIG.particleCount}`;
    outSize.value = `${CONFIG.dotSize.toFixed(1)} px`;
    outMagnetRadius.value = `${CONFIG.magnetRadius} px`;
    outMagnetForce.value = `${CONFIG.magnetForce.toFixed(2)}`;

    [ctrlCount, ctrlSize, ctrlMagnetRadius, ctrlMagnetForce].forEach(syncSliderCSS);
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

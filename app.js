(() => {
  'use strict';

  /**
   * Configurazione centralizzata: modifica questi valori (o premi D nella pagina)
   * per regolare dimensione, numero, morbidezza dei confini e fisica dei pallini.
   */
  const DEFAULT_CONFIG = {
    particleCount: 4800,
    dotSize: 1.45,
    brownianStrength: 0.24,
    edgeSoftness: 2,       // Massima definizione sui bordi: pochissime particelle fluide oltre il confine
    damping: 0.875,
    magnetRadius: 145,
    magnetForce: 1.3,
    growDurationMs: 1450,
  };

  const CONFIG = { ...DEFAULT_CONFIG };

  // Riferimenti DOM
  const stageWrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  const btnSeed = document.getElementById('btn-seed');
  const btnAction = document.getElementById('btn-action');
  const pageHitboxes = document.getElementById('page-hitboxes');
  const thermoSrStatus = document.getElementById('thermo-sr-status');

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
  let lastTimestamp = 0;
  let rafId = null;
  let isPaused = false;

  // Dimensioni logiche viewport
  let viewW = Math.floor(window.innerWidth);
  let viewH = Math.floor(window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Griglie layout e campo di distanza (1..8 = lettere H-Y-D-R-O-G-E-N, 9 = cerchio, 10 = pillola)
  let zoneGrid = new Uint8Array(0);
  let alphaGrid = new Uint8Array(0);

  // Distance field a mezza risoluzione (dfScale = 2) per confini morbidi e gradienti fluidi
  const DF_SCALE = 2;
  let dfW = 0;
  let dfH = 0;
  let dfDist = new Int32Array(0);
  let dfZone = new Uint8Array(0);

  // Zone atomiche (ogni lettera e pulsante gestisce la propria densità e carica +/-)
  let zones = [];
  let totalMaskArea = 0;
  let idealSpacing = 8;

  let layoutBounds = {
    cx: 0,
    cy: 0,
    seedIdleRadius: 15,
    seedMaxRadius: 115,
    circle: { x: 0, y: 0, r: 28 },
  };

  // Vista corrente dopo il Big Bang: 'HERO' -> 'PAGE' (Menu 01..04) -> 'THERMO' | 'LAB'
  let pageView = 'HERO';
  let activePageTab = 'THERMO'; // 'THERMO' | 'SPECTRUM' | 'POLARITY' | 'HORIZON'
  let activeLab = null; // 'SPECTRUM' | 'POLARITY' | 'HORIZON' | null
  let interactiveButtons = [];

  // Serie visibile di Balmer dell'Atomo di Idrogeno (lunghezze d'onda reali nm, soglie quantiche e corde armoniche ASMR)
  const BALMER_LINES = [
    { nm: 410, eV: '3.02EV', shell: '6-2', label: '410', u: 0.082, weight: 0.72, threshold: 0.72, r: 118, g: 56, b: 230, rgb: 'rgb(118, 56, 230)', freq: 293.66 },   // H-delta (Viola)
    { nm: 434, eV: '2.86EV', shell: '5-2', label: '434', u: 0.161, weight: 0.90, threshold: 0.48, r: 42, g: 102, b: 242, rgb: 'rgb(42, 102, 242)', freq: 246.94 },   // H-gamma (Blu)
    { nm: 486, eV: '2.55EV', shell: '4-2', label: '486', u: 0.331, weight: 1.15, threshold: 0.24, r: 12, g: 180, b: 224, rgb: 'rgb(12, 180, 224)', freq: 164.81 },   // H-beta (Ciano)
    { nm: 656, eV: '1.89EV', shell: '3-2', label: '656', u: 0.889, weight: 1.40, threshold: 0.0, r: 226, g: 38, b: 46, rgb: 'rgb(226, 38, 46)', freq: 110.0 },      // H-alpha (Rosso)
  ];

  // Stato dei laboratori 02 SPECTRUM, 03 POLARITY, 04 HORIZON
  const labState = {
    elapsed: 0,
    backBtn: { x: 0, y: 0, r: 26, dots: [] },
    seedBtn: { x: 0, y: 0, r: 26, dots: [] },
    hudDots: [],
    hudLabels: [],
    hudTextKey: '',
    hudLastSwitchMs: 0,
    hudTick: 0,
    hudColorR: 26,
    hudColorG: 26,
    hudColorB: 26,
    targetHudR: 26,
    targetHudG: 26,
    targetHudB: 26,
    specBands: [],      // { x, y0, y1, w, excite, activity, strikeU, strikeSign, lastPluckMs, nm, eV, label, threshold, r, g, b, rgb, freq }
    specEnergy: 1.0,    // Energia di eccitazione atomica (0 -> solo H-alpha 12.1eV, 1 -> piena serie Balmer 13.6eV)
    draggingEnergySlider: false,
    energySlider: { x0: 0, x1: 0, y: 0, knobVisX: 0, dots: [], knobDots: [] },
    activeBandIdx: -1,
    hoverBandIdx: -1,
    specWave: { active: false, x: 0, y: 0, radius: 0, maxRadius: 0, hitMask: 0 },
    polarityMode: 1,    // +1 (attrae - blu / respinge + rosso), -1 (attrae + rosso / respinge - blu), 0 (dipolo neutro)
    horizonR: 28,
  };

  // Stato della Camera Termodinamica (pareti cristallizzate lente & fluide + interfaccia 100% di particelle)
  const WALL_SEGMENTS = 84;
  const thermo = {
    left: 0,
    right: 0,
    bottom: 0,
    minTop: 0,
    maxTop: 0,
    pistonY: 0,
    pistonVy: 0,
    compression: 0, // 0 = volume max, 1 = compressa
    targetTemp: 0.34, // 0 = gelo blu (~20K), 0.34 = ambiente (~293K), 1 = calda rossa (~1200K)
    measuredTemp: 0.34,
    pressureAtm: 1.0,
    draggingTempSlider: false,
    draggingCompSlider: false,
    elapsed: 0,
    wallTotal: 0,
    wallLockedCount: 0,
    gasCount: 0,
    wallBins: [
      new Uint8Array(WALL_SEGMENTS),
      new Uint8Array(WALL_SEGMENTS),
      new Uint8Array(WALL_SEGMENTS),
      new Uint8Array(WALL_SEGMENTS),
    ],
    tempSlider: { x0: 0, x1: 0, y: 0, knobVisX: 0, dots: [], knobDots: [] },
    compSlider: { x0: 0, x1: 0, y: 0, knobVisX: 0, dots: [], knobDots: [] },
    backBtn: { x: 0, y: 0, r: 26, dots: [] },
    seedBtn: { x: 0, y: 0, r: 26, dots: [] },
    hudDots: [],
    hudTextKey: '',
    hudLastSwitchMs: 0,
    hudTick: 0,
    lastClinkAt: 0,
  };

  // Micro-font 5x7 a matrice di particelle per telemetria ultra-nitida su canvas
  const DOT_GLYPHS = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    '%': ['11001', '11010', '00100', '00100', '01011', '10011', '00000'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  };

  // Pool finito di particelle anonime e libere di migrare tra zone
  let particles = [];

  // Spatial Hash Grid per repulsione locale tra pallini (densità uniforme interna)
  let shCellSize = 12;
  let shCols = 0;
  let shRows = 0;
  let shHead = new Int32Array(0);
  let shNext = new Int32Array(0);

  // Cache colori scala di grigi (zero allocazioni nel loop di rendering)
  const GRAY_STYLES = Array.from({ length: 256 }, (_, i) => `rgb(${i}, ${i}, ${i})`);

  // Tabella termica 256 colori per la Camera Termodinamica: Blu freddo (0) -> Grafite (92) -> Ambra -> Rosso caldo (255)
  const THERMO_STYLES = Array.from({ length: 256 }, (_, i) => {
    const t = i / 255;
    let r, g, b;
    if (t < 0.36) {
      const u = t / 0.36;
      r = Math.round(24 + u * (42 - 24));
      g = Math.round(98 + u * (46 - 98));
      b = Math.round(230 + u * (54 - 230));
    } else if (t < 0.68) {
      const u = (t - 0.36) / 0.32;
      r = Math.round(42 + u * (232 - 42));
      g = Math.round(46 + u * (102 - 46));
      b = Math.round(54 + u * (28 - 54));
    } else {
      const u = (t - 0.68) / 0.32;
      r = Math.round(232 + u * (216 - 232));
      g = Math.round(102 + u * (26 - 102));
      b = Math.round(28 + u * (26 - 28));
    }
    return `rgb(${r}, ${g}, ${b})`;
  });

  // Tabella Redshift Relativistico per 04 HORIZON: Bianco-Azzurro lontano (0) -> Oro/Ambra -> Rosso profondo (255) vicino all'orizzonte
  const REDSHIFT_STYLES = Array.from({ length: 256 }, (_, i) => {
    const t = i / 255;
    let r, g, b;
    if (t < 0.45) {
      const u = t / 0.45;
      r = Math.round(118 + u * (175 - 118));
      g = Math.round(174 + u * (188 - 174));
      b = Math.round(246 + u * (210 - 246));
    } else if (t < 0.78) {
      const u = (t - 0.45) / 0.33;
      r = Math.round(175 + u * (236 - 175));
      g = Math.round(188 + u * (124 - 188));
      b = Math.round(210 + u * (34 - 210));
    } else {
      const u = (t - 0.78) / 0.22;
      r = Math.round(236 + u * (214 - 236));
      g = Math.round(124 + u * (24 - 124));
      b = Math.round(34 + u * (28 - 34));
    }
    return `rgb(${r}, ${g}, ${b})`;
  });

  // Sprite volumetrici monocromatici pre-renderizzati per l'alone 3D durante l'esplosione Big Bang
  const INK_SPRITE_SIZE = 64;
  const INK_GRAYS = [10, 32, 58, 86, 114, 142, 168, 194];
  const INK_SPRITES = INK_GRAYS.map((g) => {
    const sc = document.createElement('canvas');
    sc.width = INK_SPRITE_SIZE;
    sc.height = INK_SPRITE_SIZE;
    const sctx = sc.getContext('2d');
    const half = INK_SPRITE_SIZE / 2;

    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, `rgba(${g}, ${g}, ${g}, 0.98)`);
    grad.addColorStop(0.22, `rgba(${g}, ${g}, ${g}, 0.85)`);
    grad.addColorStop(0.48, `rgba(${g}, ${g}, ${g}, 0.24)`);
    grad.addColorStop(0.76, `rgba(${g}, ${g}, ${g}, 0.06)`);
    grad.addColorStop(1.0, `rgba(${g}, ${g}, ${g}, 0)`);

    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, INK_SPRITE_SIZE, INK_SPRITE_SIZE);
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
    hoverGroup: 0, // 0, 2 (circle), 3 (pill), 99 (seed)
  };

  // Stato animazione seed centrale e fusione in ritorno
  let seedHoverCharge = 0;
  let seedCurrentRadius = 15;
  let seedStartRadius = 15;
  let implodeMerging = false;
  let implodeMergeTime = 0;
  let implodeMergeAlpha = 0;
  let autoReplayAfterImplode = false;

  // Parola dinamica formata dalle particelle (modificabile digitando da tastiera)
  let displayWord = 'HYDROGEN';
  let customWordActive = false;
  let baseHydrogenArea = 0;
  let effectiveParticleCount = CONFIG.particleCount;

  // Canvas offscreen riusabile per maschere veloci senza riallocazioni ad ogni tasto
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

  // Camera 3D leggera (inclinazione fluida col mouse + respiro volumetrico)
  let camYaw = 0;
  let camPitch = 0;
  let drawOrder = new Int32Array(0);
  let drawDepth = new Float32Array(0);

  // Onda d'urto radiale progressiva (sparpaglia i pallini prima di ricomporre la nuova vista)
  let pulseWaveSeq = 0;
  let pulseWave = {
    id: 0,
    active: false,
    x: 0,
    y: 0,
    prevRadius: 0,
    radius: 0,
    maxRadius: 0,
    power: 0,
    morphScatter: false,
  };

  // Buco nero orbitale 3D al click lungo + esplosione forte al rilascio
  const blackHole = {
    active: false,
    x: 0,
    y: 0,
    charge: 0,
    elapsed: 0,
    nx: 0.28,
    ny: -0.58,
    nz: 0.765,
  };

  // Scia d'urto cinetica ("vento / fendente") su movimenti rapidi del mouse
  const slashTrails = [];

  // Sound design cinematografico "Interstellar / ASMR" via Web Audio API:
  // Riverbero cattedrale cosmico procedurale, armonie d'organo/cristallo (Am(add9) / Fmaj7#11),
  // battimenti binaurali lenti e risonatori d'aria vellutata (zero percussioni secche o frequenze aspre).
  const audio = {
    ctx: null,
    dryBus: null,
    wetBus: null,
    noiseBuf: null,
    growOscs: [],
    growFilter: null,
    growGain: null,
    idleGain: null,
    idleOscs: [],
    bhOscs: [],
    bhGain: null,
    lastSlashAt: 0,
    noteStep: 0,
  };

  function ensureAudio() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
      }
      return audio.ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const actx = new AudioCtx();

      // Master chain morbida e controllata (ASMR level, mai intrusiva)
      const master = actx.createGain();
      master.gain.value = 0.56;

      // Filtro low-pass globale di velluto: elimina qualsiasi asprezza sopra i 2200 Hz
      const masterWarmth = actx.createBiquadFilter();
      masterWarmth.type = 'lowpass';
      masterWarmth.frequency.value = 2100;
      masterWarmth.Q.value = 0.5;

      const dryBus = actx.createGain();
      dryBus.gain.value = 0.52;

      const wetBus = actx.createGain();
      wetBus.gain.value = 0.68;

      // ConvolverNode: risposta all'impulso stereo "Cosmic Cathedral" (3.6s, pre-swell 180ms, smorzata < 1500 Hz)
      const irLen = Math.floor(actx.sampleRate * 3.6);
      const irBuf = actx.createBuffer(2, irLen, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const chData = irBuf.getChannelData(ch);
        let lp1 = 0;
        let lp2 = 0;
        for (let i = 0; i < irLen; i++) {
          const t = i / actx.sampleRate;
          const swell = Math.min(1.0, t / 0.18);
          const decay = Math.exp(-t / 1.15);
          const w = Math.random() * 2 - 1;
          lp1 += 0.12 * (w - lp1);
          lp2 += 0.12 * (lp1 - lp2);
          chData[i] = lp2 * swell * decay * 0.16;
        }
      }
      const convolver = actx.createConvolver();
      convolver.buffer = irBuf;

      dryBus.connect(masterWarmth);
      wetBus.connect(convolver);
      convolver.connect(masterWarmth);
      masterWarmth.connect(master);
      master.connect(actx.destination);

      // Buffer di aria rosa vellutata (Paul Kellet pink noise, ultra-levigato)
      const len = Math.floor(actx.sampleRate * 3.0);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, smooth = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.035;
        b6 = w * 0.115926;
        smooth += 0.18 * (pink - smooth);
        data[i] = smooth;
      }

      audio.ctx = actx;
      audio.dryBus = dryBus;
      audio.wetBus = wetBus;
      audio.noiseBuf = buf;
      return actx;
    } catch {
      return null;
    }
  }

  function startIdleHarmonic() {
    const actx = ensureAudio();
    if (!actx || audio.idleGain) return;
    const now = actx.currentTime;
    const masterIdle = actx.createGain();
    masterIdle.gain.setValueAtTime(0.0001, now);
    masterIdle.gain.linearRampToValueAtTime(0.042, now + 1.8);
    masterIdle.connect(audio.dryBus);
    masterIdle.connect(audio.wetBus);

    // Accordo sospeso stile Interstellar (Am(add9): A1 55Hz, E2 82.41Hz, A2 110Hz, B2 123.47Hz, E3 164.81Hz)
    // con micro-battimento binaurale (+0.18 Hz) per effetto mistico profondo e rilassante
    const voices = [
      { f: 55.0, w: 0.34, pan: -0.15 },
      { f: 82.41, w: 0.24, pan: 0.2 },
      { f: 110.0, w: 0.19, pan: -0.25 },
      { f: 110.18, w: 0.16, pan: 0.25 },
      { f: 123.47, w: 0.08, pan: -0.3 },
      { f: 164.81, w: 0.06, pan: 0.3 },
    ];
    const oscs = [];
    for (let i = 0; i < voices.length; i++) {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(voices[i].f, now);
      g.gain.setValueAtTime(voices[i].w, now);
      osc.connect(g);
      if (actx.createStereoPanner) {
        const panner = actx.createStereoPanner();
        panner.pan.setValueAtTime(voices[i].pan, now);
        g.connect(panner);
        panner.connect(masterIdle);
      } else {
        g.connect(masterIdle);
      }
      osc.start(now);
      oscs.push(osc);
    }

    audio.idleGain = masterIdle;
    audio.idleOscs = oscs;
  }

  function updateIdleHarmonic(breathNorm) {
    if (!audio.ctx) return;
    if (audio.ctx.state === 'running' && !audio.idleGain) {
      startIdleHarmonic();
    }
    if (!audio.idleGain) return;
    const now = audio.ctx.currentTime;
    audio.idleGain.gain.setTargetAtTime(0.036 + breathNorm * 0.014, now, 0.25);
  }

  function stopIdleHarmonic() {
    if (!audio.ctx || !audio.idleGain) return;
    const now = actxTimeSafe();
    try {
      audio.idleGain.gain.cancelScheduledValues(now);
      audio.idleGain.gain.setTargetAtTime(0.0001, now, 0.22);
      const oscs = audio.idleOscs;
      setTimeout(() => {
        for (let i = 0; i < oscs.length; i++) {
          try { oscs[i].stop(); } catch {}
        }
      }, 900);
    } catch {}
    audio.idleGain = null;
    audio.idleOscs = [];
  }

  function actxTimeSafe() {
    return audio.ctx ? audio.ctx.currentTime : 0;
  }

  // Converte una coordinata X sullo schermo in panning stereo binaurale (-0.92 sinistra .. +0.92 destra)
  function screenToPan(x) {
    if (typeof x !== 'number' || !Number.isFinite(x) || viewW <= 0) return 0;
    return clamp((x - viewW * 0.5) / (viewW * 0.44), -0.92, 0.92);
  }

  // Converte una coordinata Y sullo schermo in apertura timbrica (1.0 in alto = più cristallino, 0.0 in basso = più profondo)
  function screenToElevation(y) {
    if (typeof y !== 'number' || !Number.isFinite(y) || viewH <= 0) return 0.5;
    return clamp(1 - y / viewH, 0, 1);
  }

  // Collega un nodo audio ai bus dry/wet passando per uno StereoPannerNode (con traiettoria opzionale panStart -> panEnd)
  function connectSpatialBus(actx, sourceNode, panStart = 0, panEnd = null, rampDuration = 0) {
    if (actx.createStereoPanner) {
      const panner = actx.createStereoPanner();
      const now = actx.currentTime;
      const p0 = clamp(panStart, -0.95, 0.95);
      panner.pan.setValueAtTime(p0, now);
      if (typeof panEnd === 'number' && rampDuration > 0) {
        panner.pan.linearRampToValueAtTime(clamp(panEnd, -0.95, 0.95), now + rampDuration);
      }
      sourceNode.connect(panner);
      panner.connect(audio.dryBus);
      panner.connect(audio.wetBus);
      return panner;
    }
    sourceNode.connect(audio.dryBus);
    sourceNode.connect(audio.wetBus);
    return null;
  }

  function startGrowDrone() {
    const actx = ensureAudio();
    if (!actx) return;
    stopGrowDrone();
    const now = actx.currentTime;

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.35);

    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220, now);
    lp.Q.value = 0.7;

    gain.connect(lp);
    lp.connect(audio.dryBus);
    lp.connect(audio.wetBus);

    // Crescendo d'organo cosmico (senza sweep da sirena: le voci armoniche emergono gradualmente)
    const freqs = [
      { f: 55.0, w: 0.34 },
      { f: 82.41, w: 0.26 },
      { f: 110.0, w: 0.20 },
      { f: 123.47, w: 0.11 },
      { f: 164.81, w: 0.09 },
    ];
    const oscs = [];
    for (let i = 0; i < freqs.length; i++) {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i].f, now);
      g.gain.setValueAtTime(freqs[i].w, now);
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      oscs.push(osc);
    }

    audio.growOscs = oscs;
    audio.growFilter = lp;
    audio.growGain = gain;
  }

  function updateGrowDrone(progress) {
    if (!audio.ctx || !audio.growGain) return;
    const now = audio.ctx.currentTime;
    const u = progress * progress;
    // Apertura armonica di velluto (come i registri di un organo che si aprono lentamente)
    if (audio.growFilter) {
      audio.growFilter.frequency.setTargetAtTime(220 + u * 520, now, 0.08);
    }
    audio.growGain.gain.setTargetAtTime(0.05 + u * 0.09, now, 0.08);
    for (let i = 0; i < audio.growOscs.length; i++) {
      const baseF = [55.0, 82.41, 110.0, 123.47, 164.81][i] || 110;
      audio.growOscs[i].frequency.setTargetAtTime(baseF * (1 + u * 0.015), now, 0.08);
    }
  }

  function stopGrowDrone() {
    if (!audio.ctx || !audio.growGain) return;
    const now = audio.ctx.currentTime;
    try {
      audio.growGain.gain.cancelScheduledValues(now);
      audio.growGain.gain.setTargetAtTime(0.0001, now, 0.14);
      const oscs = audio.growOscs;
      setTimeout(() => {
        for (let i = 0; i < oscs.length; i++) {
          try { oscs[i].stop(); } catch {}
        }
      }, 500);
    } catch {}
    audio.growOscs = [];
    audio.growFilter = null;
    audio.growGain = null;
  }

  function playBigBangBoom(powerScale = 1, originX = null, originY = null) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    const scale = clamp(powerScale, 0.5, 1.15);
    const centerPan = originX !== null ? screenToPan(originX) : 0;
    const elev = originY !== null ? screenToElevation(originY) : 0.5;

    // Nessun "boom" percussivo: apertura solenne e mistica di un accordo Fmaj7#11 / Am9 nello spazio profondo
    const bloomGain = actx.createGain();
    bloomGain.gain.setValueAtTime(0.0001, now);
    bloomGain.gain.linearRampToValueAtTime(0.14 * scale, now + 0.16);
    bloomGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    bloomGain.connect(audio.dryBus);
    bloomGain.connect(audio.wetBus);

    const chord = [
      { f: 43.65, w: 0.30, pan: 0.0 },   // F1 profondo e morbido
      { f: 65.41, w: 0.22, pan: -0.2 },  // C2
      { f: 82.41, w: 0.18, pan: 0.2 },   // E2
      { f: 110.0, w: 0.14, pan: -0.35 }, // A2
      { f: 123.47, w: 0.09, pan: 0.35 }, // B2 (#11)
      { f: 164.81, w: 0.07, pan: 0.0 },  // E3
    ];
    for (let i = 0; i < chord.length; i++) {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(chord[i].f * 1.008, now);
      osc.frequency.exponentialRampToValueAtTime(chord[i].f, now + 2.4);
      g.gain.setValueAtTime(chord[i].w, now);
      osc.connect(g);
      if (actx.createStereoPanner) {
        const panner = actx.createStereoPanner();
        const voicePan = clamp(centerPan * 0.65 + chord[i].pan * 0.6, -0.95, 0.95);
        panner.pan.setValueAtTime(voicePan, now);
        panner.pan.linearRampToValueAtTime(clamp(chord[i].pan, -0.95, 0.95), now + 2.6);
        g.connect(panner);
        panner.connect(bloomGain);
      } else {
        g.connect(bloomGain);
      }
      osc.start(now);
      osc.stop(now + 3.5);
    }

    // Respiro cosmico sub-basso (< 240 Hz) come onda gravitazionale di velluto
    if (audio.noiseBuf) {
      const src = actx.createBufferSource();
      src.buffer = audio.noiseBuf;
      const filter = actx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(190 + elev * 100, now);
      filter.frequency.exponentialRampToValueAtTime(75, now + 2.2);
      const nGain = actx.createGain();
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(0.11 * scale, now + 0.18);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      src.connect(filter);
      filter.connect(nGain);
      connectSpatialBus(actx, nGain, centerPan, 0, 2.2);
      src.start(now);
      src.stop(now + 2.5);
    }
  }

  function playSlashWind(power, x1, y1, x2, y2) {
    const actx = audio.ctx;
    if (!actx || !audio.noiseBuf) return;
    const nowMs = performance.now();
    if (nowMs - audio.lastSlashAt < 120) return;
    audio.lastSlashAt = nowMs;

    const now = actx.currentTime;
    const dur = 0.95;
    const src = actx.createBufferSource();
    src.buffer = audio.noiseBuf;

    // Vento armonico ASMR 3D: l'aria eccita risonatori accordati sulle note di Am(add9)
    // e viaggia nello spazio stereo lungo la traiettoria reale (x1 -> x2) del fendente
    const scaleNotes = [220.0, 246.94, 329.63, 440.0, 493.88];
    const idx = audio.noteStep % scaleNotes.length;
    audio.noteStep++;
    const f1 = scaleNotes[idx];
    const f2 = scaleNotes[(idx + 2) % scaleNotes.length] * 0.5;

    const elev = screenToElevation(typeof y2 === 'number' ? (y1 + y2) * 0.5 : viewH * 0.5);

    const res1 = actx.createBiquadFilter();
    res1.type = 'bandpass';
    res1.Q.value = 11.0;
    res1.frequency.setValueAtTime(f1, now);

    const res2 = actx.createBiquadFilter();
    res2.type = 'bandpass';
    res2.Q.value = 8.0;
    res2.frequency.setValueAtTime(f2, now);

    const velvetLp = actx.createBiquadFilter();
    velvetLp.type = 'lowpass';
    velvetLp.frequency.setValueAtTime(580 + elev * 380, now);

    const env = actx.createGain();
    const peak = clamp(0.095 * power, 0.035, 0.13);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.26);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(res1);
    src.connect(res2);
    res1.connect(velvetLp);
    res2.connect(velvetLp);
    velvetLp.connect(env);

    const panStart = screenToPan(typeof x1 === 'number' ? x1 : pointer.x);
    const panEnd = screenToPan(typeof x2 === 'number' ? x2 : pointer.x);
    connectSpatialBus(actx, env, panStart, panEnd, dur * 0.75);
    src.start(now, Math.random() * 1.5, dur + 0.05);
  }

  function updateBlackHoleAudio(charge, bx, by) {
    const actx = audio.ctx;
    if (!actx) return;
    const now = actx.currentTime;
    if (charge > 0.04) {
      if (!audio.bhGain) {
        const gain = actx.createGain();
        gain.gain.setValueAtTime(0.0001, now);

        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(340, now);
        gain.connect(lp);

        const panner = connectSpatialBus(actx, lp, screenToPan(bx));

        // Coro gravitazionale profondo (quinta giusta + nona sospesa: 55 Hz, 82.41 Hz, 123.47 Hz)
        const baseFreqs = [
          { f: 55.0, w: 0.48 },
          { f: 82.41, w: 0.34 },
          { f: 123.47, w: 0.18 },
        ];
        const oscs = [];
        for (let i = 0; i < baseFreqs.length; i++) {
          const osc = actx.createOscillator();
          const g = actx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(baseFreqs[i].f, now);
          g.gain.setValueAtTime(baseFreqs[i].w, now);
          osc.connect(g);
          g.connect(gain);
          osc.start(now);
          oscs.push({ osc, base: baseFreqs[i].f });
        }
        audio.bhOscs = oscs;
        audio.bhGain = gain;
        audio.bhFilter = lp;
        audio.bhPanner = panner;
      }
      // Lieve dilatazione temporale/armonica + panning stereo 3D in tempo reale col cursore
      const elev = screenToElevation(by);
      for (let i = 0; i < audio.bhOscs.length; i++) {
        const item = audio.bhOscs[i];
        item.osc.frequency.setTargetAtTime(item.base * (1 + charge * 0.12), now, 0.12);
      }
      if (audio.bhFilter) {
        audio.bhFilter.frequency.setTargetAtTime(220 + elev * 320 + charge * 180, now, 0.08);
      }
      if (audio.bhPanner) {
        audio.bhPanner.pan.setTargetAtTime(screenToPan(bx), now, 0.06);
      }
      audio.bhGain.gain.setTargetAtTime(charge * 0.085, now, 0.1);
    } else if (audio.bhGain) {
      try {
        audio.bhGain.gain.setTargetAtTime(0.0001, now, 0.15);
        const oscs = audio.bhOscs;
        setTimeout(() => {
          for (let i = 0; i < oscs.length; i++) {
            try { oscs[i].osc.stop(); } catch {}
          }
        }, 600);
      } catch {}
      audio.bhOscs = [];
      audio.bhGain = null;
      audio.bhFilter = null;
      audio.bhPanner = null;
    }
  }

  function playImplodeSuction(originX) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;

    // Inspiro armonico rovesciato che parte dal pulsante Cerchio (a sinistra) e converge al centro (0.0)
    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.58);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    connectSpatialBus(actx, gain, screenToPan(originX), 0.0, 0.72);

    const freqs = [164.81, 123.47, 110.0, 55.0];
    for (let i = 0; i < freqs.length; i++) {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i] * 1.02, now);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.98, now + 0.75);
      g.gain.setValueAtTime(0.25, now);
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      osc.stop(now + 0.88);
    }
  }

  function playBouncePop() {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    // Goccia armonica calda centrata (0.0) in La2 + Mi3 quando la sfera rimbalza al centro
    const notes = [
      { f: 110.0, w: 0.65, pan: -0.08 },
      { f: 164.81, w: 0.35, pan: 0.08 },
    ];
    for (let i = 0; i < notes.length; i++) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i].f, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.055 * notes[i].w, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      osc.connect(gain);
      connectSpatialBus(actx, gain, notes[i].pan);
      osc.start(now);
      osc.stop(now + 1.0);
    }
  }

  function playPulseSweep(originX) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    const startPan = screenToPan(originX);
    // Onda armonica dolce che parte dal pulsante Pillola (a destra) e attraversa lo spazio stereo verso sinistra
    const freqs = [110.0, 146.83, 220.0];
    for (let i = 0; i < freqs.length; i++) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.028, now + 0.08 + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      osc.connect(gain);
      connectSpatialBus(actx, gain, startPan, -startPan * 0.75, 1.25);
      osc.start(now);
      osc.stop(now + 1.45);
    }
  }

  function playTypeTick(panPos = 0) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    // Micro-goccia armonica felpata intonata sulla scala di Interstellar (Am9) e posizionata in stereo sulla lettera digitata
    const palette = [220.0, 246.94, 261.63, 329.63, 392.0];
    const freq = palette[audio.noteStep % palette.length];
    audio.noteStep++;

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.026, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain);
    connectSpatialBus(actx, gain, panPos);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  function playThermoClink(panPos = 0, heatNorm = 0.35) {
    const actx = audio.ctx;
    if (!actx || actx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - thermo.lastClinkAt < 75) return;
    thermo.lastClinkAt = nowMs;

    const now = actx.currentTime;
    const coldPalette = [164.81, 196.0, 220.0, 246.94];
    const hotPalette = [329.63, 392.0, 440.0, 493.88, 523.25];
    const bank = heatNorm > 0.52 ? hotPalette : coldPalette;
    const freq = bank[audio.noteStep % bank.length];
    audio.noteStep++;

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.011 + heatNorm * 0.012, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(gain);
    connectSpatialBus(actx, gain, panPos);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  function playSpectrumString(freq, xPos, strikeU = 0.5, velocity = 0.85) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    const pan = screenToPan(xPos);
    const velGain = clamp(velocity, 0.3, 1.15);
    const edgeBrightness = 0.45 + 0.55 * Math.abs(strikeU - 0.5) * 2;
    // Corda armonica ASMR stile arpa di cristallo/organo modulata sul punto di pizzico
    const partials = [
      { f: freq, w: 0.032 * velGain, dur: 2.5, type: 'sine' },
      { f: freq * 2.0, w: (0.011 + 0.008 * edgeBrightness) * velGain, dur: 1.75, type: 'sine' },
      { f: freq * 3.0, w: 0.0055 * edgeBrightness * velGain, dur: 1.2, type: 'triangle' },
    ];
    for (let i = 0; i < partials.length; i++) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = partials[i].type;
      osc.frequency.setValueAtTime(partials[i].f, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(partials[i].w, now + 0.038 + i * 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + partials[i].dur);
      osc.connect(gain);
      connectSpatialBus(actx, gain, pan);
      osc.start(now);
      osc.stop(now + partials[i].dur + 0.06);
    }

    // Soffio cristallino ASMR al tocco della corda
    if (audio.noiseBuf) {
      const src = actx.createBufferSource();
      src.buffer = audio.noiseBuf;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(clamp(freq * 4, 420, 2600), now);
      bp.Q.setValueAtTime(4.2, now);
      const ng = actx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.011 * velGain, now + 0.025);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      src.connect(bp);
      bp.connect(ng);
      connectSpatialBus(actx, ng, pan);
      src.start(now, Math.random() * 1.4, 0.34);
    }
  }

  function playPolarityChime(sign, xPos) {
    const actx = ensureAudio();
    if (!actx) return;
    const now = actx.currentTime;
    const f = sign > 0 ? 329.63 : sign < 0 ? 164.81 : 220.0;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.022, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    osc.connect(gain);
    connectSpatialBus(actx, gain, screenToPan(xPos));
    osc.start(now);
    osc.stop(now + 0.78);
  }

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

  /**
   * Calcola le quote bersaglio di ciascuna zona in base alla sua area:
   * ogni lettera e pulsante ottiene esattamente la stessa densità di pallini.
   */
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

  /**
   * Restituisce un punto interno casuale nella zona z.
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

  /**
   * Sincronizza le aree cliccabili trasparenti per tastiera e screen reader.
   */
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

  // --- Laboratori 02 SPECTRUM, 03 POLARITY, 04 HORIZON (con conservazione particelle e audio ASMR) ---
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

      if (activeLab === 'SPECTRUM') {
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
      } else {
        labState.hudLabels = [];
        labState.energySlider.dots = [];
        labState.energySlider.knobDots = [];
        const label = activeLab === 'POLARITY' ? 'POLARITY' : 'HORIZON';
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
          rgb: '#222222',
        }));
      }
    } else {
      labState.backBtn.x = padX + 20;
      labState.backBtn.y = padY + 14;
      labState.seedBtn.x = viewW - padX - 20;
      labState.seedBtn.y = padY + 14;
      if (activeLab === 'SPECTRUM') {
        labState.energySlider.x0 = esX0;
        labState.energySlider.x1 = esX1;
        labState.energySlider.y = esY;
        updateSpectrumHudTargets(false);
      }
    }
  }

  function enterPhysicsLab(tab, originX, originY) {
    if (simState !== STATE.SETTLED && simState !== STATE.EXPLODING) return;
    pageView = 'LAB';
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
    labState.hudTextKey = '';
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

    // Preleva le particelle dell'UI (pulsanti angoli, slider, etichette & telemetria) dal pool reale
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

    if (tab === 'SPECTRUM') {
      // Distribuisce le particelle proporzionalmente alle intensità reali di Balmer (dal posto orizzontalmente più vicino)
      const weightSum = labState.specBands.reduce((acc, b) => acc + b.weight, 0);
      const quotas = [];
      let sumQ = 0;
      for (let b = 0; b < labState.specBands.length; b++) {
        const q = Math.round((labState.specBands[b].weight / weightSum) * total);
        quotas.push(q);
        sumQ += q;
      }
      quotas[quotas.length - 1] += total - sumQ;

      // Ordina per posizione X con leggero jitter per far confluire le particelle più vicine in ogni banda
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
    } else if (tab === 'POLARITY') {
      for (let i = 0; i < total; i++) {
        const p = particles[i];
        p.chargeSign = i % 2 === 0 ? 1 : -1;
        p.z = (Math.random() - 0.5) * 20;
        p.vz = 0;
        p.colorWarmup = 0;
        const a = Math.atan2(p.y - cy, p.x - cx) + p.chargeSign * 0.5;
        p.vx += Math.cos(a) * 1.6;
        p.vy += Math.sin(a) * 1.6;
      }
    } else if (tab === 'HORIZON') {
      const rMin = labState.horizonR * 1.35;
      const rMax = Math.max(rMin + 120, minDim * 0.44);
      for (let i = 0; i < total; i++) {
        const p = particles[i];
        p.hzOrbitR = rMin + Math.pow(Math.random(), 0.72) * (rMax - rMin);
        p.hzAngle = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 0.25;
        p.hzIncl = (Math.random() - 0.5) * 0.42;
        p.hzJet = 0;
        p.colorWarmup = 0;
      }
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

  function updateLabSimulation(dt, dtMs) {
    labState.elapsed += dtMs;
    const total = particles.length;
    const cx = viewW * 0.5;
    const cy = viewH * 0.5;

    stepCornerDots(labState.backBtn, pointer.hoverGroup === 20, dt);
    stepCornerDots(labState.seedBtn, pointer.hoverGroup === 21, dt);

    if (activeLab === 'SPECTRUM') {
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
    } else if (activeLab === 'POLARITY') {
      labState.hudDots.forEach((d) => stepSoftParticleToTarget(d, d.hx, d.hy, 0.06, dt));
      // Interazioni elettriche/magnetiche + (rosso) e - (blu) via Spatial Hash
      const cell = 38;
      const cols = Math.ceil(viewW / cell) + 2;
      const rows = Math.ceil(viewH / cell) + 2;
      const needH = cols * rows;
      if (shHead.length < needH) shHead = new Int32Array(needH);
      if (shNext.length < total) shNext = new Int32Array(total);
      shHead.fill(-1, 0, needH);

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        if (p.colorWarmup < 1) p.colorWarmup = Math.min(1, p.colorWarmup + 0.022 * dt);
        if (p.x >= -cell && p.x < viewW + cell && p.y >= -cell && p.y < viewH + cell) {
          const cxC = clamp(Math.floor(p.x / cell) + 1, 0, cols - 1);
          const cyC = clamp(Math.floor(p.y / cell) + 1, 0, rows - 1);
          const idx = cyC * cols + cxC;
          shNext[i] = shHead[idx];
          shHead[idx] = i;
        }
      }

      const damp = Math.pow(0.92, dt);
      const pad = 26;
      for (let i = 0; i < total; i++) {
        const p = particles[i];
        let fx = (cx - p.x) * 0.00045;
        let fy = (cy - p.y) * 0.00045;

        const cxC = clamp(Math.floor(p.x / cell) + 1, 0, cols - 1);
        const cyC = clamp(Math.floor(p.y / cell) + 1, 0, rows - 1);
        let checks = 0;
        for (let oy = -1; oy <= 1 && checks < 20; oy++) {
          const nyC = cyC + oy;
          if (nyC < 0 || nyC >= rows) continue;
          const rowB = nyC * cols;
          for (let ox = -1; ox <= 1 && checks < 20; ox++) {
            const nxC = cxC + ox;
            if (nxC < 0 || nxC >= cols) continue;
            let j = shHead[rowB + nxC];
            while (j !== -1 && checks < 20) {
              if (j !== i) {
                checks++;
                const q = particles[j];
                const dx = q.x - p.x;
                const dy = q.y - p.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > 0.5 && d2 < cell * cell) {
                  const d = Math.sqrt(d2);
                  const nx = dx / d;
                  const ny = dy / d;
                  const signProd = (p.chargeSign || 1) * (q.chargeSign || 1);
                  if (d < 8.5) {
                    // Nucleo repulsivo ravvicinato così formano coppie/catene ordinate senza sovrapporsi a 0
                    const rep = (1 - d / 8.5) * 0.34;
                    fx -= nx * rep;
                    fy -= ny * rep;
                  } else if (signProd < 0) {
                    // Cariche opposte si attraggono e orbitano leggermente creando dipoli
                    const att = 0.085 / (0.6 + d * 0.09);
                    fx += (nx * att - ny * att * 0.35);
                    fy += (ny * att + nx * att * 0.35);
                  } else {
                    const rep = 0.048 / (0.6 + d * 0.09);
                    fx -= nx * rep;
                    fy -= ny * rep;
                  }
                }
              }
              j = shNext[j];
            }
          }
        }

        // Campo magnetico del cursore: orienta e attira/respinge secondo la polarità attiva (+1 / -1 / 0 dipolo)
        if (pointer.active) {
          const mdx = pointer.x - p.x;
          const mdy = pointer.y - p.y;
          const md = Math.hypot(mdx, mdy) || 1;
          if (md < 240) {
            const fall = 1 - md / 240;
            const nx = mdx / md;
            const ny = mdy / md;
            const mode = labState.polarityMode;
            const qSign = p.chargeSign || 1;
            if (mode === 0) {
              // Modalità linee di flusso dipolari attorno al cursore
              fx += (-ny * qSign * 0.42 + nx * 0.14) * fall;
              fy += (nx * qSign * 0.42 + ny * 0.14) * fall;
            } else {
              // Attrae cariche opposte al cursore e disegna archi attorno a quelle uguali
              const match = -mode * qSign; // >0 attratto, <0 respinto in arco magnetico
              fx += (nx * match * 0.48 - ny * qSign * 0.24) * fall;
              fy += (ny * match * 0.48 + nx * qSign * 0.24) * fall;
            }
          }
        }

        fx += (Math.random() - 0.5) * 0.12;
        fy += (Math.random() - 0.5) * 0.12;

        if (p.x < pad) fx += (pad - p.x) * 0.015;
        else if (p.x > viewW - pad) fx -= (p.x - (viewW - pad)) * 0.015;
        if (p.y < 84) fy += (84 - p.y) * 0.015;
        else if (p.y > viewH - pad) fy -= (p.y - (viewH - pad)) * 0.015;

        p.vx = clamp((p.vx + fx * dt) * damp, -7, 7);
        p.vy = clamp((p.vy + fy * dt) * damp, -7, 7);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    } else if (activeLab === 'HORIZON') {
      labState.hudDots.forEach((d) => stepSoftParticleToTarget(d, d.hx, d.hy, 0.06, dt));
      const rS = labState.horizonR;
      const rMax = Math.max(rS + 140, Math.min(viewW, viewH) * 0.46);
      const bhActiveProx = pointer.active ? clamp(1 - Math.hypot(pointer.x - cx, pointer.y - cy) / (rMax * 1.1), 0, 1) : 0.25;
      updateBlackHoleAudio(0.22 + bhActiveProx * 0.35, pointer.active ? pointer.x : cx, pointer.active ? pointer.y : cy);

      const damp = Math.pow(0.955, dt);
      for (let i = 0; i < total; i++) {
        const p = particles[i];
        if (p.colorWarmup < 1) p.colorWarmup = Math.min(1, p.colorWarmup + 0.02 * dt);

        if (p.hzJet > 0) {
          // Particella espulsa dal polo del buco nero verso l'anello esterno freddo (conservazione relativistica)
          p.hzJet -= 0.025 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vx *= Math.pow(0.94, dt);
          p.vy *= Math.pow(0.94, dt);
          p.vz *= Math.pow(0.94, dt);
          continue;
        }

        const rx = p.x - cx;
        const ry = p.y - cy;
        const rz = p.z;
        const dist = Math.hypot(rx, ry, rz) || 1;

        if (dist <= rS * 1.06) {
          // Ha superato l'orizzonte degli eventi dopo il redshift: viene riemessa lungo l'asse polare verso l'esterno freddo!
          const ejectAng = Math.random() * Math.PI * 2;
          const upDown = Math.random() < 0.5 ? -1 : 1;
          const rimR = rMax * (0.78 + Math.random() * 0.24);
          p.x = cx + Math.cos(ejectAng) * rS * 0.6;
          p.y = cy + Math.sin(ejectAng) * rS * 0.3;
          p.z = upDown * rS * 0.5;
          p.vx = Math.cos(ejectAng) * (rimR * 0.032);
          p.vy = upDown * (3.2 + Math.random() * 2.2) + Math.sin(ejectAng) * 1.1;
          p.vz = (Math.random() - 0.5) * 1.8;
          p.hzJet = 1.0;
          continue;
        }

        // Gravità + orbita relativistica in disco inclinato 3D attorno alla singolarità
        const gravity = clamp((210 / (dist + 22)), 0.08, 1.45);
        const swirl = clamp(Math.sqrt(180 / Math.max(24, dist)), 0.45, 3.8);
        const nx = rx / dist;
        const ny = ry / dist;
        const nz = rz / dist;
        // Vettore tangenziale inclinato in 3D
        const tx = -ny;
        const ty = nx * 0.72;
        const tz = nx * 0.36;

        let ax = -nx * gravity * 0.55 + tx * swirl * 0.22;
        let ay = -ny * gravity * 0.55 + ty * swirl * 0.22;
        let az = -nz * gravity * 0.42 + tz * swirl * 0.22 - rz * 0.008;

        if (pointer.active) {
          const mdx = pointer.x - p.x;
          const mdy = pointer.y - p.y;
          const md = Math.hypot(mdx, mdy) || 1;
          if (md < 180) {
            const k = (1 - md / 180) * 0.24;
            ax += (mdx / md) * k;
            ay += (mdy / md) * k;
          }
        }

        p.vx = (p.vx + ax * dt) * damp;
        p.vy = (p.vy + ay * dt) * damp;
        p.vz = (p.vz + az * dt) * damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
    }
  }

  function renderLabFrame() {
    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const total = particles.length;

    // Pulsanti angoli & etichette HUD in particelle morbide
    const drawCorner = (btn, hovered) => {
      ctx.fillStyle = hovered ? '#000000' : '#262626';
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

    // Telemetria superiore dinamica per SPECTRUM (o fissa per POLARITY/HORIZON)
    const hWarm = activeLab === 'SPECTRUM' ? 1 : 0;
    for (let i = 0; i < labState.hudDots.length; i++) {
      const d = labState.hudDots[i];
      if (d.mergedDead) continue;
      ctx.globalAlpha = d.isDot ? 0.62 : 0.92;
      if (activeLab === 'SPECTRUM') {
        const w = clamp(d.colorWarmup ?? hWarm, 0, 1);
        const rr = Math.round(24 + (labState.hudColorR - 24) * w);
        const gg = Math.round(24 + (labState.hudColorG - 24) * w);
        const bb = Math.round(24 + (labState.hudColorB - 24) * w);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.04 * (d.scale || 1), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (activeLab === 'SPECTRUM') {
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
    } else if (activeLab === 'POLARITY') {
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const isPos = (p.chargeSign || 1) > 0;
        const warm = p.colorWarmup ?? 1;
        ctx.fillStyle = warm > 0.3 ? (isPos ? 'rgb(218, 38, 42)' : 'rgb(28, 108, 240)') : '#222222';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 * p.sizeFactor, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sottile anello polarità del cursore
      if (pointer.active && pointer.y > 70) {
        const mode = labState.polarityMode;
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = mode > 0 ? 'rgb(218, 38, 42)' : mode < 0 ? 'rgb(28, 108, 240)' : '#222222';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (activeLab === 'HORIZON') {
      const rS = labState.horizonR;
      const rMax = Math.max(rS + 140, Math.min(viewW, viewH) * 0.46);
      const focal = Math.max(520, Math.min(viewW, viewH) * 0.85);

      for (let i = 0; i < total; i++) {
        const p = particles[i];
        const rx = p.x - cx;
        const ry = p.y - cy;
        const rz = p.z;
        if (rz > focal * 0.85) continue;
        const persp = Math.min(3.4, focal / Math.max(90, focal - rz));
        const drawX = cx + rx * persp;
        const drawY = cy + ry * persp;
        const dist = Math.hypot(rx, ry, rz);

        // Redshift gravitazionale + effetto Doppler locale: vicino a rS -> rosso intenso, lontano -> bianco-azzurro
        const gravNorm = clamp(1 - (dist - rS) / Math.max(1, rMax * 0.72), 0, 1);
        const speedNorm = clamp(Math.hypot(p.vx, p.vy, p.vz) / 9.5, 0, 1);
        const redshift = clamp(gravNorm * 0.78 + speedNorm * 0.22, 0, 1);
        const cIdx = clamp(Math.round(redshift * 255), 0, 255);

        ctx.globalAlpha = p.hzJet > 0 ? 0.55 : 0.88;
        ctx.fillStyle = (p.colorWarmup ?? 1) > 0.25 ? REDSHIFT_STYLES[cIdx] : '#222222';
        ctx.beginPath();
        ctx.arc(drawX, drawY, 1.4 * p.sizeFactor * persp, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orizzonte degli eventi al centro (singolarità nera netta con sottile anello fotonico)
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#080808';
      ctx.beginPath();
      ctx.arc(cx, cy, rS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Aggiorna lo stato del puntatore e verifica hover sui componenti invisibili.
   */
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

  /**
   * Legge distanza (in px) e gradiente verso l'interno della sagoma più vicina dal Distance Field.
   */
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
   * Step fisico principale a 60fps: densità per zona, cariche atomiche +/-,
   * repulsione locale tra particelle, confini morbidi e moto browniano.
   */
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

  // Pannello segreto di taratura (tasto /) + scrittura libera da tastiera
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
})();

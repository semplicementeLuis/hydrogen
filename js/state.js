// ============================================================================
// HYDROGEN — Stato Globale, Configurazione, Palette Colori e Costanti Fisiche
// ============================================================================
"use strict";

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

// ============================================================================
// HYDROGEN — Motore Audio Spaziale 3D (Web Audio API / Riverbero Cosmico ASMR)
// ============================================================================
"use strict";

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


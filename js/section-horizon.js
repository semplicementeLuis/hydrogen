// ============================================================================
// SEZIONE 04 · HORIZON — Disco di Accrescimento & Redshift Relativistico 3D
// ============================================================================
"use strict";

function initHorizonParticles(total, cx, cy, minDim) {
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

function updateHorizonSimulation(dt, total, cx, cy) {
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

function renderHorizonFrame(total, cx, cy) {
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

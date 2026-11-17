// ============================================================================
// SEZIONE 03 · POLARITY — Campi Magnetici & Cariche Elettriche (+ / -)
// ============================================================================
"use strict";

function initPolarityParticles(total, cx, cy) {
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
}

function updatePolaritySimulation(dt, total, cx, cy) {
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
}

function renderPolarityFrame(total) {
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
}

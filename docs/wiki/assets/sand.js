/* Sand — the Margolus falling-sand core shared by the matter toys
 * (falling-sand, material-properties, reactivity-chemistry, stability-and-debris,
 * chunk-streaming). A small-scale port of ShmupRouge's chunk_shader/simulation*.lua,
 * rules R1-R8, with gravity choosing each block's orientation. */
(function () {
  "use strict";
  // ---- Margolus core: a small-scale port of chunk_shader/simulation*.lua (rules R1-R8) ----
  // Block slots for each gravity direction: [topL, topR, botL, botR]; 0 right, 1 down, 2 left, 3 up.
  const DIRMAP = [[0, 2, 1, 3], [0, 1, 2, 3], [1, 3, 0, 2], [2, 3, 0, 1]];
  // One value per block per step (the game samples a blue-noise texture; a hash stands in).
  function blockRng(x, y, f) {
    let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(f + 1, 1103515245);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // sim = { c: Uint8Array, W, H, M: material table, frame, wrapX, wrapY, dissolve }
  // gravAt(x, y) -> [gx, gy, amp]. Amp only gates: >= 0.9 deletes (event horizon).
  function margolus(sim, gravAt) {
    const c = sim.c, W = sim.W, H = sim.H, M = sim.M, ph = sim.frame & 1, f = sim.frame++;
    const L = (v) => M[v].loose, Q = (v) => M[v].liq, D = (v) => M[v].d || 0;
    const mv = (a, b) => { c[b] = c[a]; c[a] = 0; };
    const sw = (a, b) => { const t = c[a]; c[a] = c[b]; c[b] = t; };
    const xe = sim.wrapX ? W : W - 1, ye = sim.wrapY ? H : H - 1, dis = sim.dissolve == null ? 0.001 : sim.dissolve;
    for (let by = ph; by < ye; by += 2) for (let bx = ph; bx < xe; bx += 2) {
      const x1 = (bx + 1) % W, y1 = (by + 1) % H;
      const B = [by * W + bx, by * W + x1, y1 * W + bx, y1 * W + x1];
      if (!(c[B[0]] | c[B[1]] | c[B[2]] | c[B[3]])) continue;
      const g = gravAt(bx + 1, by + 1);
      if (g[2] >= 0.9) { for (const k of B) if (!M[c[k]].wall) c[k] = 0; continue; }
      if (Math.hypot(g[0], g[1]) < 0.01) continue;            // zero-g: block untouched
      const r = blockRng(bx, by, f);
      let a = Math.atan2(g[1], g[0]); if (a < 0) a += Math.PI * 2;
      const s = a / (Math.PI / 2), lo = Math.floor(s) % 4, t = s - Math.floor(s);
      const m = DIRMAP[r < 1 - t ? lo : (lo + 1) % 4];         // the only random use of gravity
      const tl = B[m[0]], tr = B[m[1]], bl = B[m[2]], br = B[m[3]];
      const oBL = c[bl], oBR = c[br];
      if (L(c[tl]) && !c[bl]) mv(tl, bl);                                   // R1
      if (L(c[tr]) && !c[br]) mv(tr, br);                                   // R2
      if (L(c[tl]) && Q(c[bl]) && D(c[tl]) > D(c[bl])) sw(tl, bl);          // R2b sink
      if (L(c[tr]) && Q(c[br]) && D(c[tr]) > D(c[br])) sw(tr, br);          // R2c
      if (L(c[tl]) && c[bl] && !c[br]) mv(tl, br);                          // R3 diagonal
      if (L(c[tr]) && c[br] && !c[bl]) mv(tr, bl);                          // R4
      const fl = r >= 0.5;                                                  // R5/R6 left-right swap
      const A = fl ? tr : tl, Bb = fl ? tl : tr, P = fl ? br : bl, Qq = fl ? bl : br, oP = fl ? oBR : oBL, oQ = fl ? oBL : oBR;
      if (Q(c[A]) && c[P] && c[Qq] && !c[Bb]) mv(A, Bb);                    // R5 top-row spread
      else if (Q(c[Bb]) && c[Qq] && c[P] && !c[A]) mv(Bb, A);
      if (Q(oP) && !c[Qq]) mv(P, Qq);                                       // R6 settled spread
      else if (Q(oQ) && !c[P]) mv(Qq, P);
      const chem = (p, n1, n2) => {                                         // R7 chemistry
        const mc = c[p]; if (!mc) return;
        if (M[mc].soluble && (M[c[n1]].solvent || M[c[n2]].solvent) && r < dis) { c[p] = M[c[n1]].solvent ? c[n1] : c[n2]; return; }
        if (!M[mc].acidic) return;
        const ls = (v) => v && L(v) && !Q(v);
        if (ls(c[n1]) && r < 0.05) c[n1] = 0; else if (ls(c[n2]) && r < 0.05) c[n2] = 0;
        else if (M[c[n1]].stat && r < 0.10) c[n1] = 0; else if (M[c[n2]].stat && r < 0.10) c[n2] = 0;
        else if (r < 0.002) c[p] = 0;
      };
      chem(tl, tr, bl); chem(tr, tl, br); chem(bl, tl, br); chem(br, tr, bl);
      const ld = (v) => (Q(v) ? D(v) : 0);                                  // R8 buoyancy
      if (ld(c[tl]) && ld(c[bl]) && ld(c[tl]) > ld(c[bl])) sw(tl, bl);
      if (ld(c[tr]) && ld(c[br]) && ld(c[tr]) > ld(c[br])) sw(tr, br);
    }
  }
  // Draw cells as horizontal runs of one material.
  function drawCells(g, sim, cs, colorOf, ox, oy) {
    const c = sim.c, W = sim.W; ox = ox || 0; oy = oy || 0;
    for (let y = 0; y < sim.H; y++) {
      let x = 0;
      while (x < W) {
        const v = c[y * W + x]; let e = x + 1;
        while (e < W && c[y * W + e] === v) e++;
        if (v) {
          const col = colorOf(v);
          if (col) g.rect(ox + x * cs, oy + y * cs, (e - x) * cs + 0.3, cs + 0.3, col);
          if (col && sim.shade && sim.M[v].stat) g.tone(ox + x * cs, oy + y * cs, (e - x) * cs, cs, sim.shade, g.C.bg);
        }
        x = e;
      }
    }
  }
  // ---- end core ----
  window.Sand = { DIRMAP, blockRng, drawCells, margolus };
})();

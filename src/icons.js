/* Flat top-down icons. Each painter draws in cm with the origin at the item's top-left corner. */
(function (root) {
  'use strict';

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Small drawing kit bound to one item. px is the size of one screen pixel in cm.
  function kit(ctx, it, pal, px) {
    const w = it.w, d = it.d;
    const main = () => { ctx.lineWidth = 1.4 * px; ctx.strokeStyle = pal.stroke; ctx.fillStyle = pal.fill; };
    const fine = () => { ctx.lineWidth = 1 * px; ctx.strokeStyle = pal.detail; };
    return {
      w, d, px, ctx, pal,
      // Filled outline pieces.
      slab(x, y, sw, sh, r) { main(); roundRectPath(ctx, x, y, sw, sh, r); ctx.fill(); ctx.stroke(); },
      body(r) { this.slab(0, 0, w, d, r); },
      disc(cx, cy, rx, ry) { main(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); },
      // Thin detail strokes.
      box(x, y, bw, bh, r) { fine(); roundRectPath(ctx, x, y, bw, bh, r); ctx.stroke(); },
      line(x1, y1, x2, y2) { fine(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      ring(cx, cy, rx, ry) { fine(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry == null ? rx : ry, 0, 0, Math.PI * 2); ctx.stroke(); },
      dot(cx, cy, r) { ctx.fillStyle = pal.detail; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); },
      bar(x, y, bw, bh, r) { ctx.fillStyle = pal.detail; roundRectPath(ctx, x, y, bw, bh, r); ctx.fill(); }
    };
  }

  // Symbol colors of the electrical layer: power, light and data.
  const E_POWER = '#c2410c', E_LIGHT = '#b45309', E_DATA = '#1d4ed8', SOFT = 'rgba(120,100,60,0.85)';

  function pen(g, color, width) {
    g.ctx.lineWidth = (width || 1.6) * g.px;
    g.ctx.strokeStyle = color;
    g.ctx.fillStyle = '#ffffff';
    g.ctx.setLineDash([]);
    return g.ctx;
  }
  function circle(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill !== false) ctx.fill();
    ctx.stroke();
  }
  function socketAt(g, cx, cy, r) {
    const ctx = pen(g, E_POWER);
    circle(ctx, cx, cy, r);
    ctx.fillStyle = E_POWER;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * 0.4, cy, r * 0.17, 0, Math.PI * 2); ctx.fill(); }
  }

  const PAINTERS = {
    box(g) { g.body(2); },

    bed(g) {
      g.body(3);
      const m = Math.min(8, g.w * 0.08);
      const ph = Math.min(45, g.d * 0.22);
      const n = g.w >= 120 ? 2 : 1;
      const pw = (g.w - m * (n + 1)) / n;
      for (let i = 0; i < n; i++) g.box(m + i * (pw + m), m, pw, ph, 5);
      g.line(0, ph + 2 * m, g.w, ph + 2 * m);
    },

    wardrobe(g) {
      g.body(1);
      const m = Math.min(6, g.w * 0.05);
      g.line(m, g.d / 2, g.w - m, g.d / 2);
      const n = Math.max(2, Math.round(g.w / 22));
      for (let i = 1; i < n; i++) {
        const x = (g.w * i) / n;
        g.line(x - g.d * 0.06, g.d * 0.22, x + g.d * 0.06, g.d * 0.78);
      }
    },

    // Sofa and armchair: backrest along the top edge, arms on both sides.
    sofa(g) {
      g.body(6);
      const back = Math.min(22, g.d * 0.26), arm = Math.min(18, g.w * 0.14);
      g.box(0, 0, g.w, back, 6);
      g.box(0, back, arm, g.d - back, 5);
      g.box(g.w - arm, back, arm, g.d - back, 5);
      const seats = Math.max(1, Math.round((g.w - 2 * arm) / 65));
      for (let i = 1; i < seats; i++) {
        const x = arm + ((g.w - 2 * arm) * i) / seats;
        g.line(x, back, x, g.d);
      }
    },

    // L-shaped sofa: backrest along the top edge and down the outer side of the return.
    lsofa(g) {
      const { ctx, pal, px } = g;
      const arm = Math.min(root.HP.geometry.L_ARM_CM, g.w, g.d), back = arm * 0.24;
      ctx.lineWidth = 1.4 * px;
      ctx.strokeStyle = pal.stroke;
      ctx.fillStyle = pal.fill;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (const [x, y] of [[g.w, 0], [g.w, g.d], [g.w - arm, g.d], [g.w - arm, arm], [0, arm]]) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      g.line(0, back, g.w - back, back);
      g.line(g.w - back, back, g.w - back, g.d);
      g.line(g.w - arm, back, g.w - arm, arm);
    },

    coffee(g) {
      g.body(4);
      const m = Math.min(6, g.w * 0.08, g.d * 0.08);
      g.box(m, m, g.w - 2 * m, g.d - 2 * m, 2);
    },

    tv(g) {
      g.body(1);
      g.bar(g.w * 0.14, g.d * 0.12, g.w * 0.72, g.d * 0.16, g.d * 0.05);
    },

    // Screen along the bottom edge, wall side on top.
    tvwall(g) {
      g.body(1);
      g.bar(g.w * 0.04, g.d * 0.55, g.w * 0.92, g.d * 0.3, g.d * 0.1);
    },

    nightstand(g) {
      g.body(3);
      g.line(0, g.d * 0.8, g.w, g.d * 0.8);
      g.dot(g.w / 2, g.d * 0.9, Math.min(1.5, g.d * 0.05));
    },

    plant(g) {
      const r = g.w / 2, ry = g.d / 2;
      g.disc(r, ry, r, ry);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        g.line(r, ry, r + Math.cos(a) * r * 0.78, ry + Math.sin(a) * ry * 0.78);
      }
      g.ring(r, ry, r * 0.22, ry * 0.22);
    },

    table(g) { g.body(4); },
    round(g) { g.disc(g.w / 2, g.d / 2, g.w / 2, g.d / 2); },

    chair(g) {
      g.body(5);
      g.box(g.w * 0.08, 0, g.w * 0.84, Math.min(9, g.d * 0.2), 3);
    },

    desk(g) {
      g.body(2);
      g.line(g.w * 0.68, 0, g.w * 0.68, g.d);
    },

    officechair(g) {
      g.slab(g.w * 0.08, g.d * 0.12, g.w * 0.84, g.d * 0.88, Math.min(g.w, g.d) * 0.3);
      g.slab(g.w * 0.16, 0, g.w * 0.68, g.d * 0.2, g.d * 0.1);
      g.box(0, g.d * 0.4, g.w * 0.12, g.d * 0.36, 2);
      g.box(g.w * 0.88, g.d * 0.4, g.w * 0.12, g.d * 0.36, 2);
    },

    counter(g) {
      g.body(1);
      const lip = Math.min(4, g.d * 0.08);
      g.line(0, g.d - lip, g.w, g.d - lip);
    },

    corner(g) {
      g.body(1);
      g.line(0, g.d, g.w, 0);
    },

    fridge(g) {
      g.body(2);
      g.line(0, g.d * 0.88, g.w, g.d * 0.88);
      g.bar(g.w * 0.1, g.d * 0.92, g.w * 0.22, g.d * 0.035, 1);
    },

    stove(g) {
      g.body(2);
      const r = Math.min(g.w, g.d);
      for (const [fx, fy, k] of [[0.28, 0.28, 0.15], [0.72, 0.28, 0.11], [0.28, 0.72, 0.11], [0.72, 0.72, 0.15]]) {
        g.ring(g.w * fx, g.d * fy, r * k);
      }
    },

    hob2(g) {
      g.body(2);
      const r = Math.min(g.w, g.d / 2) * 0.32;
      g.ring(g.w / 2, g.d * 0.28, r);
      g.ring(g.w / 2, g.d * 0.72, r);
    },

    sink(g) {
      g.body(2);
      g.box(g.w * 0.1, g.d * 0.24, g.w * 0.8, g.d * 0.64, 5);
      g.dot(g.w / 2, g.d * 0.12, Math.min(2.5, g.d * 0.05));
      g.ring(g.w / 2, g.d * 0.56, Math.min(2.5, g.d * 0.05));
    },

    washer(g) {
      g.body(2);
      const r = Math.min(g.w, g.d);
      g.line(0, g.d * 0.16, g.w, g.d * 0.16);
      g.ring(g.w / 2, g.d * 0.57, r * 0.32);
      g.ring(g.w / 2, g.d * 0.57, r * 0.22);
    },

    toilet(g) {
      g.slab(0, 0, g.w, g.d * 0.28, 2);
      g.disc(g.w / 2, g.d * 0.63, g.w * 0.46, g.d * 0.37);
      g.ring(g.w / 2, g.d * 0.66, g.w * 0.28, g.d * 0.24);
    },

    bathtub(g) {
      g.body(4);
      const m = Math.min(6, g.d * 0.09);
      g.box(m, m, g.w - 2 * m, g.d - 2 * m, (g.d - 2 * m) * 0.4);
      g.ring(g.w - m - g.d * 0.22, g.d / 2, Math.min(2.5, g.d * 0.04));
    },

    shower(g) {
      g.body(1);
      g.line(0, 0, g.w, g.d);
      g.line(g.w, 0, 0, g.d);
      const r = Math.min(g.w, g.d) * 0.07;
      g.disc(g.w / 2, g.d / 2, r, r);
    },

    basin(g) {
      g.body(3);
      g.ring(g.w / 2, g.d * 0.56, g.w * 0.36, g.d * 0.3);
      g.dot(g.w / 2, g.d * 0.13, Math.min(2.5, g.d * 0.06));
    },

    // Hinge in the bottom-left corner, leaf drawn open, arc sweeping to the closed position.
    door(g) {
      const { ctx, pal, px } = g;
      ctx.fillStyle = pal.fill;
      ctx.beginPath();
      ctx.moveTo(0, g.d);
      ctx.lineTo(0, 0);
      ctx.ellipse(0, g.d, g.w, g.d, 0, -Math.PI / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = pal.detail;
      ctx.beginPath();
      ctx.ellipse(0, g.d, g.w, g.d, 0, -Math.PI / 2, 0);
      ctx.stroke();
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.beginPath(); ctx.moveTo(0, g.d); ctx.lineTo(g.w, g.d); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.6 * px;
      ctx.strokeStyle = pal.stroke;
      ctx.beginPath(); ctx.moveTo(0, g.d); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = pal.stroke;
      ctx.beginPath(); ctx.arc(0, g.d, 2.4 * px, 0, Math.PI * 2); ctx.fill();
    },

    speaker(g) {
      g.body(2);
      const r = Math.min(g.w, g.d);
      g.ring(g.w / 2, g.d * 0.3, r * 0.12);
      g.ring(g.w / 2, g.d * 0.66, r * 0.2);
    },

    ottoman(g) {
      const r = Math.min(g.w, g.d);
      g.body(r * 0.3);
      g.box(g.w * 0.12, g.d * 0.12, g.w * 0.76, g.d * 0.76, r * 0.22);
    },

    dogbed(g) {
      g.body(Math.min(g.w, g.d) * 0.4);
      g.ring(g.w / 2, g.d / 2, g.w * 0.32, g.d * 0.3);
    },

    // Vanity: mirror along the wall edge on top, drawer front at the bottom.
    vanity(g) {
      g.body(2);
      g.bar(g.w * 0.2, g.d * 0.07, g.w * 0.6, g.d * 0.1, 1);
      g.line(0, g.d * 0.82, g.w, g.d * 0.82);
    },

    tall(g) {
      g.body(1);
      g.line(0, 0, g.w, g.d);
      g.line(g.w, 0, 0, g.d);
    },

    dishwasher(g) {
      g.body(1);
      const lip = Math.min(4, g.d * 0.08);
      g.line(0, g.d - lip, g.w, g.d - lip);
      g.box(g.w * 0.2, g.d * 0.22, g.w * 0.6, g.d * 0.42, 2);
    },

    sideboard(g) {
      g.body(1);
      const n = Math.max(2, Math.round(g.w / 50));
      for (let i = 1; i < n; i++) g.line((g.w * i) / n, 0, (g.w * i) / n, g.d);
    },

    shelf(g) {
      g.body(1);
      g.line(0, g.d / 3, g.w, g.d / 3);
      g.line(0, (g.d * 2) / 3, g.w, (g.d * 2) / 3);
    },

    display(g) {
      g.body(1);
      g.box(g.w * 0.15, g.d * 0.15, g.w * 0.7, g.d * 0.7, 0);
    },

    bench(g) {
      g.body(3);
      g.line(g.w * 0.06, g.d / 2, g.w * 0.94, g.d / 2);
    },

    // Rugs are see-through so the plan and the furniture on top stay readable.
    rug(g) {
      const ctx = pen(g, SOFT, 1.2), m = Math.min(12, g.w * 0.08, g.d * 0.08);
      ctx.fillStyle = 'rgba(196,178,140,0.32)';
      roundRectPath(ctx, 0, 0, g.w, g.d, 2);
      ctx.fill();
      ctx.stroke();
      roundRectPath(ctx, m, m, g.w - 2 * m, g.d - 2 * m, 1);
      ctx.stroke();
    },

    ruground(g) {
      const ctx = pen(g, SOFT, 1.2);
      ctx.fillStyle = 'rgba(196,178,140,0.32)';
      for (const k of [1, 0.86]) {
        ctx.beginPath();
        ctx.ellipse(g.w / 2, g.d / 2, (g.w / 2) * k, (g.d / 2) * k, 0, 0, Math.PI * 2);
        if (k === 1) ctx.fill();
        ctx.stroke();
      }
    },

    curtain(g) {
      const ctx = pen(g, SOFT, 1.4), waves = Math.max(2, Math.round(g.w / 20));
      ctx.beginPath();
      for (let i = 0; i <= waves * 8; i++) {
        const t = i / (waves * 8);
        const y = g.d / 2 + Math.sin(t * waves * Math.PI * 2) * g.d * 0.4;
        if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(t * g.w, y);
      }
      ctx.stroke();
    },

    // Walking route: the outline takes the warning color when furniture stands on it.
    route(g) {
      const ctx = pen(g, g.pal.stroke, 1.2);
      ctx.fillStyle = 'rgba(23,100,232,0.09)';
      ctx.fillRect(0, 0, g.w, g.d);
      ctx.setLineDash([6 * g.px, 5 * g.px]);
      ctx.strokeRect(0, 0, g.w, g.d);
      ctx.beginPath();
      if (g.w >= g.d) { ctx.moveTo(0, g.d / 2); ctx.lineTo(g.w, g.d / 2); } else { ctx.moveTo(g.w / 2, 0); ctx.lineTo(g.w / 2, g.d); }
      ctx.stroke();
      ctx.setLineDash([]);
    },

    esocket(g) { socketAt(g, g.w / 2, g.d / 2, Math.min(g.w, g.d) / 2); },

    esocket2(g) {
      const r = Math.min(g.w / 2, g.d) / 2;
      socketAt(g, r, g.d / 2, r);
      socketAt(g, g.w - r, g.d / 2, r);
    },

    efeed(g) {
      const ctx = pen(g, E_POWER), r = Math.min(g.w, g.d) / 2;
      circle(ctx, g.w / 2, g.d / 2, r);
      ctx.fillStyle = E_POWER;
      circle(ctx, g.w / 2, g.d / 2, r * 0.45);
    },

    eswitch(g) {
      const ctx = pen(g, E_LIGHT), r = Math.min(g.w, g.d) / 2;
      circle(ctx, g.w / 2, g.d / 2, r * 0.55);
      ctx.beginPath();
      ctx.moveTo(g.w / 2, g.d / 2);
      ctx.lineTo(g.w / 2 + r, g.d / 2 - r);
      ctx.stroke();
    },

    elight(g) {
      const ctx = pen(g, E_LIGHT), r = Math.min(g.w, g.d) / 2, q = r * 0.7;
      circle(ctx, g.w / 2, g.d / 2, r);
      ctx.beginPath();
      ctx.moveTo(g.w / 2 - q, g.d / 2 - q); ctx.lineTo(g.w / 2 + q, g.d / 2 + q);
      ctx.moveTo(g.w / 2 + q, g.d / 2 - q); ctx.lineTo(g.w / 2 - q, g.d / 2 + q);
      ctx.stroke();
    },

    // Wall light: half disc with its flat side on the wall edge (top).
    ewall(g) {
      const ctx = pen(g, E_LIGHT), r = Math.min(g.w / 2, g.d);
      ctx.beginPath();
      ctx.arc(g.w / 2, 0, r, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.w / 2, 0); ctx.lineTo(g.w / 2, r);
      ctx.stroke();
    },

    eled(g) {
      const ctx = pen(g, '#d97706', 1);
      ctx.lineWidth = Math.max(g.d * 0.6, 2.5 * g.px);
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(0, g.d / 2); ctx.lineTo(g.w, g.d / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    enet(g) {
      const ctx = pen(g, E_DATA);
      ctx.fillRect(0, 0, g.w, g.d);
      ctx.strokeRect(0, 0, g.w, g.d);
      ctx.beginPath();
      for (const fx of [0.3, 0.5, 0.7]) { ctx.moveTo(g.w * fx, g.d * 0.45); ctx.lineTo(g.w * fx, g.d * 0.85); }
      ctx.stroke();
    },

    window(g) {
      g.body(0);
      g.line(0, g.d / 2, g.w, g.d / 2);
    }
  };

  // Expects the context transformed so the item's center is the origin and one unit is one cm.
  function draw(ctx, it, pal, px) {
    ctx.save();
    ctx.translate(-it.w / 2, -it.d / 2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    (PAINTERS[it.icon] || PAINTERS.box)(kit(ctx, it, pal, px));
    ctx.restore();
  }

  root.HP.icons = { draw, roundRectPath };
})(window);

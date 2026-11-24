/* Canvas drawing: the mat, the plan image, items, selection, measurements, PNG export. */
(function (root) {
  'use strict';
  const HP = root.HP, geo = HP.geometry, icons = HP.icons, model = HP.model, catalog = HP.catalog;

  const FONT = '"Avenir Next", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  const ROTATE_HANDLE_PX = 26;   // distance of the rotate handle from the top edge
  const C = {
    mat: '#2f4f47',
    matLine: 'rgba(255,255,255,0.045)',
    matLineStrong: 'rgba(255,255,255,0.1)',
    ink: '#33434c',
    detail: 'rgba(51,67,76,0.6)',
    fill: 'rgba(230,236,238,0.93)',
    text: '#1c2b30',
    accent: '#1764e8',
    error: '#c62828',
    warn: '#a86200'
  };

  function fmtCm(v) {
    const r = Math.round(v * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + ' cm';
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function paletteFor(it, flag) {
    const door = it.shape === 'door';
    if (flag && flag.level === 'error') {
      return { fill: door ? 'rgba(198,40,40,0.2)' : 'rgba(249,205,200,0.93)', stroke: C.error, detail: 'rgba(198,40,40,0.65)', text: '#8e1b1b', halo: 'rgba(255,255,255,0.7)' };
    }
    if (flag && flag.level === 'warn') {
      return { fill: door ? 'rgba(214,137,16,0.25)' : 'rgba(252,228,178,0.93)', stroke: C.warn, detail: 'rgba(168,98,0,0.65)', text: '#6b3f00', halo: 'rgba(255,255,255,0.7)' };
    }
    if (door) return { fill: 'rgba(51,67,76,0.08)', stroke: C.ink, detail: C.detail, text: C.text, halo: 'rgba(255,255,255,0.7)' };
    if (it.color) {
      const [r, g, b] = hexToRgb(it.color);
      const dark = 0.299 * r + 0.587 * g + 0.114 * b < 120;
      return {
        fill: `rgba(${r},${g},${b},0.93)`, stroke: C.ink, detail: dark ? 'rgba(255,255,255,0.6)' : C.detail,
        text: dark ? '#ffffff' : C.text, halo: dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)'
      };
    }
    return { fill: C.fill, stroke: C.ink, detail: C.detail, text: C.text, halo: 'rgba(255,255,255,0.7)' };
  }

  // k is screen pixels per cm, origin is where plan (0,0) lands, u scales strokes and type for export.
  function drawItem(ctx, it, k, origin, flag, u, withLabel) {
    const pal = paletteFor(it, flag);
    const cx = it.x * k + origin.x, cy = it.y * k + origin.y;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(geo.toRad(it.rot || 0));
    ctx.scale(it.flipped ? -k : k, k);
    icons.draw(ctx, it, pal, u / k);
    ctx.restore();
    if (withLabel !== false) drawLabel(ctx, it, cx, cy, k, pal, u);
  }

  // The name runs along the longer side and is dropped when it does not fit.
  function drawLabel(ctx, it, cx, cy, k, pal, u) {
    if (!it.label || it.blocking === false) return;
    const alongDepth = it.d > it.w * 1.2;
    const longPx = (alongDepth ? it.d : it.w) * k - 8 * u;
    const shortPx = (alongDepth ? it.w : it.d) * k;
    let size = geo.clamp(shortPx * 0.2, 9 * u, 13 * u);
    if (shortPx < size * 1.5 || longPx <= 0) return;
    ctx.save();
    ctx.font = `500 ${size}px ${FONT}`;
    let width = ctx.measureText(it.label).width;
    if (width > longPx) {
      size *= longPx / width;
      if (size < 8 * u) { ctx.restore(); return; }
      ctx.font = `500 ${size}px ${FONT}`;
    }
    let angle = geo.normalizeDeg((it.rot || 0) + (alongDepth ? 90 : 0));
    if (angle > 90 && angle <= 270) angle -= 180;     // never upside down
    ctx.translate(cx, cy);
    ctx.rotate(geo.toRad(angle));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = pal.halo;
    ctx.strokeText(it.label, 0, 0);
    ctx.fillStyle = pal.text;
    ctx.fillText(it.label, 0, 0);
    ctx.restore();
  }

  // Screen positions of the selection frame, the corner handles and the rotate handle.
  function handles(it, k, origin) {
    const toScreen = (p) => ({ x: p.x * k + origin.x, y: p.y * k + origin.y });
    const corners = geo.rectCorners(it).map(toScreen);
    const [cos, sin] = geo.cosSin(it.rot || 0);
    const up = { x: sin, y: -cos }, right = { x: cos, y: sin };
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const topMid = mid(corners[0], corners[1]);
    return {
      corners, up, right, topMid,
      center: toScreen(it),
      rightMid: mid(corners[1], corners[2]),
      bottomMid: mid(corners[2], corners[3]),
      leftMid: mid(corners[3], corners[0]),
      rotate: { x: topMid.x + up.x * ROTATE_HANDLE_PX, y: topMid.y + up.y * ROTATE_HANDLE_PX }
    };
  }

  function pill(ctx, text, cx, cy, bg, fg) {
    ctx.save();
    ctx.font = `600 11px ${FONT}`;
    const w = ctx.measureText(text).width + 12, h = 18;
    icons.roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 9);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg || '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
    return { w, h };
  }

  function pillWidth(ctx, text) {
    ctx.save();
    ctx.font = `600 11px ${FONT}`;
    const w = ctx.measureText(text).width + 12;
    ctx.restore();
    return w;
  }

  // Places a pill just outside an edge, whatever the rotation.
  function pillOutside(ctx, text, at, normal, gap, bg) {
    const w = pillWidth(ctx, text), h = 18;
    const reach = gap + Math.abs(normal.x) * w / 2 + Math.abs(normal.y) * h / 2;
    pill(ctx, text, at.x + normal.x * reach, at.y + normal.y * reach, bg);
  }

  function drawSelection(ctx, it, k, origin, withHandles) {
    const h = handles(it, k, origin);
    ctx.save();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    if (it.locked) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    h.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (withHandles) {
      ctx.beginPath(); ctx.moveTo(h.topMid.x, h.topMid.y); ctx.lineTo(h.rotate.x, h.rotate.y); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(h.rotate.x, h.rotate.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const p of h.corners) {
        ctx.beginPath(); ctx.rect(p.x - 4.5, p.y - 4.5, 9, 9); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
    if (it.locked) pillOutside(ctx, 'Locked', h.topMid, h.up, 6, C.ink);
  }

  // Width under the bottom edge, depth beside the right edge. A label moves to the
  // opposite edge when the gap line (or an overlapping neighbour) is on its usual side.
  function drawDimensions(ctx, it, k, origin, avoid, withHandles) {
    const h = handles(it, k, origin);
    const usual = (a, b) => !avoid || geo.distance(avoid, a) >= geo.distance(avoid, b);
    const topGap = withHandles ? ROTATE_HANDLE_PX + 10 : it.locked ? 30 : 7;
    if (usual(h.bottomMid, h.topMid)) pillOutside(ctx, fmtCm(it.w), h.bottomMid, { x: -h.up.x, y: -h.up.y }, 7, C.accent);
    else pillOutside(ctx, fmtCm(it.w), h.topMid, h.up, topGap, C.accent);
    if (usual(h.rightMid, h.leftMid)) pillOutside(ctx, fmtCm(it.d), h.rightMid, h.right, 7, C.accent);
    else pillOutside(ctx, fmtCm(it.d), h.leftMid, { x: -h.right.x, y: -h.right.y }, 7, C.accent);
  }

  function dashedLink(ctx, a, b) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.accent;
    for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // Dimension line from the selected item to its nearest neighbour.
  function drawGap(ctx, near, k, origin) {
    const a = { x: near.a.x * k + origin.x, y: near.a.y * k + origin.y };
    const b = { x: near.b.x * k + origin.x, y: near.b.y * k + origin.y };
    dashedLink(ctx, a, b);
    pill(ctx, fmtCm(near.dist), (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', C.accent);
  }

  function crosshair(ctx, p) {
    ctx.save();
    for (const [color, width] of [['#ffffff', 4], [C.accent, 1.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
      ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  // calib = { a, b, saved } in image px; b follows the cursor until the second click.
  function drawCalibration(ctx, calib, plan, view) {
    const toScreen = (p) => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });
    let a = calib.a, b = calib.b, text = null;
    if (!a && calib.saved) {
      a = calib.saved.a; b = calib.saved.b;
      text = fmtCm(calib.saved.cm) + ' (current scale)';
    }
    if (!a) return;
    const sa = toScreen(a);
    if (!b) { crosshair(ctx, sa); return; }
    const sb = toScreen(b);
    dashedLink(ctx, sa, sb);
    crosshair(ctx, sa);
    crosshair(ctx, sb);
    if (!text) {
      const px = geo.distance(a, b);
      text = plan.calibrated ? fmtCm(px / plan.pxPerCm) : Math.round(px) + ' px';
    }
    pill(ctx, text, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 16, C.accent);
  }

  // Cutting-mat grid: a line every metre, every 10 cm once zoomed in far enough.
  function drawMat(ctx, s, k) {
    ctx.fillStyle = C.mat;
    ctx.fillRect(0, 0, s.width, s.height);
    for (const [stepCm, color] of [[10, C.matLine], [100, C.matLineStrong]]) {
      const gap = stepCm * k;
      if (gap < 10) continue;
      ctx.beginPath();
      for (let x = ((s.view.x % gap) + gap) % gap; x < s.width; x += gap) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, s.height); }
      for (let y = ((s.view.y % gap) + gap) % gap; y < s.height; y += gap) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(s.width, Math.round(y) + 0.5); }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawPaper(ctx, s) {
    const meta = s.plan.image;
    if (!meta) return;
    const x = s.view.x, y = s.view.y, w = meta.width * s.view.scale, h = meta.height * s.view.scale;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 3, y + 4, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    if (s.image) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s.image, x, y, w, h);
    } else {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = C.detail;
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
      ctx.fillStyle = C.ink;
      ctx.font = `500 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('The floor plan image is not stored in this browser.', x + w / 2, y + h / 2 - 10);
      ctx.fillText('Open it again, your furniture is still here.', x + w / 2, y + h / 2 + 12);
      ctx.restore();
    }
  }

  // Dashed strip showing the free space an item needs in front of it.
  function drawClearance(ctx, it, k, origin) {
    const zone = geo.clearancePolygon(it);
    if (!zone) return;
    ctx.save();
    ctx.beginPath();
    zone.forEach((p, i) => (i ? ctx.lineTo(p.x * k + origin.x, p.y * k + origin.y) : ctx.moveTo(p.x * k + origin.x, p.y * k + origin.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(23,100,232,0.07)';
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(23,100,232,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawScene(ctx, s) {
    const plan = s.plan, view = s.view;
    const k = plan.pxPerCm * view.scale;
    drawMat(ctx, s, k);
    drawPaper(ctx, s);
    const visible = model.visibleItems(plan);
    if (plan.settings.showClearances) for (const it of visible) drawClearance(ctx, it, k, view);
    for (const it of visible) drawItem(ctx, it, k, view, s.collisions.get(it.id), 1);
    const selected = visible.filter((it) => s.selection.has(it.id));
    for (const it of selected) drawSelection(ctx, it, k, view, s.handlesFor === it.id);
    const near = s.nearest;
    if (near && near.dist > 0 && near.a) drawGap(ctx, near, k, view);
    let avoid = null;
    if (near && selected.length === 1) {
      const p = near.dist > 0 && near.a ? near.a : near.other;
      avoid = { x: p.x * k + view.x, y: p.y * k + view.y };
    }
    for (const it of selected) drawDimensions(ctx, it, k, view, avoid, s.handlesFor === it.id);
    if (s.calib) drawCalibration(ctx, s.calib, plan, view);
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = 1;
    return {
      resize(w, h, ratio) {
        dpr = ratio || 1;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
      },
      draw(scene) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, scene);
      }
    };
  }

  // Counts of the visible electrical symbols by type, in library order.
  function legendEntries(visible) {
    const counts = new Map();
    for (const it of visible) if (it.layer) counts.set(it.type, (counts.get(it.type) || 0) + 1);
    return catalog.TYPES.filter((t) => counts.has(t.type)).map((t) => ({ def: t, count: counts.get(t.type) }));
  }

  function drawLegend(ctx, entries, top, width, u, colW, rowH) {
    const cols = Math.max(1, Math.floor(width / colW));
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${14 * u}px ${FONT}`;
    ctx.fillText('Electrical and smart points', 16 * u, top + 18 * u);
    ctx.font = `500 ${13 * u}px ${FONT}`;
    entries.forEach((e, i) => {
      const x = 16 * u + (i % cols) * colW, y = top + 36 * u + Math.floor(i / cols) * rowH + rowH / 2;
      const k = (20 * u) / Math.max(e.def.w, e.def.d);
      const sample = { x: 0, y: 0, w: e.def.w, d: e.def.d, rot: 0, shape: e.def.shape, icon: e.def.icon, blocking: false };
      drawItem(ctx, sample, k, { x: x + 12 * u, y }, null, u, false);
      ctx.fillStyle = C.text;
      ctx.fillText(e.count + ' × ' + e.def.name, x + 30 * u, y);
    });
  }

  // Plan image and furniture on one canvas, without selection marks or conflict colors.
  // Visible electrical symbols add a legend with counts below the plan.
  function exportCanvas(plan, image) {
    const visible = model.visibleItems(plan);
    let box = null;
    if (plan.image) box = { minX: 0, minY: 0, maxX: plan.image.width / plan.pxPerCm, maxY: plan.image.height / plan.pxPerCm };
    const margin = plan.image ? 10 : 20;
    for (const it of visible) {
      const b = geo.itemAABB(it);
      if (!box) { box = { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin }; continue; }
      if (b.minX < box.minX) box.minX = b.minX - margin;
      if (b.minY < box.minY) box.minY = b.minY - margin;
      if (b.maxX > box.maxX) box.maxX = b.maxX + margin;
      if (b.maxY > box.maxY) box.maxY = b.maxY + margin;
    }
    if (!box) return null;
    const longPx = Math.max(box.maxX - box.minX, box.maxY - box.minY) * plan.pxPerCm;
    // Small plans are scaled up for legible labels, very large ones are capped for canvas limits.
    const out = Math.min(geo.clamp(1600 / longPx, 1, 4), 8000 / longPx);
    const k = plan.pxPerCm * out;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((box.maxX - box.minX) * k));
    const planH = Math.max(1, Math.round((box.maxY - box.minY) * k));
    const u = Math.max(1, Math.max(canvas.width, planH) / 1400);
    const entries = legendEntries(visible), colW = 250 * u, rowH = 28 * u;
    const rows = Math.ceil(entries.length / Math.max(1, Math.floor(canvas.width / colW)));
    canvas.height = planH + (entries.length ? Math.round(48 * u + rows * rowH) : 0);
    const ctx = canvas.getContext('2d');
    const origin = { x: -box.minX * k, y: -box.minY * k };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (plan.image && image) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, origin.x, origin.y, plan.image.width * out, plan.image.height * out);
    }
    for (const it of visible) drawItem(ctx, it, k, origin, null, u);
    if (entries.length) drawLegend(ctx, entries, planH, canvas.width, u, colW, rowH);
    return canvas;
  }

  function drawThumbnail(canvas, def, sizeCss) {
    const dpr = root.devicePixelRatio || 1;
    canvas.width = Math.round(sizeCss * dpr);
    canvas.height = Math.round(sizeCss * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Shared scale with a cap, so a chair reads smaller than a bed.
    const k = Math.min((sizeCss - 4) / Math.max(def.w, def.d), 0.42);
    const it = { x: 0, y: 0, w: def.w, d: def.d, rot: 0, shape: def.shape, icon: def.icon, blocking: def.blocking };
    drawItem(ctx, it, k, { x: sizeCss / 2, y: sizeCss / 2 }, null, 1, false);
  }

  HP.render = { createRenderer, exportCanvas, drawThumbnail, handles, fmtCm, COLORS: C };
})(window);

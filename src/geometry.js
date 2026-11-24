/* Plan geometry. Lengths are cm, angles are degrees clockwise (y points down, like the screen). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HP = root.HP || {}).geometry = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ELLIPSE_SEGMENTS = 24;
  const ARC_SEGMENTS = 10;
  // Overlaps thinner than this (cm) count as touching, so flush items are not flagged.
  const TOUCH_TOLERANCE = 0.05;
  const L_ARM_CM = 95;        // seat depth of both legs of an L-shaped sofa

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function toRad(deg) { return (deg * Math.PI) / 180; }
  function toDeg(rad) { return (rad * 180) / Math.PI; }

  function normalizeDeg(deg) {
    const d = deg % 360;
    return d < 0 ? d + 360 : d + 0;
  }

  // Exact values at right angles keep axis-aligned furniture free of float dust.
  function cosSin(deg) {
    const d = normalizeDeg(deg);
    if (d === 0) return [1, 0];
    if (d === 90) return [0, 1];
    if (d === 180) return [-1, 0];
    if (d === 270) return [0, -1];
    const r = toRad(d);
    return [Math.cos(r), Math.sin(r)];
  }

  function rotatePoint(p, center, deg) {
    const [cos, sin] = cosSin(deg);
    const dx = p.x - center.x, dy = p.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  }

  /* ---- scale and view ---- */

  function cmToPx(cm, pxPerCm) { return cm * pxPerCm; }
  function pxToCm(px, pxPerCm) { return px / pxPerCm; }

  // Pixels per cm from two clicked image points and the real distance between them.
  function scaleFromPoints(a, b, realCm) {
    const px = distance(a, b);
    if (!(px > 0) || !(realCm > 0)) return null;
    return px / realCm;
  }

  // view = { x, y, scale } maps image pixels to screen pixels; plan cm go through pxPerCm first.
  function planToScreen(p, view, pxPerCm) {
    const k = pxPerCm * view.scale;
    return { x: p.x * k + view.x, y: p.y * k + view.y };
  }

  function screenToPlan(p, view, pxPerCm) {
    const k = pxPerCm * view.scale;
    return { x: (p.x - view.x) / k, y: (p.y - view.y) / k };
  }

  // Zoom by a factor while the content under the given screen point stays put.
  function zoomAt(view, at, factor, minScale, maxScale) {
    const scale = clamp(view.scale * factor, minScale || 0, maxScale || Infinity);
    const k = scale / view.scale;
    return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
  }

  function fitView(contentW, contentH, viewW, viewH, margin) {
    const m = margin || 0;
    const scale = Math.min((viewW - 2 * m) / contentW, (viewH - 2 * m) / contentH);
    return { scale, x: (viewW - contentW * scale) / 2, y: (viewH - contentH * scale) / 2 };
  }

  /* ---- item outlines ---- */

  // A point given in the item's own frame (origin at its center, before rotation).
  function localToPlan(it, lx, ly) {
    const [cos, sin] = cosSin(it.rot || 0);
    return { x: it.x + lx * cos - ly * sin, y: it.y + lx * sin + ly * cos };
  }

  // Corners ordered top-left, top-right, bottom-right, bottom-left of the unrotated item.
  function rectCorners(it) {
    const hw = it.w / 2, hd = it.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => localToPlan(it, lx, ly));
  }

  // Convex outline used for overlap, distance and hit tests.
  function itemPolygon(it) {
    const hw = it.w / 2, hd = it.d / 2;
    if (it.shape === 'ellipse') {
      const pts = [];
      for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
        const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        pts.push(localToPlan(it, hw * Math.cos(t), hd * Math.sin(t)));
      }
      return pts;
    }
    if (it.shape === 'door') {
      // Quarter sector: hinge in a bottom corner, leaf sweeping from closed (bottom edge) to open.
      const side = it.flipped ? -1 : 1;
      const hx = -hw * side;
      const pts = [localToPlan(it, hx, hd)];
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const t = (i / ARC_SEGMENTS) * (Math.PI / 2);
        pts.push(localToPlan(it, hx + side * it.w * Math.cos(t), hd - it.d * Math.sin(t)));
      }
      return pts;
    }
    return rectCorners(it);
  }

  // The two rectangles of an L: the body along the top edge and the return down one side.
  function lParts(it) {
    const hw = it.w / 2, hd = it.d / 2;
    const arm = Math.min(L_ARM_CM, it.w, it.d);
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([lx, ly]) => localToPlan(it, lx, ly));
    const body = rect(-hw, -hd, hw, -hd + arm);
    return it.flipped ? [body, rect(-hw, -hd + arm, -hw + arm, hd)] : [body, rect(hw - arm, -hd + arm, hw, hd)];
  }

  // Keep-clear strip in front of an item, below its bottom edge in its own frame. Null when it needs none.
  function clearancePolygon(it) {
    if (!(it.clear > 0)) return null;
    const hw = it.w / 2, hd = it.d / 2;
    return [[-hw, hd], [hw, hd], [hw, hd + it.clear], [-hw, hd + it.clear]].map(([lx, ly]) => localToPlan(it, lx, ly));
  }

  // Convex pieces of an item's outline. Every shape except the L is a single piece.
  function itemParts(it) { return it.shape === 'lshape' ? lParts(it) : [itemPolygon(it)]; }

  function polygonAABB(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  function itemAABB(it) { return polygonAABB(rectCorners(it)); }

  /* ---- overlap, containment, distance ---- */

  function project(poly, ax, ay) {
    let min = Infinity, max = -Infinity;
    for (const p of poly) {
      const v = p.x * ax + p.y * ay;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return [min, max];
  }

  // Separating axis test for two convex polygons.
  function polygonsOverlap(a, b, tolerance) {
    const tol = tolerance == null ? TOUCH_TOLERANCE : tolerance;
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const len = distance(p, q);
        if (len === 0) continue;
        const ax = -(q.y - p.y) / len, ay = (q.x - p.x) / len;
        const [amin, amax] = project(a, ax, ay);
        const [bmin, bmax] = project(b, ax, ay);
        if (amax - bmin <= tol || bmax - amin <= tol) return false;
      }
    }
    return true;
  }

  function partsOverlap(a, b, tolerance) {
    return a.some((p) => b.some((q) => polygonsOverlap(p, q, tolerance)));
  }

  function itemsOverlap(a, b, tolerance) {
    return partsOverlap(itemParts(a), itemParts(b), tolerance);
  }

  // rect = { x, y, w, h }
  function polygonInsideRect(poly, rect, tolerance) {
    const tol = tolerance == null ? TOUCH_TOLERANCE : tolerance;
    return poly.every((p) => p.x >= rect.x - tol && p.y >= rect.y - tol &&
      p.x <= rect.x + rect.w + tol && p.y <= rect.y + rect.h + tol);
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function closestPointOnSegment(p, a, b) {
    const ex = b.x - a.x, ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / len2, 0, 1);
    return { x: a.x + ex * t, y: a.y + ey * t };
  }

  function pointToPolygonDistance(p, poly) {
    let min = Infinity;
    for (let i = 0; i < poly.length; i++) {
      min = Math.min(min, distance(p, closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length])));
    }
    return min;
  }

  // Shortest gap between two convex outlines and the pair of points that spans it.
  function polygonGap(a, b) {
    if (polygonsOverlap(a, b, 0)) return { dist: 0, a: null, b: null };
    const pairs = [];
    const collect = (verts, poly, vertsAreA) => {
      for (const v of verts) {
        for (let i = 0; i < poly.length; i++) {
          const q = closestPointOnSegment(v, poly[i], poly[(i + 1) % poly.length]);
          pairs.push({ dist: distance(v, q), a: vertsAreA ? v : q, b: vertsAreA ? q : v });
        }
      }
    };
    collect(a, b, true);
    collect(b, a, false);
    let min = Infinity;
    for (const p of pairs) if (p.dist < min) min = p.dist;
    // Facing parallel edges tie along their overlap; the average sits in the middle of it.
    const best = pairs.filter((p) => p.dist - min < 1e-6);
    const avg = (key) => ({
      x: best.reduce((s, p) => s + p[key].x, 0) / best.length,
      y: best.reduce((s, p) => s + p[key].y, 0) / best.length
    });
    return { dist: min, a: avg('a'), b: avg('b') };
  }

  function partsGap(a, b) {
    let best = null;
    for (const p of a) {
      for (const q of b) {
        const gap = polygonGap(p, q);
        if (!best || gap.dist < best.dist) best = gap;
      }
    }
    return best;
  }

  /* ---- snapping ---- */

  function snap(v, step) { return step > 0 ? Math.round(v / step) * step + 0 : v; }
  function snapAngle(deg, step) { return normalizeDeg(snap(deg, step)); }

  // Shifts the item so the top-left of its bounding box lands on the grid.
  function snapPosition(it, step) {
    if (!(step > 0)) return { x: it.x, y: it.y };
    // Bounding box offsets measured from the center, so the result carries no float dust.
    const box = itemAABB(Object.assign({}, it, { x: 0, y: 0 }));
    return { x: snap(it.x + box.minX, step) - box.minX, y: snap(it.y + box.minY, step) - box.minY };
  }

  /* ---- resize and rotate ---- */

  // Drag one corner (0..3, same order as rectCorners) while the opposite corner stays fixed.
  function resizeFromCorner(it, corner, p, opts) {
    const o = opts || {};
    const min = o.min || 1;
    const rot = it.rot || 0;
    const fixed = rectCorners(it)[(corner + 2) % 4];
    const local = rotatePoint(p, fixed, -rot);
    const sx = corner === 1 || corner === 2 ? 1 : -1;
    const sy = corner >= 2 ? 1 : -1;
    let w = (local.x - fixed.x) * sx, d = (local.y - fixed.y) * sy;
    if (o.keepAspect) {
      let s = Math.max(w / it.w, d / it.d);
      if (o.step > 0) s = snap(it.w * s, o.step) / it.w;
      s = Math.max(s, min / Math.min(it.w, it.d));
      w = it.w * s;
      d = it.d * s;
    } else {
      if (o.step > 0) { w = snap(w, o.step); d = snap(d, o.step); }
      w = Math.max(min, w);
      d = Math.max(min, d);
    }
    const center = rotatePoint({ x: fixed.x + (sx * w) / 2, y: fixed.y + (sy * d) / 2 }, fixed, rot);
    return { x: center.x, y: center.y, w, d };
  }

  // Rotate an item about any pivot. With its own center as pivot only the angle changes.
  function rotateAround(it, pivot, deltaDeg) {
    const c = rotatePoint(it, pivot, deltaDeg);
    return { x: c.x, y: c.y, rot: normalizeDeg((it.rot || 0) + deltaDeg) };
  }

  function angleFrom(center, p) { return toDeg(Math.atan2(p.y - center.y, p.x - center.x)); }

  // New rotation while dragging the rotate handle; step 0 means free rotation.
  function rotationFromDrag(startRot, startAngle, currentAngle, step) {
    const rot = startRot + (currentAngle - startAngle);
    return step > 0 ? snapAngle(rot, step) : normalizeDeg(rot);
  }

  return {
    TOUCH_TOLERANCE, L_ARM_CM, clamp, distance, toRad, toDeg, normalizeDeg, cosSin, rotatePoint,
    cmToPx, pxToCm, scaleFromPoints, planToScreen, screenToPlan, zoomAt, fitView,
    localToPlan, rectCorners, itemPolygon, itemParts, clearancePolygon, polygonAABB, itemAABB,
    polygonsOverlap, partsOverlap, itemsOverlap, polygonInsideRect, pointInPolygon,
    closestPointOnSegment, pointToPolygonDistance, polygonGap, partsGap,
    snap, snapAngle, snapPosition, resizeFromCorner, rotateAround, angleFrom, rotationFromDrag
  };
});

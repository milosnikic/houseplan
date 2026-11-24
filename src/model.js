/* Plan model: items in cm in plan coordinates, scale, ordering, conflicts, save format. No DOM here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./geometry.js'), require('./catalog.js'));
  } else {
    root.HP.model = factory(root.HP.geometry, root.HP.catalog);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geo, catalog) {
  'use strict';

  const APP_ID = 'houseplan';
  const VERSION = 1;
  const MIN_SIZE_CM = 5;
  const MAX_SIZE_CM = 3000;
  const MAX_LABEL = 60;

  function round2(v) { return Math.round(v * 100) / 100 + 0; }
  function num(v, fallback) { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
  function validColor(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null; }

  function createPlan() {
    return {
      version: VERSION,
      pxPerCm: 1,           // image pixels per real cm
      calibrated: false,
      calibration: null,    // { a, b } in image px and the real cm between them
      image: null,          // { name, type, width, height }; the pixels live outside the plan
      items: [],            // array order is draw order, last on top
      nextId: 1,
      settings: { snap: true, gridCm: 5, showDistances: true, showElectrical: true, showClearances: false }
    };
  }

  // Cleans numbers and attaches the drawing traits of the item's type. x,y is the item center.
  function normalizeItem(raw) {
    const def = catalog.byType(raw.type);
    return {
      id: raw.id,
      type: def.type,
      label: String(raw.label == null ? def.name : raw.label).slice(0, MAX_LABEL),
      x: round2(num(raw.x, 0)),
      y: round2(num(raw.y, 0)),
      w: round2(geo.clamp(num(raw.w, def.w), MIN_SIZE_CM, MAX_SIZE_CM)),
      d: round2(geo.clamp(num(raw.d, def.d), MIN_SIZE_CM, MAX_SIZE_CM)),
      rot: geo.normalizeDeg(round2(geo.normalizeDeg(num(raw.rot, 0)))),
      locked: !!raw.locked,
      flipped: !!raw.flipped,
      color: validColor(raw.color),
      shape: def.shape,
      icon: def.icon,
      blocking: def.blocking,
      layer: def.layer || null,
      warn: def.warn || null,
      clear: def.clear || 0
    };
  }

  function createItem(plan, def, at, overrides) {
    return normalizeItem(Object.assign({ id: plan.nextId++, type: def.type, label: def.name, x: at.x, y: at.y, w: def.w, d: def.d }, overrides));
  }

  function addItem(plan, item) { plan.items.push(item); return item; }
  function findItem(plan, id) { return plan.items.find((it) => it.id === id) || null; }

  function updateItem(plan, id, patch) {
    const it = findItem(plan, id);
    if (it) Object.assign(it, normalizeItem(Object.assign({}, it, patch)));
    return it;
  }

  function removeItems(plan, ids) {
    const set = new Set(ids);
    plan.items = plan.items.filter((it) => !set.has(it.id));
  }

  // Copies keep their relative order and land on top, shifted by dx, dy.
  function addCopies(plan, sources, dx, dy) {
    return sources.map((src) => addItem(plan, normalizeItem(Object.assign({}, src, {
      id: plan.nextId++, x: src.x + dx, y: src.y + dy, locked: false
    }))));
  }

  function duplicateItems(plan, ids, dx, dy) {
    const set = new Set(ids);
    return addCopies(plan, plan.items.filter((it) => set.has(it.id)), dx, dy);
  }

  function bringToFront(plan, ids) {
    const set = new Set(ids);
    plan.items = plan.items.filter((it) => !set.has(it.id)).concat(plan.items.filter((it) => set.has(it.id)));
  }

  function sendToBack(plan, ids) {
    const set = new Set(ids);
    plan.items = plan.items.filter((it) => set.has(it.id)).concat(plan.items.filter((it) => !set.has(it.id)));
  }

  function movable(plan, ids) {
    const set = new Set(ids);
    return plan.items.filter((it) => set.has(it.id) && !it.locked);
  }

  function nudge(plan, ids, dx, dy) {
    const moved = movable(plan, ids);
    for (const it of moved) { it.x = round2(it.x + dx); it.y = round2(it.y + dy); }
    return moved.length;
  }

  // One item turns about its own center, several turn together about the middle of the group.
  function rotateItems(plan, ids, deltaDeg) {
    const moved = movable(plan, ids);
    if (!moved.length) return 0;
    let pivot = moved[0];
    if (moved.length > 1) {
      const box = geo.polygonAABB(moved.flatMap((it) => geo.rectCorners(it)));
      pivot = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    }
    for (const it of moved) {
      const r = geo.rotateAround(it, pivot, deltaDeg);
      Object.assign(it, normalizeItem(Object.assign({}, it, r)));
    }
    return moved.length;
  }

  /* ---- scale ---- */

  // The image rectangle in cm, or null when there is no image.
  function planRect(plan) {
    if (!plan.image) return null;
    return { x: 0, y: 0, w: plan.image.width / plan.pxPerCm, h: plan.image.height / plan.pxPerCm };
  }

  // Changes the scale. Items stay on the same image pixels and keep their real sizes.
  function setScale(plan, pxPerCm, calibration) {
    if (!(pxPerCm > 0)) return false;
    const k = plan.pxPerCm / pxPerCm;
    for (const it of plan.items) { it.x = round2(it.x * k); it.y = round2(it.y * k); }
    plan.pxPerCm = pxPerCm;
    plan.calibrated = !!calibration;
    plan.calibration = calibration || null;
    return true;
  }

  /* ---- conflicts and distances ---- */

  // Map of item id to { level: 'error' | 'warn', reasons: ['overlap' | 'outside' | 'door'] }.
  function collisions(plan) {
    const flags = new Map();
    const flag = (id, level, reason) => {
      const f = flags.get(id) || { level, reasons: [] };
      if (level === 'error') f.level = 'error';
      if (!f.reasons.includes(reason)) f.reasons.push(reason);
      flags.set(id, f);
    };
    const rect = planRect(plan);
    const shapes = plan.items.map((it) => {
      const parts = geo.itemParts(it);
      return { it, parts, box: geo.polygonAABB(parts.flat()) };
    });
    for (const s of shapes) {
      if (rect && !s.parts.every((p) => geo.polygonInsideRect(p, rect))) flag(s.it.id, 'error', 'outside');
    }
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i], b = shapes[j];
        const solidA = a.it.blocking !== false, solidB = b.it.blocking !== false;
        if (!solidA && !solidB) continue;
        const marker = !solidA ? a : !solidB ? b : null;
        // A door swing or walking route under furniture earns a warning; other markers never conflict.
        if (marker && !marker.it.warn) continue;
        if (a.box.maxX <= b.box.minX || b.box.maxX <= a.box.minX || a.box.maxY <= b.box.minY || b.box.maxY <= a.box.minY) continue;
        if (!geo.partsOverlap(a.parts, b.parts)) continue;
        const level = marker ? 'warn' : 'error', reason = marker ? marker.it.warn : 'overlap';
        flag(a.it.id, level, reason);
        flag(b.it.id, level, reason);
      }
    }
    if (plan.settings.showClearances) {
      for (const s of shapes) {
        const zone = geo.clearancePolygon(s.it);
        if (!zone) continue;
        for (const o of shapes) {
          if (o === s || o.it.blocking === false || !geo.partsOverlap([zone], o.parts)) continue;
          flag(s.it.id, 'warn', 'clearance');
          flag(o.it.id, 'warn', 'clearance');
        }
      }
    }
    return flags;
  }

  // Items in draw order. Electrical symbols go on top, or are left out while their layer is hidden.
  function visibleItems(plan) {
    const base = plan.items.filter((it) => !it.layer);
    return plan.settings.showElectrical === false ? base : base.concat(plan.items.filter((it) => it.layer));
  }

  // Closest solid item to the subject: { other, dist, a, b } with a on the subject, b on the other.
  function nearestItem(plan, subject, excludeIds) {
    const skip = excludeIds || new Set();
    const parts = geo.itemParts(subject);
    let best = null;
    for (const it of plan.items) {
      if (it.id === subject.id || skip.has(it.id) || it.blocking === false) continue;
      const gap = geo.partsGap(parts, geo.itemParts(it));
      if (!best || gap.dist < best.dist) best = { other: it, dist: gap.dist, a: gap.a, b: gap.b };
    }
    return best;
  }

  /* ---- undo snapshots and the save format ---- */

  function snapshot(plan) {
    return JSON.stringify({
      items: plan.items, pxPerCm: plan.pxPerCm, calibrated: plan.calibrated,
      calibration: plan.calibration, nextId: plan.nextId
    });
  }

  function restore(plan, snap) {
    const s = JSON.parse(snap);
    plan.items = s.items;
    plan.pxPerCm = s.pxPerCm;
    plan.calibrated = s.calibrated;
    plan.calibration = s.calibration;
    plan.nextId = s.nextId;
  }

  // Plain object for JSON. Drawing traits are left out, they come back from the type on load.
  function serialize(plan) {
    return {
      app: APP_ID,
      version: VERSION,
      pxPerCm: plan.pxPerCm,
      calibrated: plan.calibrated,
      calibration: plan.calibration,
      image: plan.image,
      settings: Object.assign({}, plan.settings),
      nextId: plan.nextId,
      items: plan.items.map((it) => ({
        id: it.id, type: it.type, label: it.label, x: it.x, y: it.y, w: it.w, d: it.d,
        rot: it.rot, locked: it.locked, flipped: it.flipped, color: it.color
      }))
    };
  }

  function validPoint(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  }

  // Builds a clean plan from parsed JSON. Throws an Error with a readable message on bad input.
  function deserialize(data) {
    if (!data || typeof data !== 'object' || data.app !== APP_ID) throw new Error('This file is not a Houseplan layout.');
    if (!(data.version >= 1)) throw new Error('The layout file has no version.');
    if (data.version > VERSION) throw new Error('This layout was saved by a newer version of Houseplan.');
    if (!Array.isArray(data.items)) throw new Error('The layout file has no item list.');
    if (!(num(data.pxPerCm, 0) > 0)) throw new Error('The layout file has no valid scale.');

    const plan = createPlan();
    plan.pxPerCm = data.pxPerCm;
    const c = data.calibration;
    if (c && validPoint(c.a) && validPoint(c.b) && num(c.cm, 0) > 0) {
      plan.calibration = { a: validPoint(c.a), b: validPoint(c.b), cm: c.cm };
    }
    plan.calibrated = !!data.calibrated && !!plan.calibration;
    const img = data.image;
    if (img && num(img.width, 0) > 0 && num(img.height, 0) > 0) {
      plan.image = {
        name: String(img.name || 'floor plan').slice(0, 200), type: String(img.type || 'image/png'),
        width: img.width, height: img.height
      };
    }
    const s = data.settings || {};
    plan.settings.snap = s.snap !== false;
    plan.settings.showDistances = s.showDistances !== false;
    plan.settings.showElectrical = s.showElectrical !== false;
    plan.settings.showClearances = s.showClearances === true;
    if (num(s.gridCm, 0) > 0) plan.settings.gridCm = s.gridCm;

    const seen = new Set();
    const pending = [];
    for (const raw of data.items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = normalizeItem(raw);
      if (Number.isInteger(raw.id) && raw.id > 0 && !seen.has(raw.id)) seen.add(raw.id);
      else item.id = null;
      pending.push(item);
    }
    let next = Math.max(0, ...seen) + 1;
    for (const item of pending) {
      if (item.id == null) item.id = next++;
      plan.items.push(item);
    }
    plan.nextId = Math.max(next, Number.isInteger(data.nextId) ? data.nextId : 1);
    return plan;
  }

  return {
    APP_ID, VERSION, MIN_SIZE_CM, MAX_SIZE_CM, round2,
    createPlan, createItem, normalizeItem, addItem, findItem, updateItem, removeItems,
    addCopies, duplicateItems, bringToFront, sendToBack, nudge, rotateItems,
    planRect, setScale, collisions, visibleItems, nearestItem, snapshot, restore, serialize, deserialize
  };
});

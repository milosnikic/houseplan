/* UI wiring: tools, pointer and keyboard input, panels, autosave, import and export. */
(function () {
  'use strict';
  const HP = window.HP;
  const geo = HP.geometry, catalog = HP.catalog, model = HP.model, render = HP.render, storage = HP.storage;

  const DRAG_THRESHOLD_PX = 4;       // movement before a press counts as a drag
  const HANDLE_HIT_PX = 10;
  const MIN_SCALE = 0.02, MAX_SCALE = 40;
  const DEFAULT_LONG_SIDE_CM = 1200; // assumed size of a fresh image until the scale is set
  const COPY_OFFSET_CM = 20;
  const ROTATE_STEP_DEG = 15;
  const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
  const IMAGE_NAMES = /\.(png|jpe?g|webp|gif)$/i;

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas'), stage = $('stage'), dialog = $('dialog');
  const renderer = render.createRenderer(canvas);
  const hist = HP.history.createHistory(100);

  const state = {
    plan: model.createPlan(),
    view: { x: 0, y: 0, scale: 1 },
    image: null,           // decoded <img> of the floor plan
    imageBlob: null,       // its original bytes, for autosave and JSON export
    imageStore: 'none',    // where autosave managed to keep the image
    imageIsCopy: false,    // true when only the downscaled autosave copy is in memory
    selection: new Set(),
    collisions: new Map(),
    tool: 'select',        // or 'calibrate'
    calib: null,           // { a, b } in image px while setting the scale
    drag: null,
    pointer: null,
    spaceDown: false,
    clipboard: [],
    pasteCount: 0
  };

  let viewW = 0, viewH = 0;
  let drawQueued = false;
  let saveTimer = null;
  let layoutSaved = { ok: true };
  let lastCommit = { tag: null, time: 0 };
  let toastTimer = null;
  let imageSaveToken = 0;

  /* ---- small helpers ---- */

  const plan = () => state.plan;
  const items = () => state.plan.items;
  const visibleItems = () => model.visibleItems(state.plan);
  const itemById = (id) => model.findItem(state.plan, id);
  const selectedItems = () => items().filter((it) => state.selection.has(it.id));
  const singleSelected = () => (state.selection.size === 1 ? selectedItems()[0] || null : null);
  const screenPerCm = () => state.plan.pxPerCm * state.view.scale;
  const toPlan = (p) => geo.screenToPlan(p, state.view, state.plan.pxPerCm);
  const toImagePx = (p) => ({ x: (p.x - state.view.x) / state.view.scale, y: (p.y - state.view.y) / state.view.scale });
  const dist = geo.distance;
  const gridStep = () => state.plan.settings.gridCm;

  function eventPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Snapping is on by setting and Alt switches it off for as long as it is held.
  function snapOn(e) { return state.plan.settings.snap && !(e && e.altKey); }

  function isTextTarget(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'color', 'file', 'range'].includes(el.type);
  }

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      renderer.draw(scene());
    });
  }

  function scene() {
    const single = singleSelected();
    return {
      plan: state.plan, view: state.view, image: state.image,
      selection: state.selection, collisions: state.collisions,
      width: viewW, height: viewH,
      handlesFor: single && !single.locked && state.tool === 'select' ? single.id : null,
      nearest: nearestForDisplay(),
      calib: state.tool === 'calibrate' ? calibrationOverlay() : null
    };
  }

  // The gap line shows while an item is being dragged, and for a resting selection if switched on.
  function nearestForDisplay() {
    const d = state.drag;
    const live = d && ((d.kind === 'move' && d.moved && d.primary != null) || d.kind === 'resize' || d.kind === 'rotate');
    if (!live && !state.plan.settings.showDistances) return null;
    if (state.tool !== 'select') return null;
    const subject = live && d.kind === 'move' ? itemById(d.primary) : singleSelected();
    return subject ? model.nearestItem(state.plan, subject, state.selection) : null;
  }

  function calibrationOverlay() {
    const c = state.calib || {};
    let b = c.b;
    if (c.a && !b && state.pointer) b = constrained(c.a, toImagePx(state.pointer), state.shiftDown);
    return { a: c.a, b, saved: state.plan.calibration };
  }

  // With Shift the calibration line stays horizontal or vertical.
  function constrained(a, b, on) {
    if (!on) return b;
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  }

  /* ---- change bookkeeping ---- */

  function pruneSelection() {
    for (const id of [...state.selection]) if (!itemById(id)) state.selection.delete(id);
  }

  // Refresh everything derived from the model, without touching history.
  function modelChanged() {
    state.collisions = model.collisions(state.plan);
    refreshPanels();
    requestDraw();
  }

  // A finished edit: one undo step and an autosave. Equal tags in quick succession merge.
  function commit(tag) {
    pruneSelection();
    const snap = model.snapshot(state.plan);
    const now = Date.now();
    if (tag && tag === lastCommit.tag && now - lastCommit.time < 1000) hist.replace(snap);
    else hist.push(snap);
    lastCommit = { tag: tag || null, time: now };
    scheduleSave();
    modelChanged();
  }

  function applyHistory(snap) {
    if (!snap) return;
    model.restore(state.plan, snap);
    lastCommit = { tag: null, time: 0 };
    pruneSelection();
    scheduleSave();
    modelChanged();
  }

  function undo() { if (!state.drag) applyHistory(hist.undo()); }
  function redo() { if (!state.drag) applyHistory(hist.redo()); }

  function select(ids) {
    state.selection = new Set(ids);
    selectionChanged();
  }

  function selectionChanged() {
    refreshPanels();
    requestDraw();
  }

  /* ---- autosave ---- */

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    layoutSaved = storage.saveLayout(JSON.stringify(model.serialize(state.plan)));
    refreshSaveStatus();
  }

  async function persistImage() {
    const token = ++imageSaveToken;
    const res = await storage.saveImage(state.imageBlob, state.image);
    if (token !== imageSaveToken) return;
    state.imageStore = res.where;
    refreshSaveStatus();
  }

  function refreshSaveStatus() {
    const el = $('status-save');
    let text = 'Saved in this browser', alert = false;
    if (!layoutSaved.ok) {
      text = 'Could not save in this browser (' + layoutSaved.error + '). Use Export JSON to keep your work.';
      alert = true;
    } else if (state.plan.image && !state.image) {
      text = 'Layout saved. The plan image is not stored in this browser, open it again.';
    } else if (state.plan.image && state.imageStore === 'copy') {
      text = 'Saved in this browser, the image as a smaller copy.' + (state.imageIsCopy ? '' : ' Export JSON now to keep the original.');
    } else if (state.plan.image && state.imageStore === 'none') {
      text = 'Layout saved, but the image did not fit in browser storage. Use Export JSON to keep both.';
      alert = true;
    }
    el.textContent = text;
    el.classList.toggle('alert', alert);
  }

  /* ---- view ---- */

  function viewChanged() {
    $('zoom-readout').textContent = Math.round(state.view.scale * 100) + '%';
    requestDraw();
  }

  function fitToScreen() {
    if (!viewW || !viewH) return;
    const p = state.plan;
    if (p.image) {
      state.view = geo.fitView(p.image.width, p.image.height, viewW, viewH, 24);
    } else if (p.items.length) {
      const box = geo.polygonAABB(p.items.flatMap((it) => geo.rectCorners(it)));
      const m = 100 * p.pxPerCm;
      const w = (box.maxX - box.minX) * p.pxPerCm + 2 * m, h = (box.maxY - box.minY) * p.pxPerCm + 2 * m;
      const v = geo.fitView(w, h, viewW, viewH, 24);
      state.view = { scale: v.scale, x: v.x - (box.minX * p.pxPerCm - m) * v.scale, y: v.y - (box.minY * p.pxPerCm - m) * v.scale };
    } else {
      state.view = { scale: 1, x: 0, y: 0 };
    }
    state.view.scale = geo.clamp(state.view.scale, MIN_SCALE, MAX_SCALE);
    viewChanged();
  }

  function zoomBy(factor, at) {
    state.view = geo.zoomAt(state.view, at || { x: viewW / 2, y: viewH / 2 }, factor, MIN_SCALE, MAX_SCALE);
    viewChanged();
  }

  function resizeCanvas() {
    const r = stage.getBoundingClientRect();
    const first = viewW === 0;
    viewW = r.width;
    viewH = r.height;
    renderer.resize(viewW, viewH, window.devicePixelRatio || 1);
    if (first) fitToScreen();
    requestDraw();
  }

  /* ---- hit testing ---- */

  function hitItem(planPt) {
    const slack = 4 / screenPerCm();
    const list = visibleItems();
    for (let i = list.length - 1; i >= 0; i--) {
      const parts = geo.itemParts(list[i]);
      if (parts.some((poly) => geo.pointInPolygon(planPt, poly) || geo.pointToPolygonDistance(planPt, poly) <= slack)) return list[i];
    }
    return null;
  }

  function hitHandle(p, touch) {
    const it = singleSelected();
    if (!it || it.locked || state.tool !== 'select') return null;
    const k = screenPerCm();
    const h = render.handles(it, k, state.view);
    // Small items keep a draggable middle: the handle targets shrink with them.
    const reach = geo.clamp(Math.min(it.w, it.d) * k / 3, 5, touch ? 18 : HANDLE_HIT_PX);
    if (dist(p, h.rotate) <= (touch ? 18 : HANDLE_HIT_PX)) return { kind: 'rotate' };
    for (let i = 0; i < 4; i++) if (dist(p, h.corners[i]) <= reach) return { kind: 'resize', corner: i };
    return null;
  }

  function resizeCursor(it, corner) {
    const c = geo.rectCorners(it)[corner];
    const a = geo.normalizeDeg(geo.angleFrom(it, c)) % 180;
    if (a < 22.5 || a >= 157.5) return 'ew-resize';
    if (a < 67.5) return 'nwse-resize';
    if (a < 112.5) return 'ns-resize';
    return 'nesw-resize';
  }

  function updateCursor(p) {
    let c = 'default';
    const d = state.drag;
    if (d && d.kind === 'pan' && (d.moved || state.spaceDown)) c = 'grabbing';
    else if (d && d.kind === 'rotate') c = 'grabbing';
    else if (state.spaceDown) c = 'grab';
    else if (state.tool === 'calibrate') c = 'crosshair';
    else if (p && !d) {
      const h = hitHandle(p);
      if (h) c = h.kind === 'rotate' ? 'grab' : resizeCursor(singleSelected(), h.corner);
      else {
        const it = hitItem(toPlan(p));
        if (it && !it.locked) c = 'move';
      }
    } else if (d && d.kind === 'move') c = 'move';
    canvas.style.cursor = c;
  }

  /* ---- pointer input ---- */

  const touches = new Map();   // active touch points, for pinch zoom
  let pinch = null;

  function startDrag(e, p) {
    const planPt = toPlan(p);
    if (e.button === 1 || state.spaceDown) {
      state.drag = { kind: 'pan', start: p, view0: state.view, moved: false };
      return;
    }
    if (state.tool === 'calibrate') {
      state.drag = { kind: 'pan', start: p, view0: state.view, moved: false, calibrate: true };
      return;
    }
    const handle = hitHandle(p, e.pointerType === 'touch');
    if (handle) {
      const it = singleSelected();
      state.drag = handle.kind === 'rotate'
        ? { kind: 'rotate', id: it.id, orig: Object.assign({}, it), startAngle: geo.angleFrom(it, planPt) }
        : { kind: 'resize', id: it.id, orig: Object.assign({}, it), corner: handle.corner };
      return;
    }
    const hit = hitItem(planPt);
    if (!hit) {
      state.drag = { kind: 'pan', start: p, view0: state.view, moved: false, deselect: !e.shiftKey };
      return;
    }
    if (e.shiftKey) {
      if (state.selection.has(hit.id)) state.selection.delete(hit.id);
      else state.selection.add(hit.id);
      selectionChanged();
      return;
    }
    const wasSelected = state.selection.has(hit.id);
    if (!wasSelected) select([hit.id]);
    const movers = hit.locked ? [] : selectedItems().filter((it) => !it.locked);
    state.drag = {
      kind: 'move', start: p, startPlan: planPt, moved: false,
      primary: hit.locked ? null : hit.id,
      origins: movers.map((it) => ({ id: it.id, x: it.x, y: it.y })),
      // A plain click on one item of a group narrows the selection to it.
      narrowTo: wasSelected && state.selection.size > 1 ? hit.id : null
    };
  }

  function dragMove(e, p) {
    const d = state.drag;
    if (d.kind === 'pan') {
      if (!d.moved && dist(p, d.start) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      state.view = { scale: d.view0.scale, x: d.view0.x + p.x - d.start.x, y: d.view0.y + p.y - d.start.y };
      viewChanged();
    } else if (d.kind === 'move') {
      if (!d.moved && dist(p, d.start) < DRAG_THRESHOLD_PX) return;
      if (!d.origins.length) return;
      d.moved = true;
      const cur = toPlan(p);
      let dx = cur.x - d.startPlan.x, dy = cur.y - d.startPlan.y;
      if (snapOn(e)) {
        // Snap the item under the pointer and carry the rest of the selection along.
        const o = d.origins.find((x) => x.id === d.primary);
        const s = geo.snapPosition(Object.assign({}, itemById(d.primary), { x: o.x + dx, y: o.y + dy }), gridStep());
        dx = s.x - o.x;
        dy = s.y - o.y;
      }
      for (const o of d.origins) {
        const it = itemById(o.id);
        it.x = model.round2(o.x + dx);
        it.y = model.round2(o.y + dy);
      }
      modelChanged();
    } else if (d.kind === 'resize') {
      const keepAspect = catalog.byType(d.orig.type).keepAspect || e.shiftKey;
      const r = geo.resizeFromCorner(d.orig, d.corner, toPlan(p), {
        step: snapOn(e) ? gridStep() : 0, min: model.MIN_SIZE_CM, keepAspect
      });
      model.updateItem(state.plan, d.id, r);
      d.changed = true;
      modelChanged();
    } else if (d.kind === 'rotate') {
      const angle = geo.angleFrom(d.orig, toPlan(p));
      const rot = geo.rotationFromDrag(d.orig.rot, d.startAngle, angle, e.shiftKey ? 0 : ROTATE_STEP_DEG);
      model.updateItem(state.plan, d.id, { rot });
      d.changed = true;
      modelChanged();
    }
  }

  function endDrag(e, p) {
    const d = state.drag;
    state.drag = null;
    if (!d) return;
    if (d.kind === 'move') {
      if (d.moved) commit();
      else if (d.narrowTo != null) select([d.narrowTo]);
    } else if (d.kind === 'resize' || d.kind === 'rotate') {
      if (d.changed) commit();
    } else if (d.kind === 'pan' && !d.moved) {
      if (d.calibrate) placeCalibrationPoint(p, e.shiftKey);
      else if (d.deselect && state.selection.size) select([]);
    }
    updateCursor(p);
    requestDraw();
  }

  // Abandon the gesture and put the items back where they were.
  function cancelDrag() {
    const d = state.drag;
    state.drag = null;
    if (!d) return;
    if (d.kind === 'move') {
      for (const o of d.origins) { const it = itemById(o.id); if (it) { it.x = o.x; it.y = o.y; } }
    } else if (d.kind === 'resize' || d.kind === 'rotate') {
      const it = itemById(d.id);
      if (it) Object.assign(it, d.orig);
    } else if (d.kind === 'pan') {
      state.view = d.view0;
      viewChanged();
    }
    modelChanged();
    updateCursor();
  }

  function pinchPoints() {
    const [a, b] = [...touches.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.max(1, dist(a, b)) };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    const p = eventPoint(e);
    state.pointer = p;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p);
      if (touches.size === 2) {
        cancelDrag();
        pinch = Object.assign(pinchPoints(), { view0: state.view });
        return;
      }
      if (touches.size > 2) return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    startDrag(e, p);
    updateCursor(p);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = eventPoint(e);
    state.pointer = p;
    state.shiftDown = e.shiftKey;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, p);
      if (pinch && touches.size === 2) {
        // Zoom about where the fingers started, then follow them as they travel.
        const now = pinchPoints();
        const v = geo.zoomAt(pinch.view0, pinch.mid, now.spread / pinch.spread, MIN_SCALE, MAX_SCALE);
        state.view = { scale: v.scale, x: v.x + now.mid.x - pinch.mid.x, y: v.y + now.mid.y - pinch.mid.y };
        viewChanged();
        return;
      }
    }
    refreshPointerStatus(p);
    if (state.drag) dragMove(e, p);
    else {
      updateCursor(p);
      if (state.tool === 'calibrate') requestDraw();
    }
  });

  function pointerDone(e, cancelled) {
    const p = eventPoint(e);
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) {
        if (touches.size < 2) pinch = null;
        return;
      }
    }
    if (cancelled) cancelDrag();
    else endDrag(e, p);
  }

  canvas.addEventListener('pointerup', (e) => pointerDone(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerDone(e, true));
  canvas.addEventListener('pointerleave', () => { $('status-pos').textContent = ''; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // A trackpad pinch arrives as a wheel event with ctrlKey set and small deltas.
    const speed = e.ctrlKey ? 0.01 : 0.0015;
    zoomBy(Math.exp(-e.deltaY * unit * speed), eventPoint(e));
  }, { passive: false });

  // Safari reports trackpad pinches as gesture events instead of ctrl+wheel.
  let gesture = null;
  canvas.addEventListener('gesturestart', (e) => { e.preventDefault(); gesture = { view0: state.view, at: eventPoint(e) }; });
  canvas.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (!gesture) return;
    state.view = geo.zoomAt(gesture.view0, gesture.at, e.scale, MIN_SCALE, MAX_SCALE);
    viewChanged();
  });
  canvas.addEventListener('gestureend', (e) => { e.preventDefault(); gesture = null; });

  /* ---- editing actions ---- */

  function addAtCenter(def, overrides) {
    const p = state.plan;
    const it = model.createItem(p, def, toPlan({ x: viewW / 2, y: viewH / 2 }), overrides);
    if (p.settings.snap) Object.assign(it, geo.snapPosition(it, gridStep()));
    // Step aside when an earlier item already sits on this exact spot.
    while (p.items.some((o) => Math.abs(o.x - it.x) < 1 && Math.abs(o.y - it.y) < 1)) {
      it.x += COPY_OFFSET_CM;
      it.y += COPY_OFFSET_CM;
    }
    model.addItem(p, it);
    if (def.under) model.sendToBack(p, [it.id]);
    if (def.layer === 'electrical') p.settings.showElectrical = true;
    syncSettingsControls();
    state.selection = new Set([it.id]);
    commit();
    return it;
  }

  function deleteSelected() {
    const sel = selectedItems();
    const removable = sel.filter((it) => !it.locked);
    if (!removable.length) {
      if (sel.length) toast('Locked items stay. Unlock them to delete.');
      return;
    }
    model.removeItems(state.plan, removable.map((it) => it.id));
    if (removable.length < sel.length) toast('Locked items were kept.');
    commit();
  }

  function duplicateSelected() {
    if (!state.selection.size) return;
    const copies = model.duplicateItems(state.plan, [...state.selection], COPY_OFFSET_CM, COPY_OFFSET_CM);
    state.selection = new Set(copies.map((c) => c.id));
    commit();
  }

  function copySelected() {
    if (!state.selection.size) return;
    state.clipboard = selectedItems().map((it) => Object.assign({}, it));
    state.pasteCount = 0;
    toast(state.clipboard.length === 1 ? 'Copied 1 item' : 'Copied ' + state.clipboard.length + ' items');
  }

  function paste() {
    if (!state.clipboard.length) return;
    state.pasteCount++;
    const off = COPY_OFFSET_CM * state.pasteCount;
    const copies = model.addCopies(state.plan, state.clipboard, off, off);
    state.selection = new Set(copies.map((c) => c.id));
    commit();
  }

  function nudgeSelected(dx, dy) {
    if (model.nudge(state.plan, [...state.selection], dx, dy)) commit('nudge:' + [...state.selection].join(','));
  }

  function rotateSelected(delta) {
    if (model.rotateItems(state.plan, [...state.selection], delta)) commit();
  }

  function reorderSelected(toFront) {
    if (!state.selection.size) return;
    (toFront ? model.bringToFront : model.sendToBack)(state.plan, [...state.selection]);
    commit();
  }

  function setLocked(locked) {
    const sel = selectedItems();
    if (!sel.length) return;
    for (const it of sel) it.locked = locked;
    commit();
  }

  function flipSelected() {
    const sel = selectedItems().filter((it) => !it.locked);
    if (!sel.length) return;
    for (const it of sel) it.flipped = !it.flipped;
    commit();
  }

  /* ---- scale calibration ---- */

  function startCalibration() {
    if (!state.plan.image || !state.image) { toast('Open a floor plan image first.'); return; }
    cancelDrag();
    state.tool = 'calibrate';
    state.calib = { a: null, b: null };
    showBanner('Click one end of a wall whose length you know.', 'Cancel', stopCalibration);
    refreshPanels();
    updateCursor();
    requestDraw();
  }

  function stopCalibration() {
    if (state.tool !== 'calibrate') return;
    state.tool = 'select';
    state.calib = null;
    hideBanner();
    showScaleReminder();
    refreshPanels();
    updateCursor();
    requestDraw();
  }

  async function placeCalibrationPoint(p, shift) {
    const c = state.calib;
    if (!c || c.b) return;
    const at = toImagePx(p);
    if (!c.a) {
      c.a = at;
      showBanner('Now click the other end. Hold Shift to keep the line straight.', 'Cancel', stopCalibration);
      requestDraw();
      return;
    }
    c.b = constrained(c.a, at, shift);
    requestDraw();
    const px = dist(c.a, c.b);
    if (px < 2) { c.b = null; return; }
    const pl = state.plan;
    const current = px / pl.pxPerCm;
    const cm = await ask({
      title: 'How long is this line?',
      text: pl.calibrated
        ? 'The line is ' + Math.round(px) + ' px long. At the current scale that is ' + render.fmtCm(current) + '.'
        : 'The line is ' + Math.round(px) + ' px long. Type its real length to set the scale.',
      field: { label: 'Real length, cm', value: pl.calibrated ? Math.round(current * 10) / 10 : '' },
      okLabel: 'Set scale'
    });
    if (state.tool !== 'calibrate' || state.calib !== c) return;
    if (cm == null) { stopCalibration(); return; }
    model.setScale(pl, geo.scaleFromPoints(c.a, c.b, cm), { a: c.a, b: c.b, cm });
    stopCalibration();
    commit();
    toast('Scale set: 1 cm is ' + pl.pxPerCm.toFixed(2) + ' px on the image.');
  }

  function showScaleReminder() {
    const p = state.plan;
    if (p.image && state.image && !p.calibrated && state.tool === 'select') {
      showBanner('Sizes are a guess until you set the scale.', 'Set scale', startCalibration);
    } else if (state.tool === 'select') {
      hideBanner();
    }
  }

  /* ---- plan image, import and export ---- */

  async function decodeImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function openImage(file) {
    // Some drag sources give no MIME type, so the file name decides then.
    const known = file.type ? IMAGE_TYPES.test(file.type) : IMAGE_NAMES.test(file.name || '');
    if (!known) { toast('That file is not a PNG, JPG, WebP or GIF image.'); return; }
    let img;
    try { img = await decodeImage(file); } catch (err) { toast('The image could not be read.'); return; }
    const p = state.plan;
    // Same pixel size means the same plan was opened again, so its scale still holds.
    const same = p.image && p.image.width === img.naturalWidth && p.image.height === img.naturalHeight;
    if (p.image && !same && p.items.length) {
      const ok = await ask({
        title: 'Replace the floor plan?',
        text: 'Your furniture stays where it is on the image. The scale has to be set again for the new plan.',
        okLabel: 'Replace'
      });
      if (!ok) return;
    }
    stopCalibration();
    if (!same) model.setScale(p, Math.max(img.naturalWidth, img.naturalHeight) / DEFAULT_LONG_SIDE_CM, null);
    p.image = { name: file.name || 'floor plan', type: file.type || 'image/png', width: img.naturalWidth, height: img.naturalHeight };
    state.image = img;
    state.imageBlob = file;
    state.imageIsCopy = false;
    hist.reset(model.snapshot(p));     // swapping the image is not an undo step
    fitToScreen();
    saveNow();
    modelChanged();
    showScaleReminder();
    persistImage();
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // The layout plus the image as a data URL, so one file restores the whole plan.
  async function exportJson() {
    const data = model.serialize(state.plan);
    if (state.imageBlob) {
      try { data.imageData = await storage.blobToDataUrl(state.imageBlob); }
      catch (err) { toast('The image could not be added to the file.'); }
    }
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'houseplan-layout.json');
    toast('Exported houseplan-layout.json');
  }

  async function importJson(file) {
    let data, next;
    try { data = JSON.parse(await file.text()); } catch (err) { toast('That file is not valid JSON.'); return; }
    try { next = model.deserialize(data); } catch (err) { toast(err.message); return; }
    if (state.plan.items.length || state.plan.image) {
      const ok = await ask({ title: 'Replace the current plan?', text: 'The layout from the file takes the place of what is on screen now.', okLabel: 'Replace' });
      if (!ok) return;
    }
    let img = null, blob = null;
    if (next.image && data.imageData) {
      blob = storage.dataUrlToBlob(data.imageData);
      try { if (blob) img = await decodeImage(blob); } catch (err) { img = null; }
      if (!img) { blob = null; toast('The layout was loaded, but its image could not be read.'); }
    }
    stopCalibration();
    state.plan = next;
    state.image = img;
    state.imageBlob = blob;
    state.imageStore = 'none';
    state.imageIsCopy = false;
    state.selection = new Set();
    hist.reset(model.snapshot(next));
    syncSettingsControls();
    fitToScreen();
    saveNow();
    modelChanged();
    showScaleReminder();
    if (blob) persistImage();
    else { imageSaveToken++; storage.clearImage().then(refreshSaveStatus); }
    const loaded = 'Layout loaded: ' + next.items.length + (next.items.length === 1 ? ' item' : ' items');
    if (img || !next.image) toast(loaded);
    else if (!data.imageData) toast(loaded + '. The file has no plan image, open the image to see it.');
  }

  function exportPng() {
    const out = render.exportCanvas(state.plan, state.image);
    if (!out) { toast('There is nothing to export yet.'); return; }
    try {
      out.toBlob((blob) => {
        if (!blob) { toast('The PNG could not be created.'); return; }
        download(blob, 'houseplan.png');
        toast('Exported houseplan.png (' + out.width + ' × ' + out.height + ' px)');
      }, 'image/png');
    } catch (err) {
      toast('The browser blocked the PNG export: ' + err.message);
    }
  }

  async function newPlan() {
    if (state.plan.items.length || state.plan.image) {
      const ok = await ask({ title: 'Start a new plan?', text: 'This removes the floor plan image and all furniture from this browser. Export JSON first if you want to keep them.', okLabel: 'Start new' });
      if (!ok) return;
    }
    stopCalibration();
    state.plan = model.createPlan();
    state.image = null;
    state.imageBlob = null;
    state.imageStore = 'none';
    state.selection = new Set();
    imageSaveToken++;
    hist.reset(model.snapshot(state.plan));
    syncSettingsControls();
    fitToScreen();
    saveNow();
    modelChanged();
    showScaleReminder();
    storage.clearImage();
  }

  function openFile(file) {
    if (!file) return;
    if (file.type === 'application/json' || /\.json$/i.test(file.name)) importJson(file);
    else openImage(file);
  }

  /* ---- dialog, banner, toast ---- */

  // Modal question. Resolves to the number typed, true for a plain OK, or null when cancelled.
  function ask(opts) {
    return new Promise((resolve) => {
      const input = $('dialog-input'), error = $('dialog-error');
      $('dialog-title').textContent = opts.title;
      $('dialog-text').textContent = opts.text || '';
      $('dialog-ok').textContent = opts.okLabel || 'OK';
      $('dialog-field').hidden = !opts.field;
      error.hidden = true;
      if (opts.field) {
        $('dialog-label').textContent = opts.field.label;
        input.value = opts.field.value;
      }
      const finish = (value) => {
        if (dialog.open) dialog.close();
        canvas.focus({ preventScroll: true });
        resolve(value);
      };
      $('dialog-form').onsubmit = (e) => {
        e.preventDefault();
        if (!opts.field) { finish(true); return; }
        const v = input.valueAsNumber;
        if (!(v > 0)) {
          error.textContent = 'Type a length greater than zero.';
          error.hidden = false;
          input.focus();
          return;
        }
        finish(v);
      };
      $('dialog-cancel').onclick = () => finish(null);
      dialog.oncancel = (e) => { e.preventDefault(); finish(null); };
      dialog.showModal();
      if (opts.field) { input.focus(); input.select(); } else $('dialog-ok').focus();
    });
  }

  function showBanner(text, actionLabel, action) {
    $('banner-text').textContent = text;
    $('banner-action').textContent = actionLabel;
    $('banner-action').onclick = action;
    $('banner').hidden = false;
  }

  function hideBanner() { $('banner').hidden = true; }

  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  /* ---- panels ---- */

  const FLAG_TEXT = {
    overlap: 'Overlaps another item', outside: 'Sits outside the plan', door: 'In the way of a door swing',
    route: 'Furniture stands on a walking route', clearance: 'The clear space in front of an item is blocked'
  };
  const flagText = (reason, one) => (reason === 'door' && one && one.shape === 'door' ? 'Furniture is in the way of this door' : FLAG_TEXT[reason]);

  function setValue(id, value) {
    const el = $(id);
    if (document.activeElement !== el || el.disabled) el.value = value;
  }

  function refreshPanels() {
    const p = state.plan;
    const sel = selectedItems();
    const one = sel.length === 1 ? sel[0] : null;

    $('insp-none').hidden = sel.length > 0;
    $('insp-selection').hidden = sel.length === 0;
    $('insp-fields').hidden = !one;
    if (sel.length) {
      $('insp-title').textContent = one ? catalog.byType(one.type).name : sel.length + ' items selected';
      const flags = sel.map((it) => state.collisions.get(it.id)).filter(Boolean);
      const flagEl = $('insp-flag');
      flagEl.hidden = flags.length === 0;
      if (flags.length) {
        const reasons = [...new Set(flags.flatMap((f) => f.reasons))];
        flagEl.textContent = reasons.map((r) => flagText(r, one)).join('. ') + '.';
        flagEl.classList.toggle('soft', flags.every((f) => f.level === 'warn'));
      }
      const allLocked = sel.every((it) => it.locked);
      $('f-locked').checked = allLocked;
      $('f-locked').indeterminate = !allLocked && sel.some((it) => it.locked);
      $('btn-flip').hidden = !sel.some((it) => it.shape === 'door' || it.shape === 'lshape');
      for (const id of ['btn-rotate', 'btn-flip', 'btn-delete']) $(id).disabled = allLocked;
    }
    if (one) {
      setValue('f-label', one.label);
      setValue('f-x', one.x);
      setValue('f-y', one.y);
      setValue('f-w', one.w);
      setValue('f-d', one.d);
      setValue('f-rot', one.rot);
      $('f-color').value = one.color || '#e6ecee';
      $('btn-color-reset').disabled = !one.color;
      for (const id of ['f-x', 'f-y', 'f-w', 'f-d', 'f-rot']) $(id).disabled = one.locked;
    }

    const rect = model.planRect(p);
    $('plan-image').textContent = p.image ? p.image.name : 'None';
    $('plan-size').textContent = rect ? Math.round(rect.w) + ' × ' + Math.round(rect.h) + ' cm' + (p.calibrated ? '' : ' (guess)') : 'No image';
    $('plan-scale').textContent = p.calibrated
      ? '1 cm = ' + p.pxPerCm.toFixed(3) + ' px, from a ' + render.fmtCm(p.calibration.cm) + ' line'
      : 'Not set';
    const conflicts = [...state.collisions.values()].filter((f) => f.level === 'error').length;
    $('plan-items').textContent = p.items.length + (conflicts ? ', ' + conflicts + ' in conflict' : '');

    const readout = $('scale-readout');
    readout.textContent = !p.image ? '' : p.calibrated ? '1 cm = ' + p.pxPerCm.toFixed(2) + ' px' : 'Scale not set';
    readout.classList.toggle('alert', !!p.image && !p.calibrated);
    $('btn-scale').disabled = !p.image || !state.image;
    $('btn-scale').setAttribute('aria-pressed', String(state.tool === 'calibrate'));
    $('btn-undo').disabled = !hist.canUndo();
    $('btn-redo').disabled = !hist.canRedo();
    $('empty-state').hidden = !!p.image || p.items.length > 0;
  }

  function refreshPointerStatus(p) {
    const at = toPlan(p);
    $('status-pos').textContent = 'x ' + Math.round(at.x) + ' cm, y ' + Math.round(at.y) + ' cm';
  }

  function syncSettingsControls() {
    $('chk-snap').checked = state.plan.settings.snap;
    $('chk-distance').checked = state.plan.settings.showDistances;
    $('chk-clearance').checked = state.plan.settings.showClearances;
    $('chk-electrical').checked = state.plan.settings.showElectrical;
  }

  function buildLibrary() {
    const host = $('library-list');
    for (const cat of catalog.CATEGORIES) {
      const group = document.createElement('details');
      group.open = true;
      const title = document.createElement('summary');
      title.textContent = cat.name;
      title.addEventListener('click', backToCanvas);
      const list = document.createElement('div');
      list.className = 'lib-items';
      for (const def of catalog.TYPES.filter((t) => t.category === cat.id)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lib-item';
        btn.dataset.type = def.type;
        btn.title = 'Add ' + def.name + ' to the middle of the view';
        const thumb = document.createElement('canvas');
        thumb.className = 'lib-thumb';
        render.drawThumbnail(thumb, def, 42);
        const name = document.createElement('span');
        name.className = 'lib-name';
        name.textContent = def.name;
        const size = document.createElement('span');
        size.className = 'lib-size';
        size.textContent = catalog.sizeText(def);
        btn.append(thumb, name, size);
        btn.addEventListener('click', (e) => { addAtCenter(def); backToCanvas(e); });
        list.appendChild(btn);
      }
      group.append(title, list);
      host.appendChild(group);
    }
  }

  // After a mouse click on a control the canvas takes focus back, so shortcuts keep working.
  function backToCanvas(e) {
    if (e && e.detail > 0) canvas.focus({ preventScroll: true });
  }

  function onClick(id, fn) {
    $(id).addEventListener('click', (e) => { fn(); backToCanvas(e); });
  }

  function bindNumberField(id, key) {
    $(id).addEventListener('change', () => {
      const it = singleSelected();
      const v = $(id).valueAsNumber;
      if (!it || it.locked || !Number.isFinite(v)) { $(id).blur(); refreshPanels(); return; }
      model.updateItem(state.plan, it.id, { [key]: v });
      $(id).value = itemById(it.id)[key];
      commit();
    });
  }

  function bindControls() {
    onClick('btn-open', () => $('file-image').click());
    onClick('btn-open-empty', () => $('file-image').click());
    onClick('btn-scale', () => (state.tool === 'calibrate' ? stopCalibration() : startCalibration()));
    onClick('btn-undo', undo);
    onClick('btn-redo', redo);
    onClick('btn-zoom-in', () => zoomBy(1.25));
    onClick('btn-zoom-out', () => zoomBy(1 / 1.25));
    onClick('btn-fit', fitToScreen);
    onClick('btn-export-png', exportPng);
    onClick('btn-export-json', exportJson);
    onClick('btn-import-json', () => $('file-json').click());
    onClick('btn-new', newPlan);
    onClick('btn-rotate', () => rotateSelected(90));
    onClick('btn-flip', flipSelected);
    onClick('btn-front', () => reorderSelected(true));
    onClick('btn-back', () => reorderSelected(false));
    onClick('btn-duplicate', duplicateSelected);
    onClick('btn-delete', deleteSelected);

    $('file-image').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });
    $('file-json').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });

    $('chk-snap').addEventListener('change', (e) => { state.plan.settings.snap = e.target.checked; scheduleSave(); canvas.focus({ preventScroll: true }); });
    $('chk-distance').addEventListener('change', (e) => { state.plan.settings.showDistances = e.target.checked; scheduleSave(); requestDraw(); canvas.focus({ preventScroll: true }); });
    $('chk-clearance').addEventListener('change', (e) => { state.plan.settings.showClearances = e.target.checked; scheduleSave(); modelChanged(); canvas.focus({ preventScroll: true }); });
    $('chk-electrical').addEventListener('change', (e) => {
      state.plan.settings.showElectrical = e.target.checked;
      const shown = new Set(visibleItems().map((it) => it.id));
      state.selection = new Set([...state.selection].filter((id) => shown.has(id)));
      scheduleSave();
      modelChanged();
      canvas.focus({ preventScroll: true });
    });

    bindNumberField('f-x', 'x');
    bindNumberField('f-y', 'y');
    bindNumberField('f-w', 'w');
    bindNumberField('f-d', 'd');
    bindNumberField('f-rot', 'rot');

    // Label and color preview while typing or picking, and become one undo step when done.
    $('f-label').addEventListener('input', (e) => { const it = singleSelected(); if (it) { it.label = e.target.value.slice(0, 60); requestDraw(); } });
    $('f-label').addEventListener('change', () => { if (singleSelected()) commit(); });
    $('f-color').addEventListener('input', (e) => { const it = singleSelected(); if (it) { it.color = e.target.value; requestDraw(); } });
    $('f-color').addEventListener('change', () => { if (singleSelected()) commit(); });
    onClick('btn-color-reset', () => { const it = singleSelected(); if (it) { it.color = null; commit(); } });
    $('f-locked').addEventListener('change', (e) => { setLocked(e.target.checked); canvas.focus({ preventScroll: true }); });

    $('custom-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const w = $('custom-w').valueAsNumber, d = $('custom-d').valueAsNumber;
      if (!(w > 0) || !(d > 0)) return;
      addAtCenter(catalog.CUSTOM, { label: $('custom-name').value.trim() || 'Custom item', w, d, color: $('custom-color').value });
    });

    // Files can be dropped anywhere in the window.
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); stage.classList.add('dropping'); } });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) stage.classList.remove('dropping'); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      stage.classList.remove('dropping');
      openFile(e.dataTransfer.files[0]);
    });
  }

  /* ---- keyboard ---- */

  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  window.addEventListener('keydown', (e) => {
    state.shiftDown = e.shiftKey;
    if (e.key === 'Shift' && state.tool === 'calibrate') requestDraw();
    if (dialog.open) return;
    if (isTextTarget(e.target)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (key === ' ') {
      // Space on a focused button keeps its normal meaning; elsewhere it arms panning.
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SUMMARY' || e.target.tagName === 'INPUT') return;
      e.preventDefault();
      if (!state.spaceDown) { state.spaceDown = true; updateCursor(state.pointer); }
      return;
    }
    if (key === 'Escape') {
      if (state.drag) cancelDrag();
      else if (state.tool === 'calibrate') stopCalibration();
      else if (state.selection.size) select([]);
      return;
    }
    if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); redo(); return; }
    if (state.drag || state.tool !== 'select') return;

    if (mod && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && key === 'c') { if (state.selection.size) { e.preventDefault(); copySelected(); } return; }
    if (mod && key === 'x') { if (state.selection.size) { e.preventDefault(); copySelected(); deleteSelected(); } return; }
    if (mod && key === 'v') { if (state.clipboard.length) { e.preventDefault(); paste(); } return; }
    if (mod && key === 'a') { e.preventDefault(); select(visibleItems().map((it) => it.id)); return; }
    if (mod || e.altKey) return;

    if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (ARROWS[key]) {
      if (!state.selection.size) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudgeSelected(ARROWS[key][0] * step, ARROWS[key][1] * step);
      return;
    }
    if (key === 'r') rotateSelected(e.shiftKey ? -90 : 90);
    else if (key === ']') reorderSelected(true);
    else if (key === '[') reorderSelected(false);
    else if (key === 'l') { const sel = selectedItems(); if (sel.length) setLocked(!sel.every((it) => it.locked)); }
    else if (key === 'f') fitToScreen();
    else if (key === '+' || key === '=') zoomBy(1.25);
    else if (key === '-') zoomBy(1 / 1.25);
  });

  window.addEventListener('keyup', (e) => {
    state.shiftDown = e.shiftKey;
    if (e.key === ' ' && state.spaceDown) { state.spaceDown = false; updateCursor(state.pointer); }
    if (e.key === 'Shift' && state.tool === 'calibrate') requestDraw();
  });

  window.addEventListener('blur', () => { state.spaceDown = false; });
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });

  /* ---- start ---- */

  async function restore() {
    const saved = storage.loadLayout();
    if (!saved) return;
    try {
      state.plan = model.deserialize(JSON.parse(saved));
    } catch (err) {
      toast('The saved layout could not be read, starting with an empty plan.');
      return;
    }
    if (state.plan.image) {
      const rec = await storage.loadImage();
      if (rec) {
        try {
          state.image = await decodeImage(rec.blob);
          state.imageBlob = rec.blob;
          state.imageStore = rec.where;
          state.imageIsCopy = rec.where === 'copy';
        } catch (err) { state.image = null; }
      }
    }
  }

  async function start() {
    buildLibrary();
    bindControls();
    new ResizeObserver(resizeCanvas).observe(stage);
    resizeCanvas();
    await restore();
    hist.reset(model.snapshot(state.plan));
    syncSettingsControls();
    fitToScreen();
    modelChanged();
    refreshSaveStatus();
    showScaleReminder();
  }

  HP.app = { state, hist, toPlan, started: start() };
})();

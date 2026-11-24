const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/geometry.js');

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} to be within ${eps} of ${expected}`);
const nearPoint = (p, x, y, eps = 1e-9) => { near(p.x, x, eps); near(p.y, y, eps); };
const rect = (x, y, w, d, rot = 0, extra = {}) => ({ x, y, w, d, rot, ...extra });

test('cm to px and back', () => {
  assert.equal(geo.cmToPx(430, 2), 860);
  assert.equal(geo.pxToCm(860, 2), 430);
  near(geo.pxToCm(geo.cmToPx(123.4, 1.784), 1.784), 123.4);
});

test('scale from two points and a real distance', () => {
  assert.equal(geo.scaleFromPoints({ x: 100, y: 50 }, { x: 960, y: 50 }, 430), 2);
  // a 3-4-5 triangle: 500 px along the diagonal for 250 cm
  assert.equal(geo.scaleFromPoints({ x: 0, y: 0 }, { x: 300, y: 400 }, 250), 2);
  assert.equal(geo.scaleFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 100), null);
  assert.equal(geo.scaleFromPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0), null);
  assert.equal(geo.scaleFromPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, NaN), null);
});

test('plan cm to screen px goes through scale, zoom and pan', () => {
  const view = { x: 30, y: -10, scale: 0.5 };
  const s = geo.planToScreen({ x: 100, y: 200 }, view, 2);
  nearPoint(s, 130, 190);
  nearPoint(geo.screenToPlan(s, view, 2), 100, 200);
});

test('zoomAt keeps the point under the cursor in place', () => {
  const view = { x: 40, y: 25, scale: 0.8 };
  const cursor = { x: 300, y: 180 };
  const before = geo.screenToPlan(cursor, view, 1.5);
  const zoomed = geo.zoomAt(view, cursor, 1.7, 0.01, 50);
  near(zoomed.scale, 0.8 * 1.7);
  const after = geo.screenToPlan(cursor, zoomed, 1.5);
  nearPoint(after, before.x, before.y);
  assert.equal(geo.zoomAt(view, cursor, 1000, 0.01, 50).scale, 50);
  assert.equal(geo.zoomAt(view, cursor, 0.00001, 0.01, 50).scale, 0.01);
});

test('fitView centers the content inside the margin', () => {
  const v = geo.fitView(2000, 1000, 1040, 840, 20);
  assert.equal(v.scale, 0.5);
  assert.equal(v.x, 20);
  assert.equal(v.y, 170);
});

test('normalizeDeg', () => {
  assert.equal(geo.normalizeDeg(370), 10);
  assert.equal(geo.normalizeDeg(-90), 270);
  assert.equal(geo.normalizeDeg(360), 0);
  assert.ok(Object.is(geo.normalizeDeg(-0), 0));
});

test('rotatePoint turns clockwise on screen (y down)', () => {
  nearPoint(geo.rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), 0, 10);
  nearPoint(geo.rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 180), -10, 0);
  nearPoint(geo.rotatePoint({ x: 3, y: 2 }, { x: 1, y: 2 }, 45), 1 + Math.SQRT2, 2 + Math.SQRT2, 1e-12);
});

test('rotation around the item center keeps the center and the size', () => {
  const bed = rect(300, 400, 160, 200);
  for (const rot of [0, 15, 37.5, 90, 180, 265]) {
    const corners = geo.rectCorners({ ...bed, rot });
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
    nearPoint({ x: cx, y: cy }, 300, 400, 1e-9);
    for (const p of corners) near(geo.distance(p, bed), Math.hypot(80, 100), 1e-9);
    near(geo.distance(corners[0], corners[1]), 160, 1e-9);
    near(geo.distance(corners[1], corners[2]), 200, 1e-9);
  }
});

test('a quarter turn swaps width and depth in the bounding box, exactly', () => {
  const box = geo.itemAABB(rect(300, 400, 160, 200, 90));
  assert.deepEqual(box, { minX: 200, minY: 320, maxX: 400, maxY: 480 });
  const corners = geo.rectCorners(rect(300, 400, 160, 200, 90));
  assert.deepEqual(corners[0], { x: 400, y: 320 });   // old top-left is now top-right
});

test('rotateAround: own center changes only the angle, another pivot also moves the item', () => {
  const chair = rect(100, 100, 45, 45, 30);
  assert.deepEqual(geo.rotateAround(chair, chair, 45), { x: 100, y: 100, rot: 75 });
  const r = geo.rotateAround(chair, { x: 0, y: 100 }, 90);
  nearPoint(r, 0, 200);
  assert.equal(r.rot, 120);
  assert.equal(geo.rotateAround(chair, chair, 350).rot, 20);
});

test('rotate handle drag: 15 degree steps, free with step 0', () => {
  assert.equal(geo.rotationFromDrag(0, -90, -62, 15), 30);    // 28 degrees of drag snaps to 30
  assert.equal(geo.rotationFromDrag(0, -90, -62, 0), 28);
  assert.equal(geo.rotationFromDrag(90, 10, 4, 15), 90);      // small wobble stays put
  assert.equal(geo.rotationFromDrag(0, 0, -20, 15), 345);     // wraps below zero
  assert.equal(geo.rotationFromDrag(350, 0, 8, 15), 0);       // wraps past 360
  near(geo.angleFrom({ x: 0, y: 0 }, { x: 0, y: 5 }), 90);
});

test('snap to a grid step', () => {
  assert.equal(geo.snap(12.4, 5), 10);
  assert.equal(geo.snap(12.5, 5), 15);
  assert.equal(geo.snap(-7.6, 5), -10);
  assert.equal(geo.snap(0, 5), 0);
  assert.equal(geo.snap(12.34, 0), 12.34);     // step 0 switches snapping off
  assert.ok(Object.is(geo.snap(-1, 5), 0));    // no negative zero
});

test('snapAngle', () => {
  assert.equal(geo.snapAngle(22, 15), 15);
  assert.equal(geo.snapAngle(23, 15), 30);
  assert.equal(geo.snapAngle(-10, 15), 345);
  assert.equal(geo.snapAngle(356, 15), 0);
});

test('snapPosition puts the edges of an unrotated item on the grid', () => {
  // a 45 cm chair: its center is not on the grid, its edges are
  const chair = rect(101.3, 58.9, 45, 45);
  const s = geo.snapPosition(chair, 5);
  assert.deepEqual(s, { x: 102.5, y: 57.5 });
  const box = geo.itemAABB({ ...chair, ...s });
  assert.deepEqual(box, { minX: 80, minY: 35, maxX: 125, maxY: 80 });
});

test('snapPosition uses the bounding box of a rotated item', () => {
  const bed = rect(303, 398, 160, 200, 90);
  const box = geo.itemAABB({ ...bed, ...geo.snapPosition(bed, 5) });
  assert.deepEqual(box, { minX: 205, minY: 320, maxX: 405, maxY: 480 });
  const tilted = rect(311.7, 207.2, 120, 60, 30);
  const tbox = geo.itemAABB({ ...tilted, ...geo.snapPosition(tilted, 5) });
  near(tbox.minX / 5, Math.round(tbox.minX / 5), 1e-9);
  near(tbox.minY / 5, Math.round(tbox.minY / 5), 1e-9);
  assert.deepEqual(geo.snapPosition(tilted, 0), { x: 311.7, y: 207.2 });
});

test('axis-aligned rectangles: overlap, apart, touching', () => {
  const a = rect(100, 100, 100, 60);
  assert.equal(geo.itemsOverlap(a, rect(180, 100, 100, 60)), true);
  assert.equal(geo.itemsOverlap(a, rect(260, 100, 100, 60)), false);
  assert.equal(geo.itemsOverlap(a, rect(200, 100, 100, 60)), false);   // flush side by side
  assert.equal(geo.itemsOverlap(a, rect(100, 160, 100, 60)), false);   // flush above and below
  assert.equal(geo.itemsOverlap(a, rect(199.9, 100, 100, 60)), true);  // 1 mm in
  assert.equal(geo.itemsOverlap(a, rect(100, 100, 20, 20)), true);     // fully inside
});

test('rotated rectangles: bounding boxes overlap but the shapes do not', () => {
  const table = rect(0, 0, 100, 100);
  // a square turned 45 degrees is a diamond with its tip 70.7 cm from its center
  const diamond = rect(115, 115, 100, 100, 45);
  const a = geo.itemAABB(table), b = geo.itemAABB(diamond);
  assert.ok(b.minX < a.maxX && b.minY < a.maxY, 'bounding boxes do overlap');
  assert.equal(geo.itemsOverlap(table, diamond), false);
  assert.equal(geo.itemsOverlap(table, rect(80, 80, 100, 100, 45)), true);
});

test('rotated rectangles: a long thin item crossing another', () => {
  const sofa = rect(200, 200, 210, 90);
  assert.equal(geo.itemsOverlap(sofa, rect(200, 200, 300, 10, 60)), true);
  assert.equal(geo.itemsOverlap(sofa, rect(200, 330, 300, 10, 10)), false);
  assert.equal(geo.itemsOverlap(sofa, rect(200, 250, 300, 10, 10)), true);
  // same pair turned together stays in the same relation
  const turn = (it) => ({ ...it, ...geo.rotateAround(it, { x: 50, y: 50 }, 33) });
  assert.equal(geo.itemsOverlap(turn(sofa), turn(rect(200, 330, 300, 10, 10))), false);
  assert.equal(geo.itemsOverlap(turn(sofa), turn(rect(200, 250, 300, 10, 10))), true);
});

test('round items use their real outline, not the bounding square', () => {
  const round = rect(0, 0, 100, 100, 0, { shape: 'ellipse' });
  const chairInCorner = rect(55, 55, 30, 30);       // inside the bounding square, outside the circle
  assert.equal(geo.itemsOverlap({ ...round, shape: 'rect' }, chairInCorner), true);
  assert.equal(geo.itemsOverlap(round, chairInCorner), false);
  assert.equal(geo.itemsOverlap(round, rect(40, 40, 30, 30)), true);
});

test('door swing outline is the quarter circle, mirrored when flipped', () => {
  const door = rect(40, 40, 80, 80, 0, { shape: 'door' });   // hinge at (0, 80), leaf closes toward (80, 80)
  const poly = geo.itemPolygon(door);
  nearPoint(poly[0], 0, 80);
  nearPoint(poly[1], 80, 80);
  nearPoint(poly[poly.length - 1], 0, 0);
  assert.equal(geo.pointInPolygon({ x: 20, y: 60 }, poly), true);
  assert.equal(geo.pointInPolygon({ x: 70, y: 10 }, poly), false);   // far corner is outside the arc
  const flipped = geo.itemPolygon({ ...door, flipped: true });
  nearPoint(flipped[0], 80, 80);
  assert.equal(geo.pointInPolygon({ x: 10, y: 10 }, flipped), false);
  assert.equal(geo.pointInPolygon({ x: 60, y: 60 }, flipped), true);
});

test('polygonInsideRect', () => {
  const plan = { x: 0, y: 0, w: 500, h: 400 };
  assert.equal(geo.polygonInsideRect(geo.rectCorners(rect(80, 100, 160, 200)), plan), true);    // flush with the left edge
  assert.equal(geo.polygonInsideRect(geo.rectCorners(rect(79, 100, 160, 200)), plan), false);
  assert.equal(geo.polygonInsideRect(geo.rectCorners(rect(450, 350, 100, 60, 45)), plan), false);
});

test('an L-shaped item is a body along the top edge plus a return on one side', () => {
  const sofa = rect(0, 0, 250, 160, 0, { shape: 'lshape' });
  const [body, ret] = geo.itemParts(sofa);
  assert.deepEqual(geo.polygonAABB(body), { minX: -125, minY: -80, maxX: 125, maxY: 15 });
  assert.deepEqual(geo.polygonAABB(ret), { minX: 30, minY: 15, maxX: 125, maxY: 80 });
  const mirrored = geo.itemParts({ ...sofa, flipped: true })[1];
  assert.deepEqual(geo.polygonAABB(mirrored), { minX: -125, minY: 15, maxX: -30, maxY: 80 });
  assert.equal(geo.itemParts(rect(0, 0, 100, 50)).length, 1);
  const inCorner = rect(-60, 45, 80, 50);             // inside the bounding box, clear of both parts
  assert.equal(geo.itemsOverlap(sofa, inCorner), false);
  assert.equal(geo.itemsOverlap({ ...sofa, flipped: true }, inCorner), true);
  near(geo.partsGap(geo.itemParts(sofa), geo.itemParts(inCorner)).dist, 5);
});

test('the clear space of an item lies in front of its bottom edge and turns with it', () => {
  assert.equal(geo.clearancePolygon(rect(0, 0, 200, 60)), null);
  const zone = geo.clearancePolygon(rect(0, 0, 200, 60, 0, { clear: 90 }));
  assert.deepEqual(geo.polygonAABB(zone), { minX: -100, minY: 30, maxX: 100, maxY: 120 });
  const turned = geo.polygonAABB(geo.clearancePolygon(rect(0, 0, 200, 60, 90, { clear: 90 })));
  near(turned.minX, -120); near(turned.maxX, -30); near(turned.minY, -100); near(turned.maxY, 100);
});

test('pointInPolygon on a rotated rectangle', () => {
  const poly = geo.rectCorners(rect(100, 100, 200, 20, 45));
  assert.equal(geo.pointInPolygon({ x: 100, y: 100 }, poly), true);
  assert.equal(geo.pointInPolygon({ x: 160, y: 160 }, poly), true);
  assert.equal(geo.pointInPolygon({ x: 160, y: 100 }, poly), false);
});

test('gap between two items', () => {
  const a = geo.rectCorners(rect(50, 30, 100, 60));
  const b = geo.rectCorners(rect(125, 120, 150, 60));     // 30 cm below, shifted right
  const gap = geo.polygonGap(a, b);
  near(gap.dist, 30);
  nearPoint(gap.a, 75, 60);        // middle of the stretch where the facing edges overlap
  nearPoint(gap.b, 75, 90);

  const diag = geo.polygonGap(a, geo.rectCorners(rect(180, 140, 100, 100)));
  near(diag.dist, Math.hypot(30, 30));
  nearPoint(diag.a, 100, 60);
  nearPoint(diag.b, 130, 90);

  assert.equal(geo.polygonGap(a, geo.rectCorners(rect(60, 40, 20, 20))).dist, 0);
  assert.equal(geo.polygonGap(a, geo.rectCorners(rect(150, 30, 100, 60))).dist, 0);   // touching
});

test('pointToPolygonDistance', () => {
  const poly = geo.rectCorners(rect(50, 50, 100, 100));
  near(geo.pointToPolygonDistance({ x: 130, y: 50 }, poly), 30);
  near(geo.pointToPolygonDistance({ x: 50, y: 50 }, poly), 50);
});

test('resize from a corner keeps the opposite corner fixed', () => {
  const desk = rect(100, 100, 120, 60);
  // drag bottom-right (corner 2) from (160,130) to (200,150)
  const r = geo.resizeFromCorner(desk, 2, { x: 200, y: 150 });
  assert.deepEqual(r, { x: 120, y: 110, w: 160, d: 80 });
  assert.deepEqual(geo.rectCorners({ ...desk, ...r })[0], { x: 40, y: 70 });
  // drag top-left (corner 0): bottom-right stays at (160,130)
  const tl = geo.resizeFromCorner(desk, 0, { x: 60, y: 90 });
  assert.deepEqual(tl, { x: 110, y: 110, w: 100, d: 40 });
});

test('resize works in the frame of a rotated item', () => {
  const desk = rect(100, 100, 120, 60, 90);
  const before = geo.rectCorners(desk);
  // corner 2 sits at (70,160) after the quarter turn; pull it 40 cm further down
  nearPoint(before[2], 70, 160);
  const r = geo.resizeFromCorner(desk, 2, { x: 70, y: 200 });
  near(r.w, 160);
  near(r.d, 60);
  const after = geo.rectCorners({ ...desk, ...r });
  nearPoint(after[0], before[0].x, before[0].y);
  nearPoint(after[2], 70, 200);

  const tilted = rect(300, 200, 100, 50, 30);
  const fixedBefore = geo.rectCorners(tilted)[3];
  const target = { x: 420, y: 190 };
  const t = geo.resizeFromCorner(tilted, 1, target);
  const cornersAfter = geo.rectCorners({ ...tilted, ...t });
  nearPoint(cornersAfter[3], fixedBefore.x, fixedBefore.y, 1e-9);
  nearPoint(cornersAfter[1], target.x, target.y, 1e-9);
});

test('resize options: grid step, minimum size, locked aspect', () => {
  const desk = rect(100, 100, 120, 60);
  const snapped = geo.resizeFromCorner(desk, 2, { x: 203, y: 148 }, { step: 5 });
  assert.equal(snapped.w, 165);
  assert.equal(snapped.d, 80);
  const tiny = geo.resizeFromCorner(desk, 2, { x: 0, y: 0 }, { min: 5 });   // dragged past the fixed corner
  assert.equal(tiny.w, 5);
  assert.equal(tiny.d, 5);
  const round = rect(0, 0, 110, 110);
  const kept = geo.resizeFromCorner(round, 2, { x: 80, y: 20 }, { keepAspect: true, step: 5 });
  assert.equal(kept.w, 135);
  assert.equal(kept.d, 135);
  const plank = geo.resizeFromCorner(rect(0, 0, 200, 50), 2, { x: -500, y: -500 }, { keepAspect: true, min: 5 });
  assert.equal(plank.d, 5);
  assert.equal(plank.w, 20);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/model.js');
const catalog = require('../src/catalog.js');
const geo = require('../src/geometry.js');

function planWith(...specs) {
  const plan = model.createPlan();
  for (const [type, x, y, extra] of specs) {
    model.addItem(plan, model.createItem(plan, catalog.byType(type), { x, y }, extra));
  }
  return plan;
}

test('the library holds every item from the brief at its default size', () => {
  const expected = {
    'bed-single': [90, 200], 'bed-double': [160, 200], 'bed-queen': [160, 200], 'bed-140': [140, 200], 'bed-180': [180, 200],
    'sofa-2': [160, 90], 'sofa-3': [210, 90], armchair: [80, 80],
    'table-4': [120, 80], 'table-6': [180, 90], 'table-round': [110, 110], 'dining-chair': [45, 45],
    'coffee-table': [100, 60], desk: [120, 60], 'office-chair': [60, 60],
    'wardrobe-200': [200, 60], 'wardrobe-120': [120, 60],
    counter: [240, 60], 'counter-corner': [60, 60], fridge: [60, 65], stove: [60, 60], 'kitchen-sink': [60, 55],
    'washing-machine': [60, 60], toilet: [40, 65], bathtub: [170, 75], shower: [90, 90], 'bath-sink': [60, 45],
    'tv-unit': [150, 40], plant: [40, 40], door: [80, 80], window: [100, 15],
    nightstand: [45, 40], 'tv-wall': [145, 8], 'sofa-l': [250, 160], 'hob-2': [30, 52],
    vanity: [90, 40], ottoman: [80, 80], speaker: [30, 30], 'dog-bed': [60, 50], 'tall-unit': [60, 60], dishwasher: [60, 60],
    sideboard: [140, 35], 'shelf-unit': [80, 40], 'display-cabinet': [35, 32], 'shoe-cabinet': [52, 18], bench: [100, 40],
    'lounge-chair': [70, 70], 'side-table': [45, 45], rug: [200, 300], 'rug-round': [160, 160], curtain: [240, 20], walkway: [90, 200],
    'e-socket': [20, 20], 'e-socket-2': [36, 20], 'e-feed': [20, 20], 'e-switch': [20, 20], 'e-light': [30, 30],
    'e-wall-light': [24, 14], 'e-led': [100, 6], 'e-network': [20, 20]
  };
  for (const [type, [w, d]] of Object.entries(expected)) {
    const def = catalog.byType(type);
    assert.equal(def.type, type, `${type} is in the library`);
    assert.deepEqual([def.w, def.d], [w, d], `${type} size`);
    assert.ok(def.name && def.icon && def.category);
  }
  assert.equal(catalog.TYPES.length, Object.keys(expected).length);
  assert.equal(catalog.byType('plant').shape, 'ellipse');
  assert.equal(catalog.byType('table-round').shape, 'ellipse');
  assert.equal(catalog.byType('door').blocking, false);
  assert.equal(catalog.byType('window').blocking, false);
  assert.equal(catalog.byType('tv-wall').blocking, false);
  assert.equal(catalog.byType('hob-2').blocking, false);
  assert.equal(catalog.byType('sofa-l').shape, 'lshape');
  const categories = new Set(catalog.CATEGORIES.map((c) => c.id));
  for (const t of catalog.TYPES) assert.ok(categories.has(t.category), `${t.type} has a known category`);
});

test('createItem takes sizes from the library and gives each item its own id', () => {
  const plan = planWith(['bed-double', 300, 250], ['plant', 50, 50]);
  const [bed, plant] = plan.items;
  assert.deepEqual([bed.w, bed.d, bed.x, bed.y, bed.rot], [160, 200, 300, 250, 0]);
  assert.equal(bed.label, 'Double bed');
  assert.equal(plant.shape, 'ellipse');
  assert.notEqual(bed.id, plant.id);
  assert.equal(plan.nextId, 3);
});

test('custom items carry a name, size and color', () => {
  const plan = model.createPlan();
  const it = model.createItem(plan, catalog.CUSTOM, { x: 10, y: 20 }, { label: 'Piano', w: 150, d: 60, color: '#AABBCC' });
  assert.deepEqual([it.type, it.label, it.w, it.d, it.color], ['custom', 'Piano', 150, 60, '#aabbcc']);
  assert.equal(it.blocking, true);
});

test('updateItem cleans what comes from the properties panel', () => {
  const plan = planWith(['desk', 100, 100]);
  const id = plan.items[0].id;
  model.updateItem(plan, id, { w: 1, rot: -90, color: 'red', label: 'x'.repeat(100) });
  const it = plan.items[0];
  assert.equal(it.w, model.MIN_SIZE_CM);
  assert.equal(it.rot, 270);
  assert.equal(it.color, null);
  assert.equal(it.label.length, 60);
  model.updateItem(plan, id, { x: NaN, d: 80.126 });
  assert.equal(it.x, 0);
  assert.equal(it.d, 80.13);
});

test('setScale keeps items on the same image pixels and keeps their real size', () => {
  const plan = planWith(['bed-double', 300, 250]);
  plan.image = { name: 'p.png', type: 'image/png', width: 2000, height: 1000 };
  model.setScale(plan, 2, null);                       // first guess: 2 px per cm
  const pxBefore = { x: plan.items[0].x * plan.pxPerCm, y: plan.items[0].y * plan.pxPerCm };
  model.setScale(plan, 4, { a: { x: 0, y: 0 }, b: { x: 1720, y: 0 }, cm: 430 });
  const bed = plan.items[0];
  assert.deepEqual({ x: bed.x * 4, y: bed.y * 4 }, pxBefore);
  assert.deepEqual([bed.w, bed.d], [160, 200]);
  assert.equal(plan.calibrated, true);
  assert.deepEqual(model.planRect(plan), { x: 0, y: 0, w: 500, h: 250 });
  assert.equal(model.setScale(plan, 0, null), false);
  assert.equal(plan.pxPerCm, 4);
});

test('overlapping furniture is flagged on both items, flush furniture is not', () => {
  const plan = planWith(['bed-double', 100, 100], ['wardrobe-200', 150, 150], ['desk', 240, 30]);
  const [bed, wardrobe, desk] = plan.items;
  const flags = model.collisions(plan);
  assert.deepEqual(flags.get(bed.id), { level: 'error', reasons: ['overlap'] });
  assert.deepEqual(flags.get(wardrobe.id), { level: 'error', reasons: ['overlap'] });
  assert.equal(flags.has(desk.id), false);            // desk touches the bed's right edge exactly
  model.updateItem(plan, wardrobe.id, { x: 100, y: 230 });   // now flush below the bed
  assert.equal(model.collisions(plan).size, 0);
});

test('an L-shaped sofa leaves its inner corner free for other furniture', () => {
  const plan = planWith(['sofa-l', 200, 200], ['coffee-table', 140, 250, { w: 80, d: 50 }]);
  const sofa = plan.items[0];
  assert.equal(model.collisions(plan).size, 0);       // table sits where the bounding boxes overlap
  assert.equal(model.nearestItem(plan, sofa).dist, 10);
  model.updateItem(plan, sofa.id, { flipped: true });   // the return moves onto the table
  assert.equal(model.collisions(plan).size, 2);
});

test('rugs, curtains and electrical symbols never conflict with furniture', () => {
  const plan = planWith(['sofa-3', 200, 200], ['rug', 200, 200], ['curtain', 200, 200], ['e-socket', 200, 200], ['e-led', 200, 200]);
  assert.equal(model.collisions(plan).size, 0);
  for (const t of catalog.TYPES.filter((x) => x.category === 'electrical')) assert.equal(t.blocking, false);
});

test('furniture on a walking route earns a warning on both', () => {
  const plan = planWith(['walkway', 200, 200], ['armchair', 200, 250], ['plant', 400, 400]);
  const [route, chair, plant] = plan.items;
  const flags = model.collisions(plan);
  assert.deepEqual(flags.get(route.id), { level: 'warn', reasons: ['route'] });
  assert.deepEqual(flags.get(chair.id), { level: 'warn', reasons: ['route'] });
  assert.equal(flags.has(plant.id), false);
});

test('clear space in front of an item is checked only while the setting is on', () => {
  // The wardrobe front faces down. The bed starts 30 cm in front of it, the plant stands beside the strip.
  const plan = planWith(['wardrobe-200', 200, 100], ['bed-180', 200, 260], ['plant', 200, 250, { x: 60, y: 250 }]);
  const [wardrobe, bed, plant] = plan.items;
  assert.equal(model.collisions(plan).size, 0);
  plan.settings.showClearances = true;
  let flags = model.collisions(plan);
  assert.deepEqual(flags.get(wardrobe.id), { level: 'warn', reasons: ['clearance'] });
  assert.deepEqual(flags.get(bed.id), { level: 'warn', reasons: ['clearance'] });
  assert.equal(flags.has(plant.id), false);
  model.updateItem(plan, wardrobe.id, { rot: 180 });   // front now faces away from the bed
  flags = model.collisions(plan);
  assert.equal(flags.size, 0);
  const saved = model.deserialize(JSON.parse(JSON.stringify(model.serialize(plan))));
  assert.equal(saved.settings.showClearances, true);
});

test('electrical symbols draw on top and disappear with their layer', () => {
  const plan = planWith(['e-socket', 10, 10], ['desk', 100, 100], ['rug', 100, 100], ['e-light', 50, 50]);
  assert.deepEqual(model.visibleItems(plan).map((it) => it.type), ['desk', 'rug', 'e-socket', 'e-light']);
  plan.settings.showElectrical = false;
  assert.deepEqual(model.visibleItems(plan).map((it) => it.type), ['desk', 'rug']);
  assert.equal(model.deserialize(JSON.parse(JSON.stringify(model.serialize(plan)))).settings.showElectrical, false);
});

test('the nearest item ignores rugs and symbols', () => {
  const plan = planWith(['sofa-3', 200, 200], ['rug', 200, 200], ['e-socket', 200, 130], ['coffee-table', 200, 320]);
  const near = model.nearestItem(plan, plan.items[0]);
  assert.equal(near.other.type, 'coffee-table');
  assert.equal(near.dist, 45);
});

test('rotation decides whether two items collide', () => {
  const plan = planWith(['table-6', 200, 200], ['dining-chair', 200, 275]);
  const chair = plan.items[1];
  assert.equal(model.collisions(plan).size, 0);       // chair 7.5 cm clear of the table edge
  model.updateItem(plan, chair.id, { rot: 45 });      // its corner now pokes into the table
  assert.equal(model.collisions(plan).size, 2);
});

test('items outside the plan image are flagged', () => {
  const plan = planWith(['sofa-3', 105, 45], ['sofa-3', 100, 300], ['plant', 590, 390]);
  plan.image = { name: 'p.png', type: 'image/png', width: 1200, height: 800 };
  plan.pxPerCm = 2;                                   // the plan is 600 x 400 cm
  const [inside, half, plant] = plan.items;
  const flags = model.collisions(plan);
  assert.equal(flags.has(inside.id), false);          // flush in the top-left corner
  assert.deepEqual(flags.get(half.id), { level: 'error', reasons: ['outside'] });
  assert.deepEqual(flags.get(plant.id), { level: 'error', reasons: ['outside'] });
  plan.image = null;                                  // no image, no boundary
  assert.equal(model.collisions(plan).size, 0);
});

test('windows never conflict, a door swing over furniture is only a warning', () => {
  const plan = planWith(['bed-double', 100, 100], ['window', 100, 100], ['door', 100, 100], ['window', 110, 110]);
  const [bed, window1, door, window2] = plan.items;
  const flags = model.collisions(plan);
  assert.equal(flags.has(window1.id), false);
  assert.equal(flags.has(window2.id), false);
  assert.deepEqual(flags.get(door.id), { level: 'warn', reasons: ['door'] });
  assert.deepEqual(flags.get(bed.id), { level: 'warn', reasons: ['door'] });

  // a real overlap on the same item wins over the warning
  model.addItem(plan, model.createItem(plan, catalog.byType('desk'), { x: 120, y: 120 }));
  const again = model.collisions(plan);
  assert.equal(again.get(bed.id).level, 'error');
  assert.deepEqual(again.get(bed.id).reasons.sort(), ['door', 'overlap']);
  assert.equal(again.get(door.id).level, 'warn');
});

test('the corner of a door square outside its arc does not warn', () => {
  // door box spans 0..80 with the hinge at (0,80); a small plant at (70,10) is 99 cm from the hinge
  const plan = planWith(['door', 40, 40], ['plant', 70, 10, { w: 10, d: 10 }]);
  assert.equal(model.collisions(plan).size, 0);
  model.updateItem(plan, plan.items[1].id, { x: 30, y: 50 });
  assert.equal(model.collisions(plan).size, 2);
});

test('bring to front and send to back keep the relative order of the group', () => {
  const plan = planWith(['desk', 0, 0], ['plant', 0, 0], ['stove', 0, 0], ['toilet', 0, 0]);
  const [a, b, c, d] = plan.items.map((it) => it.id);
  model.bringToFront(plan, [a, c]);
  assert.deepEqual(plan.items.map((it) => it.id), [b, d, a, c]);
  model.sendToBack(plan, [c, d]);
  assert.deepEqual(plan.items.map((it) => it.id), [d, c, b, a]);
});

test('duplicate, remove and nudge; locked items stay put', () => {
  const plan = planWith(['desk', 100, 100], ['plant', 50, 50]);
  const [desk, plant] = plan.items;
  plant.locked = true;
  const copies = model.duplicateItems(plan, [desk.id, plant.id], 20, 20);
  assert.equal(plan.items.length, 4);
  assert.deepEqual([copies[0].x, copies[0].y, copies[0].type], [120, 120, 'desk']);
  assert.equal(copies[1].locked, false);
  assert.equal(new Set(plan.items.map((it) => it.id)).size, 4);

  assert.equal(model.nudge(plan, [desk.id, plant.id], -1, 10), 1);
  assert.deepEqual([desk.x, desk.y, plant.x, plant.y], [99, 110, 50, 50]);
  model.removeItems(plan, copies.map((c) => c.id));
  assert.equal(plan.items.length, 2);
});

test('rotateItems: one item about its center, a group about its middle', () => {
  const plan = planWith(['desk', 100, 100], ['desk', 300, 100]);
  const [a, b] = plan.items;
  model.rotateItems(plan, [a.id], 90);
  assert.deepEqual([a.x, a.y, a.rot], [100, 100, 90]);
  model.updateItem(plan, a.id, { rot: 0 });
  model.rotateItems(plan, [a.id, b.id], 90);          // group center is (200, 100)
  assert.deepEqual([a.x, a.y, a.rot], [200, 0, 90]);
  assert.deepEqual([b.x, b.y, b.rot], [200, 200, 90]);
});

test('nearestItem reports the gap to the closest other item', () => {
  const plan = planWith(['bed-double', 100, 100], ['desk', 300, 100], ['plant', 600, 600]);
  const [bed, desk] = plan.items;
  const near = model.nearestItem(plan, bed);
  assert.equal(near.other.id, desk.id);
  assert.equal(near.dist, 60);                        // bed ends at x=180, desk starts at x=240
  assert.equal(model.nearestItem(plan, bed, new Set([desk.id])).other.type, 'plant');
  assert.equal(model.nearestItem(planWith(['desk', 0, 0]), { id: 99, x: 0, y: 0, w: 10, d: 10, rot: 0 }).other.type, 'desk');
  assert.equal(model.nearestItem(model.createPlan(), bed), null);
});

test('snapshot and restore drive undo', () => {
  const plan = planWith(['desk', 100, 100]);
  const before = model.snapshot(plan);
  model.updateItem(plan, plan.items[0].id, { x: 500 });
  model.addItem(plan, model.createItem(plan, catalog.byType('plant'), { x: 1, y: 1 }));
  model.setScale(plan, 3, { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, cm: 100 });
  model.restore(plan, before);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].x, 100);
  assert.equal(plan.pxPerCm, 1);
  assert.equal(plan.calibrated, false);
  assert.equal(model.snapshot(plan), before);
});

test('serialize and deserialize round trip', () => {
  const plan = planWith(['bed-double', 300, 250, { rot: 90 }], ['door', 40, 40], ['custom', 10, 20, { label: 'Piano', w: 150, d: 60, color: '#aabbcc' }]);
  plan.items[1].flipped = true;
  plan.items[0].locked = true;
  plan.image = { name: 'plan.png', type: 'image/png', width: 2067, height: 2576 };
  model.setScale(plan, 1.784, { a: { x: 782, y: 338 }, b: { x: 1549, y: 338 }, cm: 430 });
  plan.settings.snap = false;

  const json = JSON.stringify(model.serialize(plan));
  assert.ok(json.length < 2000, 'layout JSON stays small');
  const back = model.deserialize(JSON.parse(json));
  assert.deepEqual(back, plan);
});

test('deserialize rejects files that are not layouts', () => {
  assert.throws(() => model.deserialize(null), /not a Houseplan layout/);
  assert.throws(() => model.deserialize({ app: 'other', items: [] }), /not a Houseplan layout/);
  assert.throws(() => model.deserialize({ app: 'houseplan', version: 99, items: [], pxPerCm: 1 }), /newer version/);
  assert.throws(() => model.deserialize({ app: 'houseplan', version: 1, pxPerCm: 1 }), /no item list/);
  assert.throws(() => model.deserialize({ app: 'houseplan', version: 1, items: [], pxPerCm: 0 }), /no valid scale/);
});

test('deserialize repairs sloppy items instead of failing', () => {
  const plan = model.deserialize({
    app: 'houseplan', version: 1, pxPerCm: 2, calibrated: true, calibration: null, nextId: 1,
    items: [
      { id: 7, type: 'desk', x: 10, y: 10, w: 120, d: 60, rot: 720 },
      { id: 7, type: 'hovercraft', x: 'left', w: -4, d: 1e9, label: 42 },
      null,
      { type: 'plant' }
    ]
  });
  assert.equal(plan.items.length, 3);
  assert.deepEqual(plan.items.map((it) => it.id), [7, 8, 9]);
  assert.equal(plan.nextId, 10);
  assert.equal(plan.calibrated, false);               // no calibration line, so not calibrated
  assert.equal(plan.items[0].rot, 0);
  const odd = plan.items[1];
  assert.deepEqual([odd.type, odd.x, odd.w, odd.d, odd.label], ['custom', 0, model.MIN_SIZE_CM, model.MAX_SIZE_CM, '42']);
  assert.deepEqual([plan.items[2].w, plan.items[2].d], [40, 40]);
  assert.ok(geo.itemPolygon(plan.items[2]).length > 4);
});

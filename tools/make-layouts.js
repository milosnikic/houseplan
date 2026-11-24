/* Builds importable layout files in layouts/ from room-relative positions in cm. Run: node tools/make-layouts.js */
const fs = require('node:fs');
const path = require('node:path');
const model = require('../src/model.js');
const catalog = require('../src/catalog.js');

const ROOT = path.join(__dirname, '..');
const IMAGE = path.join(ROOT, 'samples/floorplan-empty.png');
const WALL = { a: { x: 782, y: 315 }, b: { x: 1549, y: 315 }, cm: 430 };   // upper bedroom wall on the sample
const K = (WALL.b.x - WALL.a.x) / WALL.cm;
const cm = (px) => px / K;

// Inner top-left corner of each room in cm, from wall faces measured on the sample image (px).
const ROOM = {
  living: { x: cm(782), y: cm(833) },
  bedroom: { x: cm(782), y: cm(300) },
  gaming: { x: cm(988), y: cm(1851) },
  laundry: { x: cm(529), y: cm(1714) },
  entrance: { x: cm(203), y: cm(1714) }
};
const ROT = { N: 0, E: 90, S: 180, W: 270 };
const OLIVE = '#7d8a55';

// box is [left, top, size along x, size along y] inside the room; back is the side the item's back faces.
function put(plan, room, type, label, box, back, extra) {
  const [x0, y0, fx, fy] = box;
  const turned = back === 'E' || back === 'W';
  const def = type === 'custom' ? catalog.CUSTOM : catalog.byType(type);
  const at = { x: ROOM[room].x + x0 + fx / 2, y: ROOM[room].y + y0 + fy / 2 };
  const item = model.createItem(plan, def, at, Object.assign({ label, w: turned ? fy : fx, d: turned ? fx : fy, rot: ROT[back || 'N'] }, extra));
  return model.addItem(plan, item);
}

// An electrical symbol at its library size, centred on x, y. back is the wall it sits on.
function mark(plan, room, type, x, y, back) {
  const def = catalog.byType(type);
  const at = { x: ROOM[room].x + x, y: ROOM[room].y + y };
  return model.addItem(plan, model.createItem(plan, def, at, { rot: ROT[back || 'N'] }));
}

function kitchen(plan) {
  put(plan, 'living', 'fridge', 'Fridge, tall', [115.5, 499, 60, 59], 'S');
  put(plan, 'living', 'tall-unit', 'Oven + microwave', [175.5, 499, 60, 59], 'S');
  put(plan, 'living', 'dishwasher', 'Dishwasher', [235.5, 499, 60, 59], 'S');
  put(plan, 'living', 'kitchen-sink', 'Sink base 80', [295.5, 499, 80, 59], 'S');
  put(plan, 'living', 'counter-corner', 'Corner', [375.5, 499, 54.5, 59], 'S');
  put(plan, 'living', 'counter', 'Drawers, prep', [381.8, 439, 60, 60], 'E');
  put(plan, 'living', 'counter', '', [381.8, 379, 60, 60], 'E');
  put(plan, 'living', 'hob-2', 'Hob, 2 zones', [385.8, 394, 52, 30], 'E');
  put(plan, 'living', 'counter', 'Drawers, coffee', [381.8, 334, 60, 45], 'E');
}

function bedroom(plan) {
  put(plan, 'bedroom', 'rug', 'Rug', [110, 60, 270, 200], 'N');
  put(plan, 'bedroom', 'curtain', 'Curtains', [430, 59, 20, 191], 'E');
  put(plan, 'bedroom', 'wardrobe-200', 'Wardrobe, sliding doors', [0, 0, 60, 174], 'W');
  put(plan, 'bedroom', 'bed-180', 'Bed 180, frame 190x210', [150, 0, 190, 210], 'N');
  put(plan, 'bedroom', 'nightstand', 'Nightstand', [108, 0, 40, 40], 'N');
  put(plan, 'bedroom', 'vanity', 'Vanity', [343, 0, 86, 40], 'N');
  put(plan, 'bedroom', 'tv-wall', 'Bedroom TV', [190, 279.6, 110, 8], 'S');
  put(plan, 'bedroom', 'dog-bed', 'Toto bed', [385, 232, 60, 50], 'N');
}

function gaming(plan) {
  put(plan, 'gaming', 'wardrobe-200', 'Wardrobe, niche', [0, 115, 60, 174], 'W');
  put(plan, 'gaming', 'desk', 'Desk 160x80', [95, 0, 160, 80], 'N');
  put(plan, 'gaming', 'office-chair', 'Chair', [150, 82, 60, 60], 'S');
  put(plan, 'gaming', 'desk', 'Desk 120x70', [214.7, 219.3, 120, 70], 'S');
  put(plan, 'gaming', 'office-chair', 'Chair', [244.7, 157, 60, 60], 'N');
  put(plan, 'gaming', 'display-cabinet', 'Funko cabinet', [297, 0, 35, 32], 'N');
}

function service(plan) {
  put(plan, 'laundry', 'washing-machine', 'Washer + dryer, stacked', [1, 5, 60, 60], 'N');
  put(plan, 'laundry', 'shelf-unit', 'Shelves', [64, 0, 66, 45], 'N');
  put(plan, 'entrance', 'wardrobe-120', 'Coat and gear cupboard', [0, 0, 110, 60], 'N');
}

// A: TV on the bedroom partition, sofa return on the terrace side, sideboard on the left wall.
function livingA(plan) {
  put(plan, 'living', 'rug', 'Rug', [110, 60, 240, 200], 'N');
  put(plan, 'living', 'curtain', 'Curtains', [430, 49, 20, 280], 'E');
  put(plan, 'living', 'tv-unit', 'TV unit 180', [147.5, 0, 180, 40], 'N');
  put(plan, 'living', 'tv-wall', 'TV 65"', [165, 0, 145, 8], 'N');
  put(plan, 'living', 'speaker', 'Speaker', [105.5, 25, 30, 30], 'N');
  put(plan, 'living', 'speaker', 'Speaker', [339.5, 25, 30, 30], 'N');
  put(plan, 'living', 'sofa-l', 'L sofa 250x160', [105, 125, 250, 160], 'S', { color: OLIVE, flipped: true });
  put(plan, 'living', 'coffee-table', 'Coffee table', [137.5, 94, 90, 56], 'N');
  put(plan, 'living', 'table-round', 'Round table 105', [192.5, 290, 105, 105], 'N');
  put(plan, 'living', 'dining-chair', 'Chair', [147.5, 320, 45, 45], 'W');
  put(plan, 'living', 'dining-chair', 'Chair', [297.5, 320, 45, 45], 'E');
  put(plan, 'living', 'dining-chair', 'Chair', [222.5, 395, 45, 45], 'S');
  put(plan, 'living', 'sideboard', 'Sideboard 140x35', [0, 300, 35, 140], 'W');
}

// B: TV on the left wall, sofa facing it with its back to the terrace, so both doors are in view.
// The TV group starts 73 cm below the bedroom door wall so the first speaker stays out of the doorway.
function livingB(plan) {
  put(plan, 'living', 'rug', 'Rug', [120, 25, 200, 280], 'N');
  put(plan, 'living', 'curtain', 'Curtains', [430, 49, 20, 280], 'E');
  put(plan, 'living', 'tv-unit', 'TV unit 180', [0, 115, 40, 180], 'W');
  put(plan, 'living', 'tv-wall', 'TV 65"', [0, 132.5, 8, 145], 'W');
  put(plan, 'living', 'speaker', 'Speaker', [25, 73, 30, 30], 'N');
  put(plan, 'living', 'speaker', 'Speaker', [25, 307, 30, 30], 'N');
  put(plan, 'living', 'sofa-l', 'L sofa 250x160', [160, 40, 160, 250], 'E', { color: OLIVE, flipped: true });
  put(plan, 'living', 'coffee-table', 'Coffee table', [130, 160, 56, 90], 'E');
  put(plan, 'living', 'table-round', 'Round table 105', [192.5, 300, 105, 105], 'N');
  put(plan, 'living', 'dining-chair', 'Chair', [147.5, 330, 45, 45], 'W');
  put(plan, 'living', 'dining-chair', 'Chair', [297.5, 330, 45, 45], 'E');
  put(plan, 'living', 'dining-chair', 'Chair', [222.5, 405, 45, 45], 'S');
  put(plan, 'living', 'dog-bed', 'Toto bed', [335, 0, 60, 50], 'N');
}

// First pass of sockets, switches, lights and data for layout B. A draft for the talk with the developer.
function electricalB(plan) {
  const L = (type, x, y, back) => mark(plan, 'living', type, x, y, back);
  for (const y of [175, 205, 235]) L('e-socket-2', 12, y, 'W');          // behind the TV unit
  L('e-network', 12, 262, 'W');
  L('e-feed', 12, 145, 'W');                                               // LED power supply
  L('e-socket', 12, 88, 'W');                                              // speakers
  L('e-socket', 12, 322, 'W');
  put(plan, 'living', 'e-led', 'LED strip', [2, 115, 6, 180], 'W');
  L('e-socket-2', 250, 12, 'N');                                           // sofa, bedroom end
  L('e-switch', 108, 12, 'N');                                             // two-way, bedroom door end
  L('e-switch', 12, 470, 'W');                                             // two-way, corridor end
  L('e-socket-2', 12, 400, 'W');                                           // table laptops, robot vacuum
  L('e-feed', 438, 30, 'E');                                               // curtain motor, for later
  L('e-light', 245, 352);                                                  // pendant over the table
  L('e-light', 190, 150);
  L('e-light', 300, 450);
  L('e-network', 60, 450);                                                 // ceiling point for Wi-Fi
  for (const x of [145.5, 195, 217, 265.5, 320]) L('e-socket', x, 548, 'S'); // fridge, oven, microwave, dishwasher, grinder
  L('e-socket-2', 270, 523, 'S');                                          // above the worktop
  L('e-socket-2', 350, 523, 'S');
  put(plan, 'living', 'e-led', 'LED strip', [235.5, 553, 194, 6], 'S');
  L('e-socket', 432, 420, 'E');                                            // hob
  L('e-socket', 432, 398, 'E');                                            // hood
  L('e-socket-2', 432, 468, 'E');
  L('e-socket-2', 432, 356, 'E');                                          // air fryer, toaster

  const B = (type, x, y, back) => mark(plan, 'bedroom', type, x, y, back);
  B('e-socket-2', 112, 12, 'N');
  B('e-socket-2', 392, 12, 'N');
  B('e-wall-light', 146, 7, 'N');
  B('e-wall-light', 346, 7, 'N');
  put(plan, 'bedroom', 'e-led', 'LED strip', [165, 2, 160, 6], 'N');
  B('e-socket-2', 230, 268, 'S');                                          // TV
  B('e-network', 262, 268, 'S');
  B('e-switch', 105, 276, 'S');
  B('e-light', 245, 150);
  B('e-feed', 440, 50, 'E');                                               // curtain motor, for later

  const G = (type, x, y, back) => mark(plan, 'gaming', type, x, y, back);
  for (const x of [120, 165, 210]) G('e-socket-2', x, 12, 'N');
  G('e-network', 242, 12, 'N');
  for (const x of [235, 275, 315]) G('e-socket-2', x, 277, 'S');
  G('e-network', 205, 277, 'S');
  put(plan, 'gaming', 'e-led', 'LED strip', [95, 2, 160, 6], 'N');
  G('e-light', 167, 145);
  G('e-switch', 12, 102, 'W');
  G('e-feed', 323, 60, 'E');                                               // AC unit

  mark(plan, 'laundry', 'e-socket', 20, 8, 'N');                           // washer
  mark(plan, 'laundry', 'e-socket', 42, 8, 'N');                           // dryer
  mark(plan, 'laundry', 'e-socket', 122, 30, 'E');                         // vacuum dock
}

function build(name, parts) {
  const plan = model.createPlan();
  plan.pxPerCm = K;
  plan.calibration = WALL;
  plan.calibrated = true;
  plan.image = { name: path.basename(IMAGE), type: 'image/png', width: 2067, height: 2576 };
  for (const part of parts) part(plan);
  const data = model.serialize(plan);
  data.imageData = 'data:image/png;base64,' + fs.readFileSync(IMAGE).toString('base64');
  fs.writeFileSync(path.join(ROOT, 'layouts', name + '.json'), JSON.stringify(data));
  const label = (id) => { const it = model.findItem(plan, id); return it.label || it.type; };
  const report = (flags) => [...flags].map(([id, f]) => label(id) + ' (' + f.reasons.join(', ') + ')').join('; ') || 'none';
  console.log(name + ': ' + plan.items.length + ' items, conflicts: ' + report(model.collisions(plan)));
  plan.settings.showClearances = true;
  console.log('  with clearances on: ' + report(model.collisions(plan)));
}

build('living-A-tv-on-bedroom-wall', [livingA, kitchen, bedroom, gaming, service]);
build('living-B-tv-on-left-wall', [livingB, kitchen, bedroom, gaming, service, electricalB]);

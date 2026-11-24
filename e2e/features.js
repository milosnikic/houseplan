// Feature checks beyond the vertical slice. Usage: node features.js file|http
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const L = require('./lib.js');

const mode = process.argv[2] || 'file';
const WALL = { a: { x: 782, y: 315 }, b: { x: 1549, y: 315 } };   // the 430 cm bedroom wall, image px

async function calibrate(page) {
  await page.click('#btn-scale');
  const i = await L.info(page);
  await L.click(page, L.imageToPage(i, WALL.a));
  await L.click(page, L.imageToPage(i, WALL.b));
  await page.keyboard.type('430');
  await page.keyboard.press('Enter');
  await L.frame(page);
}

async function add(page, type) {
  await page.click('.lib-item[data-type="' + type + '"]');
  await L.frame(page);
  const i = await L.info(page);
  return i.plan.items[i.plan.items.length - 1];
}

async function place(page, type, x, y, extra) {
  const it = await add(page, type);
  await L.setField(page, 'f-x', x);
  await L.setField(page, 'f-y', y);
  for (const [field, value] of Object.entries(extra || {})) await L.setField(page, field, value);
  await page.focus('#canvas');
  return it.id;
}

async function get(page, id) { const i = await L.info(page); return i.plan.items.find((it) => it.id === id); }

async function handlesOf(page, id) {
  return page.evaluate((id) => {
    const s = HP.app.state, it = s.plan.items.find((x) => x.id === id);
    const r = document.getElementById('canvas').getBoundingClientRect();
    const h = HP.render.handles(it, s.plan.pxPerCm * s.view.scale, s.view);
    const off = (p) => ({ x: p.x + r.left, y: p.y + r.top });
    return { corners: h.corners.map(off), rotate: off(h.rotate), center: off(h.center), bottomMid: off(h.bottomMid), rightMid: off(h.rightMid), up: h.up, right: h.right };
  }, id);
}

async function cornersCm(page, id) {
  return page.evaluate((id) => HP.geometry.rectCorners(HP.app.state.plan.items.find((x) => x.id === id)), id);
}

// Counts canvas pixels of a named color family in a box around a page point.
async function count(page, center, halfW, halfH, family) {
  await L.frame(page);
  return page.evaluate((cx, cy, hw, hh, family) => {
    const c = document.getElementById('canvas'), r = c.getBoundingClientRect(), k = c.width / r.width;
    const x0 = Math.round((cx - hw - r.left) * k), y0 = Math.round((cy - hh - r.top) * k);
    const d = c.getContext('2d').getImageData(x0, y0, Math.round(2 * hw * k), Math.round(2 * hh * k)).data;
    const is = {
      accent: (r, g, b) => Math.abs(r - 23) < 45 && Math.abs(g - 100) < 45 && b > 190,
      red: (r, g, b) => r > 190 && r - g > 30 && r - b > 30,
      amber: (r, g, b) => r > 200 && g > 150 && r - b > 50 && r - g < 110
    }[family];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (is(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, center.x, center.y, halfW, halfH, family);
}

function noisePng(file, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 1; x <= w * 3; x++) raw[row + x] = (Math.random() * 256) | 0;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))
  ]));
  return fs.statSync(file).size;
}

async function main() {
  let server = null, url = 'file://' + path.join(L.PROJECT, 'index.html');
  if (mode === 'http') {
    server = spawn('node', [path.join(L.PROJECT, 'tools/serve.js')], { env: { ...process.env, PORT: '5198' } });
    await new Promise((r) => server.stdout.once('data', r));
    url = 'http://localhost:5198/';
  }
  console.log('\n=== features over ' + url + ' ===');
  const browser = await L.launch();
  try {
    let page = await L.openPage(browser, url);
    await L.uploadImage(page, L.SAMPLE);
    await calibrate(page);
    let i = await L.info(page);
    L.check('setup: calibrated plan', i.plan.calibrated && Math.abs(i.plan.pxPerCm - 767 / 430) < 0.01, String(i.plan.pxPerCm));

    /* ---- 1. zoom and pan ---- */
    console.log('\n-- 1 zoom and pan');
    const P = { x: Math.round(i.rect.left + i.rect.width / 2 + 100), y: Math.round(i.rect.top + i.rect.height / 2 + 50) };
    await page.evaluate(() => { window.__wheel = []; document.getElementById('canvas').addEventListener('wheel', (e) => window.__wheel.push(e.deltaY), true); });
    const lastWheel = () => page.evaluate(() => window.__wheel[window.__wheel.length - 1]);
    const under = (inf, p) => ({ x: (p.x - inf.rect.left - inf.view.x) / inf.view.scale, y: (p.y - inf.rect.top - inf.view.y) / inf.view.scale });
    const fit = i.view;
    const before = under(i, P);
    await page.mouse.move(P.x, P.y);
    await page.mouse.wheel({ deltaY: -300 });
    await L.frame(page);
    i = await L.info(page);
    const after = under(i, P);
    let dy = await lastWheel();
    L.check('wheel zooms in', dy < 0 && Math.abs(i.view.scale / fit.scale - Math.exp(-dy * 0.0015)) < 0.001, (i.view.scale / fit.scale).toFixed(3) + 'x for deltaY ' + dy);
    L.check('wheel zoom keeps the point under the cursor', Math.abs(after.x - before.x) < 0.5 && Math.abs(after.y - before.y) < 0.5);
    const cdp = await page.createCDPSession();
    let s0 = i.view.scale;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: P.x, y: P.y, deltaX: 0, deltaY: -30, modifiers: 2 });
    await L.frame(page);
    i = await L.info(page);
    dy = await lastWheel();
    L.check('trackpad pinch (ctrl+wheel) zooms', dy < 0 && Math.abs(i.view.scale / s0 - Math.exp(-dy * 0.01)) < 0.001, (i.view.scale / s0).toFixed(3) + 'x for deltaY ' + dy);

    let v0 = i.view;
    await page.keyboard.down('Space');
    await L.drag(page, P, { x: P.x + 80, y: P.y + 40 });
    await page.keyboard.up('Space');
    i = await L.info(page);
    L.check('space+drag pans', Math.abs(i.view.x - v0.x - 80) < 0.5 && Math.abs(i.view.y - v0.y - 40) < 0.5, (i.view.x - v0.x) + ',' + (i.view.y - v0.y));
    v0 = i.view;
    await L.drag(page, { x: i.rect.left + 20, y: i.rect.top + 20 }, { x: i.rect.left + 50, y: i.rect.top + 70 });
    i = await L.info(page);
    L.check('dragging empty space pans', Math.abs(i.view.x - v0.x - 30) < 0.5 && Math.abs(i.view.y - v0.y - 50) < 0.5);
    v0 = i.view;
    await page.mouse.move(P.x, P.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(P.x - 40, P.y - 20, { steps: 3 });
    await page.mouse.up({ button: 'middle' });
    i = await L.info(page);
    L.check('middle-button drag pans', Math.abs(i.view.x - v0.x + 40) < 0.5 && Math.abs(i.view.y - v0.y + 20) < 0.5);
    await page.click('#btn-zoom-in');
    let z = (await L.info(page)).view.scale;
    L.check('zoom buttons work', Math.abs(z / i.view.scale - 1.25) < 0.001);
    await page.click('#btn-fit');
    i = await L.info(page);
    L.check('Fit restores the fit-to-screen view', Math.abs(i.view.scale - fit.scale) < 1e-9 && Math.abs(i.view.x - fit.x) < 1e-6);
    const zoomText = await page.$eval('#zoom-readout', (e) => e.textContent);
    L.check('zoom readout updates', zoomText === Math.round(fit.scale * 100) + '%', zoomText);

    // Two-finger pinch through touch events.
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const mid = { x: i.rect.left + i.rect.width / 2, y: i.rect.top + i.rect.height / 2 };
    const midBefore = under(i, mid);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid.x - 50, y: mid.y, id: 1 }, { x: mid.x + 50, y: mid.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mid.x - 75, y: mid.y, id: 1 }, { x: mid.x + 75, y: mid.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mid.x - 100, y: mid.y, id: 1 }, { x: mid.x + 100, y: mid.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await L.frame(page);
    let t = await L.info(page);
    const midAfter = under(t, mid);
    L.check('two-finger pinch zooms about the fingers', Math.abs(t.view.scale / fit.scale - 2) < 0.02 && Math.abs(midAfter.x - midBefore.x) < 1 && Math.abs(midAfter.y - midBefore.y) < 1,
      (t.view.scale / fit.scale).toFixed(3) + 'x');
    L.check('pinch leaves the plan untouched', t.plan.items.length === 0 && t.selection.length === 0);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // Work zoomed in a little so handles are comfortable: about 1.2 screen px per cm.
    await page.click('#btn-fit');
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel({ deltaY: -1066 });
    await L.frame(page);
    i = await L.info(page);
    const k = i.plan.pxPerCm * i.view.scale;
    console.log('  working zoom: ' + k.toFixed(3) + ' screen px per cm');

    /* ---- 2. placement and snapping ---- */
    console.log('\n-- 2 placement and snapping');
    const onGrid = (b) => { const fx = ((b.x - b.w / 2) / 5), fy = ((b.y - b.d / 2) / 5); return Math.abs(fx - Math.round(fx)) < 1e-6 && Math.abs(fy - Math.round(fy)) < 1e-6; };
    let desk = await add(page, 'desk');
    L.check('library click adds a snapped item', desk.type === 'desk' && desk.w === 120 && desk.d === 60 && onGrid(desk), desk.x + ',' + desk.y);
    const second = await add(page, 'desk');
    L.check('a second add does not stack on the first', second.x === desk.x + 20 && second.y === desk.y + 20, second.x + ',' + second.y);
    await page.keyboard.press('Delete');
    i = await L.info(page);
    L.check('Delete removes the selected item', i.plan.items.length === 1 && i.selection.length === 0);

    let c = L.planToPage(i, desk);
    await L.drag(page, c, { x: c.x + 77, y: c.y + 43 });
    let d1 = await get(page, desk.id);
    L.check('drag snaps to the 5 cm grid', onGrid(d1) && Math.abs(d1.x - desk.x - 77 / k) <= 2.6 && Math.abs(d1.y - desk.y - 43 / k) <= 2.6, d1.x + ',' + d1.y);
    c = L.planToPage(i, d1);
    await L.drag(page, c, { x: c.x + 33, y: c.y + 19 }, { keys: ['Alt'] });
    let d2 = await get(page, desk.id);
    L.check('Alt switches snapping off during the drag', !onGrid(d2) && Math.abs(d2.x - d1.x - 33 / k) < 0.1 && Math.abs(d2.y - d1.y - 19 / k) < 0.1, d2.x + ',' + d2.y);
    await page.click('#chk-snap');
    c = L.planToPage(i, d2);
    await L.drag(page, c, { x: c.x + 21, y: c.y + 17 });
    let d3 = await get(page, desk.id);
    L.check('snap toggle off gives free movement', !onGrid(d3) && Math.abs(d3.x - d2.x - 21 / k) < 0.1, d3.x + ',' + d3.y);
    await page.click('#chk-snap');
    c = L.planToPage(i, d3);
    await L.drag(page, c, { x: c.x + 10, y: c.y + 10 });
    d3 = await get(page, desk.id);
    L.check('snap toggle on snaps again', onGrid(d3), d3.x + ',' + d3.y);
    const active = await page.evaluate(() => document.activeElement.id);
    L.check('focus returns to the canvas after using controls', active === 'canvas', active);

    // Escape abandons a drag in progress and puts the item back.
    c = L.planToPage(i, d3);
    await L.drag(page, c, { x: c.x + 90, y: c.y + 60 }, { beforeRelease: async () => {
      const midDrag = await get(page, desk.id);
      L.check('item follows the pointer during the drag', midDrag.x > d3.x + 50);
      await page.keyboard.press('Escape');
    } });
    let d4 = await get(page, desk.id);
    i = await L.info(page);
    L.check('Escape cancels the drag and restores the position', d4.x === d3.x && d4.y === d3.y);

    /* ---- 3. rotate and resize ---- */
    console.log('\n-- 3 rotate and resize');
    const turn = (p, center, deg) => { const r = deg * Math.PI / 180; const dx = p.x - center.x, dy = p.y - center.y; return { x: center.x + dx * Math.cos(r) - dy * Math.sin(r), y: center.y + dx * Math.sin(r) + dy * Math.cos(r) }; };
    let h = await handlesOf(page, desk.id);
    await L.drag(page, h.rotate, turn(h.rotate, h.center, 40));
    let r1 = await get(page, desk.id);
    L.check('rotate handle snaps to 15 degree steps', r1.rot === 45 && r1.x === d3.x && r1.y === d3.y, 'rot ' + r1.rot);
    h = await handlesOf(page, desk.id);
    await L.drag(page, h.rotate, turn(h.rotate, h.center, 22), { keys: ['Shift'] });
    let r2 = await get(page, desk.id);
    L.check('Shift gives free rotation', Math.abs(r2.rot - 67) < 1.5 && r2.rot % 15 !== 0, 'rot ' + r2.rot);
    await L.setField(page, 'f-rot', 0);
    await page.focus('#canvas');

    let base = await get(page, desk.id);
    let cornersBefore = await cornersCm(page, desk.id);
    h = await handlesOf(page, desk.id);
    await L.drag(page, h.corners[2], { x: h.corners[2].x + 50, y: h.corners[2].y + 30 });
    let s1 = await get(page, desk.id);
    let cornersAfter = await cornersCm(page, desk.id);
    const want = { w: Math.round((120 + 50 / k) / 5) * 5, d: Math.round((60 + 30 / k) / 5) * 5 };
    L.check('corner handle resizes in 5 cm steps', s1.w === want.w && s1.d === want.d, s1.w + ' x ' + s1.d + ' (wanted ' + want.w + ' x ' + want.d + ')');
    L.check('opposite corner stays fixed while resizing', Math.abs(cornersAfter[0].x - cornersBefore[0].x) < 0.02 && Math.abs(cornersAfter[0].y - cornersBefore[0].y) < 0.02);

    await L.setField(page, 'f-rot', 30);
    await page.focus('#canvas');
    cornersBefore = await cornersCm(page, desk.id);
    h = await handlesOf(page, desk.id);
    await L.drag(page, h.corners[0], { x: h.corners[0].x - 37, y: h.corners[0].y - 11 }, { keys: ['Alt'] });
    cornersAfter = await cornersCm(page, desk.id);
    let s2 = await get(page, desk.id);
    i = await L.info(page);
    const target = { x: (h.corners[0].x - 37 - i.rect.left - i.view.x) / k, y: (h.corners[0].y - 11 - i.rect.top - i.view.y) / k };
    L.check('resizing a rotated item keeps the opposite corner fixed', Math.abs(cornersAfter[2].x - cornersBefore[2].x) < 0.03 && Math.abs(cornersAfter[2].y - cornersBefore[2].y) < 0.03 && s2.rot === 30);
    L.check('the dragged corner follows the pointer', Math.abs(cornersAfter[0].x - target.x) < 0.5 && Math.abs(cornersAfter[0].y - target.y) < 0.5,
      cornersAfter[0].x.toFixed(1) + ',' + cornersAfter[0].y.toFixed(1) + ' vs ' + target.x.toFixed(1) + ',' + target.y.toFixed(1));
    await L.setField(page, 'f-rot', 0);
    await page.focus('#canvas');

    const round = await add(page, 'table-round');
    h = await handlesOf(page, round.id);
    await L.drag(page, h.corners[2], { x: h.corners[2].x + 40, y: h.corners[2].y + 5 });
    let rt = await get(page, round.id);
    L.check('round table stays round when resized', rt.w === rt.d && rt.w > 110 && rt.w % 5 === 0, rt.w + ' x ' + rt.d);
    await page.keyboard.press('Delete');

    /* ---- 5. selection and editing ---- */
    console.log('\n-- 5 selection and editing');
    await page.click('#btn-fit');
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel({ deltaY: -1066 });
    await L.frame(page);
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    i = await L.info(page);
    L.check('Ctrl+A then Delete clears the plan', i.plan.items.length === 0);

    const A = await place(page, 'desk', 500, 700);
    const B = await place(page, 'armchair', 700, 700);
    i = await L.info(page);
    L.check('properties panel sets X and Y in cm', i.plan.items[0].x === 500 && i.plan.items[0].y === 700 && i.plan.items[1].x === 700);
    await L.click(page, L.planToPage(i, { x: 600, y: 850 }));
    i = await L.info(page);
    L.check('clicking empty space clears the selection', i.selection.length === 0);
    L.check('inspector shows the empty state', await page.$eval('#insp-none', (e) => !e.hidden) && await page.$eval('#insp-selection', (e) => e.hidden));
    await L.click(page, L.planToPage(i, { x: 500, y: 700 }));
    i = await L.info(page);
    L.check('click selects one item', i.selection.length === 1 && i.selection[0] === A);
    await L.click(page, L.planToPage(i, { x: 700, y: 700 }), { keys: ['Shift'] });
    i = await L.info(page);
    L.check('shift-click adds to the selection', i.selection.length === 2);
    const title = await page.$eval('#insp-title', (e) => e.textContent);
    L.check('inspector reports the group', title === '2 items selected' && await page.$eval('#insp-fields', (e) => e.hidden), title);
    await page.screenshot({ path: path.join(L.SHOTS, 'multi-' + mode + '.png') });

    c = L.planToPage(i, { x: 500, y: 700 });
    await L.drag(page, c, { x: c.x + 60, y: c.y + 36 });
    i = await L.info(page);
    let a = i.plan.items.find((x) => x.id === A), b = i.plan.items.find((x) => x.id === B);
    L.check('dragging one of a group moves the group together', a.x - 500 === b.x - 700 && a.y - 700 === b.y - 700 && a.x > 500 && i.selection.length === 2, 'delta ' + (a.x - 500) + ',' + (a.y - 700));
    await L.click(page, L.planToPage(i, b), { keys: ['Shift'] });
    i = await L.info(page);
    L.check('shift-click again removes from the selection', i.selection.length === 1 && i.selection[0] === A);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    let n1 = await get(page, A);
    L.check('arrow keys nudge 1 cm', n1.x === a.x + 1 && n1.y === a.y + 1);
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Shift');
    let n2 = await get(page, A);
    L.check('shift+arrow nudges 10 cm', n2.x === n1.x - 10 && n2.y === n1.y - 10);

    i = await L.info(page);
    const countBefore = i.plan.items.length;
    await L.combo(page, 'Control', 'd');
    i = await L.info(page);
    let dup = i.plan.items[i.plan.items.length - 1];
    L.check('Ctrl+D duplicates with an offset and selects the copy', i.plan.items.length === countBefore + 1 && dup.x === n2.x + 20 && dup.y === n2.y + 20 && i.selection[0] === dup.id && dup.type === 'desk');
    await L.combo(page, 'Meta', 'd');
    i = await L.info(page);
    L.check('Cmd+D duplicates too', i.plan.items.length === countBefore + 2);
    await L.combo(page, 'Control', 'c');
    await L.combo(page, 'Control', 'v');
    await L.combo(page, 'Control', 'v');
    i = await L.info(page);
    const src = i.plan.items[countBefore + 1], p1 = i.plan.items[countBefore + 2], p2 = i.plan.items[countBefore + 3];
    L.check('Ctrl+C then Ctrl+V pastes copies, each a step further', i.plan.items.length === countBefore + 4 && p1.x === src.x + 20 && p2.x === src.x + 40 && i.selection[0] === p2.id,
      i.plan.items.length + ' items');
    await page.keyboard.press('Backspace');
    i = await L.info(page);
    L.check('Backspace deletes as well', i.plan.items.length === countBefore + 3);
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    i = await L.info(page);
    L.check('Ctrl+A selects everything', i.selection.length === i.plan.items.length);
    await page.keyboard.press('Escape');
    i = await L.info(page);
    L.check('Escape clears the selection', i.selection.length === 0);

    // Properties panel: every field.
    await L.click(page, L.planToPage(i, b));
    await L.setField(page, 'f-label', 'Reading chair');
    await L.setField(page, 'f-x', 640.5);
    await L.setField(page, 'f-y', 512);
    await L.setField(page, 'f-w', 95);
    await L.setField(page, 'f-d', 85);
    await L.setField(page, 'f-rot', 30);
    b = await get(page, B);
    L.check('panel edits label, X, Y, width, depth and rotation', b.label === 'Reading chair' && b.x === 640.5 && b.y === 512 && b.w === 95 && b.d === 85 && b.rot === 30, JSON.stringify(b));
    await L.setField(page, 'f-w', 1);
    await L.setField(page, 'f-rot', -90);
    b = await get(page, B);
    const shownW = await page.$eval('#f-w', (e) => e.value), shownRot = await page.$eval('#f-rot', (e) => e.value);
    L.check('panel clamps bad numbers and shows the stored value', b.w === 5 && b.rot === 270 && shownW === '5' && shownRot === '270', shownW + ' / ' + shownRot);
    await L.setField(page, 'f-w', 95);
    await L.setField(page, 'f-rot', 0);
    await page.focus('#f-x');
    await page.keyboard.press('Delete');
    i = await L.info(page);
    L.check('Delete typed inside a field does not delete the item', !!i.plan.items.find((x) => x.id === B));
    await page.keyboard.press('Escape');
    await page.focus('#canvas');

    /* ---- 6. measurements ---- */
    console.log('\n-- 6 measurements');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    const M1 = await place(page, 'desk', 500, 700);            // spans x 440..560, y 670..730
    const M2 = await place(page, 'wardrobe-120', 700, 700);    // spans x 640..760: gap of 80 cm
    i = await L.info(page);
    await L.click(page, L.planToPage(i, { x: 500, y: 700 }));
    h = await handlesOf(page, M1);
    const wPill = await count(page, { x: h.bottomMid.x, y: h.bottomMid.y + 16 }, 22, 9, 'accent');
    const dPill = await count(page, { x: h.rightMid.x + 28, y: h.rightMid.y }, 22, 9, 'accent');
    L.check('selected item shows width and depth labels on the canvas', wPill > 150 && dPill > 150, wPill + ' / ' + dPill + ' accent px');
    const gap = await page.evaluate((id) => { const s = HP.app.state; const n = HP.model.nearestItem(s.plan, s.plan.items.find((x) => x.id === id), s.selection); return { dist: n.dist, a: n.a, b: n.b }; }, M1);
    L.check('nearest-item distance is the real gap', Math.abs(gap.dist - 80) < 1e-6 && gap.a.y === 700 && gap.b.y === 700, JSON.stringify(gap));
    const gapMid = L.planToPage(i, { x: 600, y: 700 });
    let linePx = await count(page, { x: gapMid.x + 34, y: gapMid.y }, 6, 4, 'accent');   // between the label and the wardrobe
    L.check('distance line is drawn to the nearest item', linePx > 10, linePx + ' accent px');
    await page.screenshot({ path: path.join(L.SHOTS, 'measure-' + mode + '.png') });
    await page.click('#chk-distance');
    linePx = await count(page, { x: gapMid.x + 34, y: gapMid.y }, 6, 4, 'accent');
    L.check('distance line can be switched off', linePx === 0, linePx + ' accent px');
    // While dragging the line is live even when the option is off.
    c = L.planToPage(i, { x: 500, y: 700 });
    let liveCount = -1;
    await L.drag(page, c, { x: c.x - 24, y: c.y }, { beforeRelease: async () => {
      const now = await L.info(page);
      const m1 = now.plan.items.find((x) => x.id === M1);
      const midNow = L.planToPage(now, { x: (m1.x + 60 + 640) / 2, y: 700 });
      liveCount = await count(page, { x: midNow.x + 34, y: midNow.y }, 6, 4, 'accent');
    } });
    L.check('a live dimension line shows while dragging', liveCount > 10, liveCount + ' accent px');
    await page.click('#chk-distance');
    await page.focus('#canvas');

    /* ---- 7. order and lock ---- */
    console.log('\n-- 7 order and lock');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    const O1 = await place(page, 'table-6', 500, 700);     // 180 x 90
    const O2 = await place(page, 'coffee-table', 540, 700); // on top, overlapping
    i = await L.info(page);
    const overlapPt = L.planToPage(i, { x: 520, y: 700 });
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    await L.click(page, overlapPt);
    i = await L.info(page);
    L.check('click picks the top item where two overlap', i.selection[0] === O2);
    await L.click(page, L.planToPage(i, { x: 425, y: 700 }));
    await page.click('#btn-front');
    i = await L.info(page);
    L.check('To front moves the item to the top of the order', i.plan.items[i.plan.items.length - 1].id === O1);
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    await L.click(page, overlapPt);
    i = await L.info(page);
    L.check('the raised item is now the one picked', i.selection[0] === O1);
    await page.click('#btn-back');
    i = await L.info(page);
    L.check('To back moves it under the others', i.plan.items[0].id === O1);
    await page.keyboard.press(']');
    i = await L.info(page);
    L.check('] and [ keys reorder too', i.plan.items[i.plan.items.length - 1].id === O1);
    await page.keyboard.press('[');

    await page.click('#f-locked');
    let o1 = await get(page, O1);
    L.check('lock checkbox locks the item', o1.locked === true);
    L.check('locked item has its geometry fields disabled', await page.$eval('#f-x', (e) => e.disabled) && await page.$eval('#f-w', (e) => e.disabled) && await page.$eval('#f-rot', (e) => e.disabled));
    c = L.planToPage(i, { x: 425, y: 700 });
    await L.drag(page, c, { x: c.x + 70, y: c.y + 40 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    await page.keyboard.press('Delete');
    let o1b = await get(page, O1);
    L.check('locked item ignores drag, nudge, rotate and delete', o1b && o1b.x === 500 && o1b.y === 700 && o1b.rot === 0);
    await page.screenshot({ path: path.join(L.SHOTS, 'locked-' + mode + '.png') });
    await page.keyboard.press('l');
    o1b = await get(page, O1);
    L.check('L key unlocks', o1b.locked === false);
    await L.drag(page, c, { x: c.x + 70, y: c.y + 40 });
    o1b = await get(page, O1);
    L.check('unlocked item moves again', o1b.x > 500);

    /* ---- 8. collisions ---- */
    console.log('\n-- 8 collisions');
    await L.sleep(3700);
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Delete');
    const C1 = await place(page, 'sofa-3', 500, 700);       // x 395..605, y 655..745
    const C2 = await place(page, 'coffee-table', 600, 700); // overlaps the sofa
    i = await L.info(page);
    let flags = new Map(i.collisions);
    L.check('overlapping furniture is flagged as a conflict', flags.get(C1)?.level === 'error' && flags.get(C2)?.level === 'error', JSON.stringify(i.collisions));
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    let redA = await count(page, L.planToPage(i, { x: 430, y: 720 }), 8, 8, 'red');
    L.check('conflicting items are drawn in red', redA > 100, redA + ' red px');
    const flagText = await (async () => { await L.click(page, L.planToPage(i, { x: 430, y: 720 })); return page.$eval('#insp-flag', (e) => e.hidden ? '' : e.textContent); })();
    L.check('inspector names the conflict', /Overlaps another item/.test(flagText), flagText);
    await page.screenshot({ path: path.join(L.SHOTS, 'collision-' + mode + '.png') });
    await L.click(page, L.planToPage(i, { x: 640, y: 700 }));
    await L.setField(page, 'f-x', 655);                     // table now starts at x 605, flush with the sofa
    await page.focus('#canvas');
    i = await L.info(page);
    L.check('flush items are not flagged', i.collisions.length === 0, JSON.stringify(i.collisions));
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    redA = await count(page, L.planToPage(i, { x: 430, y: 720 }), 8, 8, 'red');
    L.check('red clears once the overlap is gone', redA === 0, redA + ' red px');

    await L.click(page, L.planToPage(i, { x: 655, y: 700 }));
    await L.setField(page, 'f-x', 30);                      // sticks out over the left edge of the image
    await page.focus('#canvas');
    i = await L.info(page);
    flags = new Map(i.collisions);
    L.check('an item outside the plan is flagged', flags.get(C2)?.reasons.includes('outside'), JSON.stringify(i.collisions));
    await L.setField(page, 'f-x', 655);
    await page.focus('#canvas');

    const W1 = await place(page, 'window', 500, 700);
    const D1 = await place(page, 'door', 800, 700);
    i = await L.info(page);
    L.check('a window over furniture triggers nothing', i.collisions.length === 0, JSON.stringify(i.collisions));
    await L.setField(page, 'f-x', 560);                     // door swing now over the sofa
    await page.focus('#canvas');
    i = await L.info(page);
    flags = new Map(i.collisions);
    L.check('a door swing over furniture is a soft warning on both', flags.get(D1)?.level === 'warn' && flags.get(C1)?.level === 'warn' && !flags.has(W1), JSON.stringify(i.collisions));
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    const amber = await count(page, L.planToPage(i, { x: 420, y: 730 }), 8, 8, 'amber');
    const redB = await count(page, L.planToPage(i, { x: 420, y: 730 }), 8, 8, 'red');
    L.check('warned furniture is drawn amber, not red', amber > 100 && redB === 0, amber + ' amber, ' + redB + ' red');
    await L.click(page, L.planToPage(i, { x: 545, y: 715 }));
    i = await L.info(page);
    const flipVisible = await page.$eval('#btn-flip', (e) => !e.hidden);
    await page.click('#btn-flip');
    let door = await get(page, D1);
    L.check('door swing can be flipped', i.selection[0] === D1 && flipVisible && door.flipped === true);
    const doorFlag = await page.$eval('#insp-flag', (e) => e.textContent);
    L.check('the door itself is described as blocked', /Furniture is in the way of this door/.test(doorFlag) && (await L.info(page)).toast === null, doorFlag);
    await page.screenshot({ path: path.join(L.SHOTS, 'door-' + mode + '.png') });

    /* ---- 2b. recalibrate with furniture on the plan ---- */
    console.log('\n-- 2b recalibration');
    i = await L.info(page);
    const sofaBefore = i.plan.items.find((x) => x.id === C1);
    const sofaPx = { x: sofaBefore.x * i.plan.pxPerCm, y: sofaBefore.y * i.plan.pxPerCm };
    const scaleBefore = i.plan.pxPerCm;
    await page.click('#btn-fit');
    await page.click('#btn-scale');
    await L.frame(page);
    await page.screenshot({ path: path.join(L.SHOTS, 'calibrate-saved-' + mode + '.png') });
    i = await L.info(page);
    await L.click(page, L.imageToPage(i, WALL.a));
    await page.mouse.move(L.imageToPage(i, WALL.b).x, L.imageToPage(i, WALL.b).y + 9);
    await page.keyboard.down('Shift');
    await L.frame(page);
    await page.screenshot({ path: path.join(L.SHOTS, 'calibrate-live-' + mode + '.png') });
    await page.mouse.down(); await page.mouse.up();
    await page.keyboard.up('Shift');
    await L.frame(page);
    i = await L.info(page);
    L.check('Shift keeps the calibration line straight', i.dialogOpen && /The line is 767 px long.*that is 430 cm/.test(i.dialogText), i.dialogText);
    await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta');
    await page.keyboard.type('860');
    await page.keyboard.press('Enter');
    await L.frame(page);
    i = await L.info(page);
    let sofaAfter = i.plan.items.find((x) => x.id === C1);
    L.check('recalibrating changes the scale', Math.abs(i.plan.pxPerCm - 767 / 860) < 1e-4 && i.plan.calibration.cm === 860, String(i.plan.pxPerCm));
    L.check('furniture stays on the same image pixels and keeps its cm size',
      Math.abs(sofaAfter.x * i.plan.pxPerCm - sofaPx.x) < 0.02 && Math.abs(sofaAfter.y * i.plan.pxPerCm - sofaPx.y) < 0.02 && sofaAfter.w === 210 && sofaAfter.d === 90,
      'x ' + sofaBefore.x + ' -> ' + sofaAfter.x + ' cm');
    await L.combo(page, 'Control', 'z');
    i = await L.info(page);
    sofaAfter = i.plan.items.find((x) => x.id === C1);
    L.check('undo restores the previous scale and positions', i.plan.pxPerCm === scaleBefore && sofaAfter.x === sofaBefore.x && i.plan.calibration.cm === 430);
    await page.click('#btn-scale');
    await page.keyboard.press('Escape');
    i = await L.info(page);
    L.check('Escape leaves the scale tool', i.tool === 'select');
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel({ deltaY: -1066 });
    await L.frame(page);

    /* ---- 11. custom item ---- */
    console.log('\n-- 11 custom item');
    await page.click('#custom-name', { count: 3 });
    await page.keyboard.type('Piano');
    await page.click('#custom-w', { count: 3 });
    await page.keyboard.type('150');
    await page.click('#custom-d', { count: 3 });
    await page.keyboard.type('65');
    await page.$eval('#custom-color', (e) => { e.value = '#7a3b8f'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.click('#custom-form button[type="submit"]');
    await L.frame(page);
    i = await L.info(page);
    const piano = i.plan.items[i.plan.items.length - 1];
    L.check('custom item has its name, size and color', piano.type === 'custom' && piano.label === 'Piano' && piano.w === 150 && piano.d === 65 && piano.color === '#7a3b8f', JSON.stringify(piano));
    L.check('custom item is selected and counts as furniture', i.selection[0] === piano.id && piano.blocking === true);
    await L.setField(page, 'f-x', 900);
    await L.setField(page, 'f-y', 1000);
    await page.focus('#canvas');
    i = await L.info(page);
    await L.click(page, L.planToPage(i, { x: 600, y: 900 }));
    const px = await L.pixel(page, L.planToPage(i, { x: 850, y: 1020 }));
    L.check('custom color is used on the canvas', Math.abs(px[0] - 0x7a) < 20 && Math.abs(px[1] - 0x3b) < 25 && Math.abs(px[2] - 0x8f) < 20, px.join(','));

    /* ---- 10. undo and redo ---- */
    console.log('\n-- 10 undo and redo');
    await L.click(page, L.planToPage(i, { x: 900, y: 1000 }));
    i = await L.info(page);
    const startSteps = i.undoSteps;
    const startPlan = JSON.stringify(i.plan.items);
    for (let n = 0; n < 60; n++) await page.keyboard.press('r');
    await L.frame(page);
    i = await L.info(page);
    const endPlan = JSON.stringify(i.plan.items);
    L.check('60 edits make 60 undo steps', i.undoSteps === Math.min(100, startSteps + 60), 'undo steps ' + i.undoSteps + ' (was ' + startSteps + ')');
    for (let n = 0; n < 60; n++) await L.combo(page, 'Control', 'z');
    i = await L.info(page);
    L.check('Ctrl+Z 60 times returns to the starting layout', JSON.stringify(i.plan.items) === startPlan);
    for (let n = 0; n < 60; n++) { await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control'); }
    await L.frame(page);
    i = await L.info(page);
    L.check('Ctrl+Shift+Z 60 times replays every step', JSON.stringify(i.plan.items) === endPlan && !i.canRedo);
    await L.combo(page, 'Meta', 'z');
    i = await L.info(page);
    L.check('Cmd+Z undoes too', i.canRedo);
    await page.click('#btn-redo');
    i = await L.info(page);
    L.check('Redo button works and then disables', !i.canRedo && await page.$eval('#btn-redo', (e) => e.disabled));
    const stepsBefore = i.undoSteps;
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    i = await L.info(page);
    L.check('a burst of nudges is one undo step', i.undoSteps === Math.min(100, stepsBefore + 1), 'steps ' + stepsBefore + ' -> ' + i.undoSteps);
    await page.click('#btn-undo');
    let pianoNow = await get(page, piano.id);
    L.check('Undo button reverts the nudges', pianoNow.x === 900);

    /* ---- 9. persistence: export, import, PNG ---- */
    console.log('\n-- 9 persistence');
    await L.allowDownloads(page);
    i = await L.info(page);
    const savedPlan = i.plan;
    await page.click('#btn-export-json');
    const jsonFile = await L.waitForFile('houseplan-layout.json');
    L.check('Export JSON downloads a file', !!jsonFile);
    const exported = jsonFile ? JSON.parse(fs.readFileSync(jsonFile, 'utf8')) : {};
    L.check('exported JSON carries the layout and the image', exported.app === 'houseplan' && exported.items.length === savedPlan.items.length && /^data:image\/png;base64,/.test(exported.imageData || '') && exported.calibration.cm === 430,
      jsonFile ? fs.statSync(jsonFile).size + ' bytes' : '');
    const origBytes = fs.readFileSync(L.SAMPLE);
    L.check('the image inside the JSON is byte-identical to the original', exported.imageData && Buffer.from(exported.imageData.split(',')[1], 'base64').equals(origBytes));

    await page.click('#btn-export-png');
    const pngFile = await L.waitForFile('houseplan.png');
    L.check('Export PNG downloads a file', !!pngFile);
    if (pngFile) {
      const png = fs.readFileSync(pngFile);
      const w = png.readUInt32BE(16), hgt = png.readUInt32BE(20);
      L.check('PNG is a real image at the plan resolution', png.slice(1, 4).toString() === 'PNG' && w === 2067 && hgt === 2576, w + 'x' + hgt + ', ' + png.length + ' bytes');
      // Decode the exported file in the page and compare with the source image.
      const cmp = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        const s = HP.app.state, kk = s.plan.pxPerCm;
        const at = (x, y) => [...ctx.getImageData(Math.round(x * kk), Math.round(y * kk), 1, 1).data];
        const src = document.createElement('canvas'); src.width = img.naturalWidth; src.height = img.naturalHeight;
        const sctx = src.getContext('2d'); sctx.drawImage(s.image, 0, 0);
        const sat = (x, y) => [...sctx.getImageData(Math.round(x * kk), Math.round(y * kk), 1, 1).data];
        return { piano: at(850, 1020), sofa: at(430, 720), wall: at(100 / kk, 100 / kk), srcWall: sat(100 / kk, 100 / kk), emptyOut: at(300, 300), emptySrc: sat(300, 300) };
      }, png.toString('base64'));
      L.check('PNG contains the furniture over the plan', Math.abs(cmp.piano[0] - 0x7a) < 20 && Math.abs(cmp.piano[2] - 0x8f) < 20 && cmp.sofa[0] > 200 && cmp.sofa[0] < 245, JSON.stringify(cmp));
      L.check('PNG keeps the plan pixels where nothing is placed', cmp.emptyOut.join() === cmp.emptySrc.join() && cmp.wall.join() === cmp.srcWall.join());
      L.check('PNG shows warning-free furniture colors (no conflict tint)', !(cmp.sofa[0] - cmp.sofa[2] > 40), cmp.sofa.join(','));
    }

    await page.click('#btn-new');
    await L.frame(page);
    i = await L.info(page);
    L.check('New plan asks first', i.dialogOpen && i.plan.items.length === savedPlan.items.length);
    await page.click('#dialog-ok');
    await L.sleep(300);
    i = await L.info(page);
    L.check('New plan clears items, image and scale', i.plan.items.length === 0 && !i.plan.image && !i.hasImage && !i.plan.calibrated && i.undoSteps === 0);
    await page.close();
    page = await L.openPage(browser, url);
    i = await L.info(page);
    L.check('the cleared plan stays cleared after a reload', i.plan.items.length === 0 && !i.plan.image && !i.hasImage);

    // Bad files are refused without touching the plan.
    const bad = path.join(L.DOWNLOADS, 'bad.json'), other = path.join(L.DOWNLOADS, 'other.json');
    fs.writeFileSync(bad, '{ not json');
    fs.writeFileSync(other, JSON.stringify({ hello: 'world' }));
    await (await page.$('#file-json')).uploadFile(bad);
    await L.sleep(150);
    i = await L.info(page);
    L.check('invalid JSON is refused with a message', /not valid JSON/.test(i.toast || '') && i.plan.items.length === 0, i.toast);
    await (await page.$('#file-json')).uploadFile(other);
    await L.sleep(150);
    i = await L.info(page);
    L.check('a foreign JSON file is refused with a message', /not a Houseplan layout/.test(i.toast || ''), i.toast);

    await (await page.$('#file-json')).uploadFile(jsonFile);
    await page.waitForFunction(() => HP.app.state.image && HP.app.state.plan.items.length > 0);
    await L.sleep(400);
    i = await L.info(page);
    L.check('Import JSON restores every item', JSON.stringify(i.plan.items) === JSON.stringify(savedPlan.items), i.plan.items.length + ' items');
    L.check('Import JSON restores the image and the scale', i.hasImage && i.natural[0] === 2067 && i.natural[1] === 2576 && i.plan.calibrated && i.plan.pxPerCm === savedPlan.pxPerCm && i.plan.image.name === 'floorplan-empty.png');
    L.check('imported plan is autosaved with its image', i.imageStore === 'indexeddb' && /^Saved in this browser$/.test(i.saveText), i.saveText);
    await page.close();
    page = await L.openPage(browser, url);
    i = await L.info(page);
    L.check('imported plan survives a reload', i.hasImage && JSON.stringify(i.plan.items) === JSON.stringify(savedPlan.items));
    await page.screenshot({ path: path.join(L.SHOTS, 'restored-' + mode + '.png') });

    // Drag and drop of an image file onto the window.
    await L.allowDownloads(page);
    await page.click('#btn-new');
    await page.click('#dialog-ok');
    await L.sleep(200);
    await page.evaluate((b64) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let n = 0; n < bin.length; n++) bytes[n] = bin.charCodeAt(n);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
      const stage = document.getElementById('stage');
      window.__over = !stage.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      window.__dropping = stage.classList.contains('dropping');
      stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, origBytes.toString('base64'));
    await page.waitForFunction(() => HP.app.state.image, { timeout: 5000 }).catch(() => {});
    i = await L.info(page);
    const dropState = await page.evaluate(() => ({ over: window.__over, dropping: window.__dropping, still: document.getElementById('stage').classList.contains('dropping') }));
    L.check('dropping an image file loads it (synthetic drop event)', i.hasImage && i.plan.image.name === 'dropped.png' && dropState.over && dropState.dropping && !dropState.still, JSON.stringify(dropState));

    /* ---- large images and storage limits ---- */
    console.log('\n-- storage limits');
    const big = path.join(L.DOWNLOADS, 'big-noise.png');
    const bigSize = noisePng(big, 2200, 1500);
    console.log('  generated ' + (bigSize / 1048576).toFixed(1) + ' MB test image');
    await L.uploadImage(page, big);
    await add(page, 'bed-double');
    await L.sleep(1200);
    i = await L.info(page);
    const layoutLen = await page.evaluate(() => localStorage.getItem('houseplan.layout.v1').length);
    L.check('a ' + (bigSize / 1048576).toFixed(1) + ' MB image autosaves without error', i.imageStore === 'indexeddb' && /^Saved in this browser$/.test(i.saveText) && page.errors.length === 0, i.saveText + ' ' + page.errors.join('|'));
    L.check('localStorage holds only the small layout', layoutLen < 2000 && await page.evaluate(() => localStorage.getItem('houseplan.image.v1') === null), layoutLen + ' chars');
    await page.close();
    page = await L.openPage(browser, url);
    i = await L.info(page);
    L.check('the large image comes back after a reload', i.hasImage && i.natural[0] === 2200 && i.natural[1] === 1500 && i.plan.items.length === 1);
    L.check('JSON export of the large plan still carries the image', await page.evaluate(async () => (await HP.storage.blobToDataUrl(HP.app.state.imageBlob)).length) > bigSize);
    const allErrors = page.errors.slice();
    await page.close();

    // IndexedDB unavailable: a downscaled copy goes to localStorage instead.
    const noIdb = (pg) => pg.evaluateOnNewDocument(() => { Object.defineProperty(window, 'indexedDB', { get() { return undefined; } }); });
    page = await L.openPage(browser, url, null, noIdb);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.HP && HP.app);
    await page.evaluate(() => HP.app.started);
    await L.uploadImage(page, L.SAMPLE);
    await calibrate(page);
    await add(page, 'sofa-3');
    await L.sleep(800);
    i = await L.info(page);
    L.check('without IndexedDB the image is kept as a smaller copy', i.imageStore === 'copy' && /smaller copy/.test(i.saveText), i.saveText);
    const copyLen = await page.evaluate(() => (localStorage.getItem('houseplan.image.v1') || '').length);
    await page.reload();
    await page.waitForFunction(() => window.HP && HP.app);
    await page.evaluate(() => HP.app.started);
    await L.frame(page);
    i = await L.info(page);
    L.check('the smaller copy restores at the original plan size', i.hasImage && i.natural[0] < 2067 && i.plan.image.width === 2067 && i.plan.calibrated && i.plan.items.length === 1,
      'copy is ' + JSON.stringify(i.natural) + ', ' + copyLen + ' chars; plan stays ' + i.plan.image.width + 'x' + i.plan.image.height);
    await page.screenshot({ path: path.join(L.SHOTS, 'copy-restored-' + mode + '.png') });

    // Neither store has room: the layout still saves and the UI says the image did not.
    await page.evaluate(() => {
      localStorage.removeItem('houseplan.image.v1');
      let chunk = 'x'.repeat(1 << 20), n = 0;
      while (chunk.length >= 4096) { try { localStorage.setItem('junk' + n++, chunk); } catch (e) { chunk = chunk.slice(0, chunk.length >> 1); } }
    });
    await (await page.$('#file-image')).uploadFile(big);
    await page.waitForFunction(() => document.getElementById('dialog').open);
    L.check('replacing the image of a furnished plan asks first', /Replace the floor plan/.test(await page.$eval('#dialog-title', (e) => e.textContent)));
    await page.click('#dialog-ok');
    await page.waitForFunction(() => HP.app.state.plan.image && HP.app.state.plan.image.name === 'big-noise.png', { timeout: 8000 });
    await L.sleep(1500);
    i = await L.info(page);
    L.check('with no room for the image the layout still saves and the user is told', i.imageStore === 'none' && /image did not fit/.test(i.saveText) && i.plan.image.name === 'big-noise.png', i.saveText);
    await page.reload();
    await page.waitForFunction(() => window.HP && HP.app);
    await page.evaluate(() => HP.app.started);
    await L.frame(page);
    i = await L.info(page);
    L.check('after a reload the layout is there and the missing image is explained', !i.hasImage && i.plan.items.length === 1 && i.plan.image.width === 2200 && /image is not stored/.test(i.saveText), i.saveText);
    L.check('Set scale waits for the image', await page.$eval('#btn-scale', (e) => e.disabled) && i.banner === null);
    await page.screenshot({ path: path.join(L.SHOTS, 'image-missing-' + mode + '.png') });
    await (await page.$('#file-image')).uploadFile(big);
    await page.waitForFunction(() => HP.app.state.image, { timeout: 8000 });
    i = await L.info(page);
    L.check('opening the same image again needs no confirmation and keeps the furniture', !i.dialogOpen && i.hasImage && i.plan.items.length === 1);

    // Storage completely full: saving the layout fails loudly, nothing throws.
    await page.evaluate(() => {
      let chunk = 'x'.repeat(4096), n = 0;
      while (chunk.length >= 1) { try { localStorage.setItem('fill' + n++, chunk); } catch (e) { chunk = chunk.slice(0, chunk.length >> 1); } }
    });
    await add(page, 'plant');
    await add(page, 'plant');
    await add(page, 'plant');
    await L.sleep(600);
    i = await L.info(page);
    L.check('a full localStorage is reported instead of failing silently', /Could not save in this browser/.test(i.saveText) && await page.$eval('#status-save', (e) => e.classList.contains('alert')), i.saveText);
    L.check('storage failures raise no exceptions', page.errors.length === 0 && allErrors.length === 0, page.errors.concat(allErrors).join(' | '));
    await page.evaluate(() => localStorage.clear());
    await page.close();

    /* ---- library overview and drag smoothness with many items ---- */
    console.log('\n-- library and performance');
    page = await L.openPage(browser, url, { width: 1440, height: 1750, deviceScaleFactor: 1 });
    await (await page.$('.library')).screenshot({ path: path.join(L.SHOTS, 'library-' + mode + '.png') });
    await L.uploadImage(page, L.SAMPLE);
    await calibrate(page);
    await page.evaluate(() => {
      const s = HP.app.state, types = HP.catalog.TYPES;
      for (let n = 0; n < 300; n++) {
        const def = types[n % types.length];
        HP.model.addItem(s.plan, HP.model.createItem(s.plan, def, { x: 80 + (n % 20) * 52, y: 120 + Math.floor(n / 20) * 80 }, { rot: (n * 15) % 360 }));
      }
    });
    await add(page, 'bed-double');
    i = await L.info(page);
    const bedNow = i.plan.items[i.plan.items.length - 1];
    const from = L.planToPage(i, bedNow);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const timing = await page.evaluate(async (x, y) => {
      const cv = document.getElementById('canvas');
      const times = [];
      for (let n = 1; n <= 60; n++) {
        const t0 = performance.now();
        cv.dispatchEvent(new PointerEvent('pointermove', { clientX: x + n * 3, clientY: y + n * 2, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
        const handled = performance.now() - t0;
        await new Promise((r) => requestAnimationFrame(r));
        times.push([handled, performance.now() - t0]);
      }
      const avg = (k) => times.reduce((a, t) => a + t[k], 0) / times.length;
      return { handler: avg(0), frame: avg(1), worst: Math.max(...times.map((t) => t[1])) };
    }, from.x, from.y);
    await page.mouse.up();
    i = await L.info(page);
    console.log('  drag timing with 301 items: handler ' + timing.handler.toFixed(2) + ' ms, frame ' + timing.frame.toFixed(1) + ' ms avg, ' + timing.worst.toFixed(1) + ' ms worst');
    L.check('dragging stays smooth with 301 items', timing.frame < 34 && i.plan.items.length === 301,
      'event handling ' + timing.handler.toFixed(1) + ' ms, frame ' + timing.frame.toFixed(1) + ' ms avg, ' + timing.worst.toFixed(1) + ' ms worst');
    await page.screenshot({ path: path.join(L.SHOTS, 'many-' + mode + '.png') });
    await page.evaluate(() => localStorage.clear());
    await page.close();

    /* ---- layout at other window sizes ---- */
    console.log('\n-- window sizes');
    for (const [w, hgt] of [[1280, 720], [1024, 700], [800, 1000], [390, 800]]) {
      page = await L.openPage(browser, url, { width: w, height: hgt, deviceScaleFactor: 1 });
      const m = await page.evaluate(() => {
        const c = document.getElementById('canvas').getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, cw: c.width, ch: c.height };
      });
      L.check('layout fits a ' + w + ' x ' + hgt + ' window', m.sw <= m.iw && m.sh <= m.ih && m.cw >= 200 && m.ch >= 200, JSON.stringify(m));
      await page.screenshot({ path: path.join(L.SHOTS, 'size-' + w + '-' + mode + '.png') });
      await page.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  process.exitCode = L.summary() ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });

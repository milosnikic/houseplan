// Vertical slice: load the sample plan, calibrate, measure, place and drag a bed, reload.
const path = require('node:path');
const { spawn } = require('node:child_process');
const L = require('./lib.js');

const mode = process.argv[2] || 'file';

async function main() {
  let server = null, url = 'file://' + path.join(L.PROJECT, 'index.html');
  if (mode === 'http') {
    server = spawn('node', [path.join(L.PROJECT, 'tools/serve.js')], { env: { ...process.env, PORT: '5199' } });
    await new Promise((r) => server.stdout.once('data', r));
    url = 'http://localhost:5199/';
  }
  console.log('\n=== vertical slice over ' + url + ' ===');
  const browser = await L.launch();
  try {
    let page = await L.openPage(browser, url);
    let i = await L.info(page);
    L.check('page loads without errors', page.errors.length === 0, page.errors.join(' | '));
    L.check('library lists 60 items', (await page.$$('.lib-item')).length === 60);
    L.check('empty state is shown', await page.$eval('#empty-state', (e) => !e.hidden));
    L.check('Set scale is disabled without an image', await page.$eval('#btn-scale', (e) => e.disabled));

    await L.uploadImage(page, L.SAMPLE);
    i = await L.info(page);
    L.check('image loads at its natural size', i.plan.image.width === 2067 && i.plan.image.height === 2576, i.plan.image.width + 'x' + i.plan.image.height);
    L.check('plan starts uncalibrated with a reminder', !i.plan.calibrated && /guess/.test(i.banner || ''), i.banner);
    const fitH = i.plan.image.height * i.view.scale;
    L.check('image is fit to the screen', fitH <= i.rect.height && fitH > i.rect.height - 60 && i.view.y > 0, 'drawn height ' + fitH.toFixed(0) + ' of ' + i.rect.height);

    // Find wall faces by scanning the image pixels (also proves the canvas is not tainted).
    const walls = await page.evaluate(() => {
      const img = HP.app.state.image;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const dark = (x, y) => { const k = (y * c.width + x) * 4; return data[k] < 90 && data[k + 1] < 90 && data[k + 2] < 90 && data[k + 3] > 200; };
      const scan = (x, y, dx, dy) => { while (x > 0 && y > 0 && x < c.width && y < c.height && !dark(x, y)) { x += dx; y += dy; } return dx ? x : y; };
      const out = {};
      out.bedLeft = scan(900, 315, -1, 0) + 1;        // inner face of the upper bedroom's left wall
      out.bedNotch = scan(1300, 315, 1, 0);           // left face of the column where the 430 line ends
      out.livLeft = scan(1000, 1150, -1, 0) + 1;      // living room: left wall
      out.livRight = scan(1300, 1150, 1, 0);          // living room: window line on the right
      out.livTop = scan(1200, 900, 0, -1) + 1;        // underside of the bedroom / living wall
      const tops = [];
      for (let x = 965; x <= 995; x += 5) tops.push(scan(x, 1600, 0, 1));
      out.kitchenTop = Math.min(...tops);             // top of the kitchen recess side wall
      out.tops = tops;
      return out;
    });
    console.log('  wall scan (image px):', JSON.stringify(walls));

    // Calibrate on the 430 cm upper bedroom wall.
    await page.click('#btn-scale');
    i = await L.info(page);
    L.check('scale tool is active', i.tool === 'calibrate' && /Click one end/.test(i.banner || ''), i.banner);
    await L.click(page, L.imageToPage(i, { x: walls.bedLeft, y: 315 }));
    await L.click(page, L.imageToPage(i, { x: walls.bedNotch, y: 315 }));
    i = await L.info(page);
    L.check('dialog asks for the real length', i.dialogOpen && /px long/.test(i.dialogText), i.dialogText);
    await page.keyboard.type('430');
    await page.keyboard.press('Enter');
    await L.frame(page);
    i = await L.info(page);
    const expectedScale = (walls.bedNotch - walls.bedLeft) / 430;
    L.check('pixels per cm stored from the two clicks', i.plan.calibrated && Math.abs(i.plan.pxPerCm - expectedScale) / expectedScale < 0.005,
      'pxPerCm ' + i.plan.pxPerCm.toFixed(4) + ', wall is ' + (walls.bedNotch - walls.bedLeft) + ' px');
    L.check('scale tool closes after calibrating', i.tool === 'select' && !i.dialogOpen && i.banner === null);
    const scaleText = await page.$eval('#scale-readout', (e) => e.textContent);
    L.check('toolbar shows the scale', /1 cm = 1\.7\d px/.test(scaleText), scaleText);

    // Sanity check against the reference plan: living room 450 x 500 cm.
    const livW = (walls.livRight - walls.livLeft) / i.plan.pxPerCm;
    const livH = (walls.kitchenTop - walls.livTop) / i.plan.pxPerCm;
    L.check('living room width measures close to 450 cm', Math.abs(livW - 450) <= 9, livW.toFixed(1) + ' cm');
    L.check('living room length measures close to 500 cm', Math.abs(livH - 500) <= 10, livH.toFixed(1) + ' cm');

    // The same measurement through the UI: the scale dialog reports the current length.
    await page.click('#btn-scale');
    i = await L.info(page);
    await L.click(page, L.imageToPage(i, { x: walls.livLeft, y: 1150 }));
    await L.click(page, L.imageToPage(i, { x: walls.livRight, y: 1150 }));
    i = await L.info(page);
    const said = /that is ([\d.]+) cm/.exec(i.dialogText);
    L.check('measuring the living room in the UI reads close to 450 cm', said && Math.abs(Number(said[1]) - 450) <= 9, i.dialogText);
    const before = i.plan.pxPerCm;
    await page.click('#dialog-cancel');
    i = await L.info(page);
    L.check('cancelling the dialog keeps the scale', i.plan.pxPerCm === before && i.tool === 'select' && i.plan.calibrated);

    // Place a bed and drag it.
    await page.click('.lib-item[data-type="bed-double"]');
    i = await L.info(page);
    let bed = i.plan.items[0];
    const k = i.plan.pxPerCm * i.view.scale;
    const centerCm = { x: (i.rect.width / 2 - i.view.x) / k, y: (i.rect.height / 2 - i.view.y) / k };
    L.check('bed is added at the viewport center', bed && bed.w === 160 && bed.d === 200 && Math.abs(bed.x - centerCm.x) <= 5 && Math.abs(bed.y - centerCm.y) <= 5,
      bed && ('bed ' + bed.x + ',' + bed.y + ' center ' + centerCm.x.toFixed(1) + ',' + centerCm.y.toFixed(1)));
    L.check('new bed is selected', i.selection.length === 1 && i.selection[0] === bed.id);
    const onGrid = (b) => L.near(((b.x - b.w / 2) / 5) % 1, 0, 1e-6) && L.near(((b.y - b.d / 2) / 5) % 1, 0, 1e-6);
    L.check('bed edges sit on the 5 cm grid', onGrid(bed), 'left ' + (bed.x - 80) + ' top ' + (bed.y - 100));

    const start = L.planToPage(i, bed);
    await L.drag(page, start, { x: start.x + 133, y: start.y - 71 });
    i = await L.info(page);
    const moved = i.plan.items[0];
    L.check('dragging moves the bed by the dragged distance', Math.abs((moved.x - bed.x) - 133 / k) <= 2.6 && Math.abs((moved.y - bed.y) + 71 / k) <= 2.6,
      'moved ' + (moved.x - bed.x) + ', ' + (moved.y - bed.y) + ' cm for ' + (133 / k).toFixed(1) + ', ' + (-71 / k).toFixed(1));
    L.check('dragged bed is still on the grid', onGrid(moved), moved.x + ',' + moved.y);
    L.check('drag made one undo step', i.undoSteps === 3, 'undo steps ' + i.undoSteps);
    await L.frame(page);
    await page.screenshot({ path: path.join(L.SHOTS, 'slice-' + mode + '.png') });

    // Reload: layout, scale and image must survive.
    await L.sleep(500);
    i = await L.info(page);
    L.check('autosave reports success', /^Saved in this browser$/.test(i.saveText) && i.imageStore === 'indexeddb', i.saveText + ' / image in ' + i.imageStore);
    const layoutBytes = await page.evaluate(() => localStorage.getItem('houseplan.layout.v1').length);
    L.check('layout JSON in localStorage is small', layoutBytes < 2000, layoutBytes + ' chars');
    const errorsBefore = page.errors.slice();
    await page.close();
    page = await L.openPage(browser, url);
    i = await L.info(page);
    const again = i.plan.items[0];
    L.check('bed survives a reload in the same place', again && again.x === moved.x && again.y === moved.y && again.type === 'bed-double', again && (again.x + ',' + again.y));
    L.check('scale survives a reload', i.plan.calibrated && i.plan.pxPerCm === before, String(i.plan.pxPerCm));
    L.check('image survives a reload', i.hasImage && i.natural[0] === 2067 && i.natural[1] === 2576, JSON.stringify(i.natural));
    L.check('no reminder banner once calibrated', i.banner === null, String(i.banner));
    L.check('no errors in the whole run', errorsBefore.length === 0 && page.errors.length === 0, errorsBefore.concat(page.errors).join(' | '));
    await page.screenshot({ path: path.join(L.SHOTS, 'slice-' + mode + '-reloaded.png') });
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  process.exitCode = L.summary() ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });

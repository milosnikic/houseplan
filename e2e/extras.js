// Smaller behaviours that the README mentions and the main run did not touch.
const path = require('node:path');
const fs = require('node:fs');
const L = require('./lib.js');

(async () => {
  const browser = await L.launch();
  try {
    const page = await L.openPage(browser, 'file://' + path.join(L.PROJECT, 'index.html'));
    await page.evaluate(() => localStorage.clear());
    // Works without any image: items on the bare mat.
    await page.click('.lib-item[data-type="desk"]');
    let i = await L.info(page);
    const desk = i.plan.items[0];
    L.check('furniture can be placed without a plan image, no conflict from missing bounds', desk && i.collisions.length === 0 && await page.$eval('#empty-state', (e) => e.hidden));
    await page.focus('#canvas');
    await page.keyboard.down('Shift'); await page.keyboard.press('R'); await page.keyboard.up('Shift');
    L.check('Shift+R turns 90 degrees left', (await L.info(page)).plan.items[0].rot === 270);
    await page.keyboard.press('r');
    L.check('R turns 90 degrees right', (await L.info(page)).plan.items[0].rot === 0);

    await L.combo(page, 'Control', 'x');
    i = await L.info(page);
    L.check('Ctrl+X cuts', i.plan.items.length === 0);
    await L.combo(page, 'Control', 'v');
    i = await L.info(page);
    L.check('Ctrl+V pastes the cut item', i.plan.items.length === 1 && i.plan.items[0].type === 'desk' && i.selection.length === 1);
    await L.combo(page, 'Control', 'z');
    await L.combo(page, 'Control', 'y');
    i = await L.info(page);
    L.check('Ctrl+Y redoes', i.plan.items.length === 1 && !i.canRedo);

    // Shift while resizing keeps proportions.
    const id = i.plan.items[0].id;
    await L.click(page, L.planToPage(i, i.plan.items[0]));   // undo and redo do not restore the selection
    const h = await page.evaluate((id) => {
      const s = HP.app.state, it = s.plan.items.find((x) => x.id === id), r = document.getElementById('canvas').getBoundingClientRect();
      const hh = HP.render.handles(it, s.plan.pxPerCm * s.view.scale, s.view);
      return hh.corners.map((p) => ({ x: p.x + r.left, y: p.y + r.top }));
    }, id);
    await L.drag(page, h[2], { x: h[2].x + 60, y: h[2].y + 5 }, { keys: ['Shift'] });
    i = await L.info(page);
    let it = i.plan.items[0];
    L.check('Shift while resizing keeps proportions', it.w > 120 && Math.abs(it.w / it.d - 2) < 1e-9, it.w + ' x ' + it.d);

    // Label and color in the inspector.
    await page.click('#f-label', { count: 3 });
    await page.keyboard.type('Workbench');
    L.check('label previews while typing', (await L.info(page)).plan.items[0].label === 'Workbench');
    await page.keyboard.press('Enter');
    await page.$eval('#f-color', (e) => { e.value = '#336699'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    it = (await L.info(page)).plan.items[0];
    L.check('inspector color applies to any item', it.color === '#336699' && it.label === 'Workbench');
    await page.click('#btn-color-reset');
    L.check('Default button clears the color', (await L.info(page)).plan.items[0].color === null);

    // View keys.
    await page.focus('#canvas');
    const v0 = (await L.info(page)).view;
    await page.keyboard.press('+');
    const v1 = (await L.info(page)).view;
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    const v2 = (await L.info(page)).view;
    await page.keyboard.press('f');
    const v3 = (await L.info(page)).view;
    L.check('+ and - zoom, F fits', v1.scale > v0.scale && v2.scale < v0.scale && v3.scale !== v2.scale, [v0.scale, v1.scale, v2.scale, v3.scale].map((s) => s.toFixed(2)).join(' '));

    // Space on a focused canvas arms panning even over an item.
    i = await L.info(page);
    const c = L.planToPage(i, i.plan.items[0]);
    const before = i.plan.items[0];
    await page.keyboard.down('Space');
    await L.drag(page, c, { x: c.x + 50, y: c.y + 30 });
    await page.keyboard.up('Space');
    const after = await L.info(page);
    L.check('space+drag over an item pans instead of moving it', after.plan.items[0].x === before.x && Math.abs(after.view.x - i.view.x - 50) < 0.5);

    // Export without an image, then import that file by dropping it.
    await L.allowDownloads(page);
    await page.click('#btn-export-png');
    const png = await L.waitForFile('houseplan.png');
    const buf = png ? fs.readFileSync(png) : null;
    L.check('PNG export works without a plan image', !!buf && buf.readUInt32BE(16) > 100 && buf.readUInt32BE(20) > 50, buf ? buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20) : '');
    await page.click('#btn-export-json');
    const jf = await L.waitForFile('houseplan-layout.json');
    const text = fs.readFileSync(jf, 'utf8');
    L.check('JSON export without an image has no image data', !/imageData/.test(text) && JSON.parse(text).items.length === 1);
    await page.click('.lib-item[data-type="plant"]');
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], 'houseplan-layout.json', { type: 'application/json' }));
      document.getElementById('stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, text);
    await page.waitForFunction(() => document.getElementById('dialog').open);
    await page.click('#dialog-ok');
    await L.sleep(300);
    i = await L.info(page);
    L.check('dropping a layout JSON imports it after confirmation', i.plan.items.length === 1 && i.plan.items[0].label === 'Workbench', i.toast);
    L.check('no errors', page.errors.length === 0, page.errors.join(' | '));
    await page.evaluate(() => localStorage.clear());
  } finally {
    await browser.close();
  }
  process.exitCode = L.summary() ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(2); });

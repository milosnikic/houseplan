// Shared helpers for the browser checks. Set CHROME_PATH if Chrome is not in the default macOS place.
const puppeteer = require('puppeteer-core');
const path = require('node:path');
const fs = require('node:fs');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT = path.join(__dirname, '..');
const SAMPLE = path.join(PROJECT, 'samples/floorplan-empty.png');
const SHOTS = path.join(__dirname, 'output', 'shots');
const DOWNLOADS = path.join(__dirname, 'output', 'downloads');
for (const dir of [SHOTS, DOWNLOADS]) fs.mkdirSync(dir, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}
function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  for (const f of failed) console.log('  FAILED: ' + f.name + (f.detail !== undefined ? ' [' + f.detail + ']' : ''));
  return failed.length;
}

async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1440,900'] });
}

async function openPage(browser, url, viewport, prepare) {
  const page = await browser.newPage();
  await page.setViewport(viewport || { width: 1440, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (prepare) await prepare(page);
  await page.goto(url);
  await page.waitForFunction(() => window.HP && window.HP.app);
  await page.evaluate(() => HP.app.started);
  await frame(page);
  page.errors = errors;
  return page;
}

const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function info(page) {
  return page.evaluate(() => {
    const s = HP.app.state;
    const r = document.getElementById('canvas').getBoundingClientRect();
    return {
      plan: JSON.parse(JSON.stringify(s.plan)), view: { x: s.view.x, y: s.view.y, scale: s.view.scale },
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      selection: [...s.selection], collisions: [...s.collisions.entries()], tool: s.tool,
      hasImage: !!s.image, imageStore: s.imageStore,
      natural: s.image ? [s.image.naturalWidth, s.image.naturalHeight] : null,
      undoSteps: HP.app.hist.undoSteps(), canRedo: HP.app.hist.canRedo(),
      saveText: document.getElementById('status-save').textContent,
      banner: document.getElementById('banner').hidden ? null : document.getElementById('banner-text').textContent,
      toast: document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent,
      dialogOpen: document.getElementById('dialog').open,
      dialogText: document.getElementById('dialog-text').textContent
    };
  });
}

// Page coordinates of a point given in plan cm or in image px.
function planToPage(i, p) {
  const k = i.plan.pxPerCm * i.view.scale;
  return { x: i.rect.left + p.x * k + i.view.x, y: i.rect.top + p.y * k + i.view.y };
}
function imageToPage(i, p) {
  return { x: i.rect.left + p.x * i.view.scale + i.view.x, y: i.rect.top + p.y * i.view.scale + i.view.y };
}

async function drag(page, from, to, opts) {
  const o = opts || {};
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const key of o.keys || []) await page.keyboard.down(key);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  if (o.beforeRelease) await o.beforeRelease();
  await page.mouse.up();
  for (const key of o.keys || []) await page.keyboard.up(key);
  await frame(page);
}

async function click(page, p, opts) {
  const o = opts || {};
  for (const key of o.keys || []) await page.keyboard.down(key);
  await page.mouse.click(p.x, p.y);
  for (const key of o.keys || []) await page.keyboard.up(key);
  await frame(page);
}

async function combo(page, modifier, key) {
  await page.keyboard.down(modifier);
  await page.keyboard.press(key);
  await page.keyboard.up(modifier);
  await frame(page);
}

async function uploadImage(page, file) {
  const input = await page.$('#file-image');
  await input.uploadFile(file);
  await page.waitForFunction((name) => HP.app.state.plan.image && HP.app.state.plan.image.name === name && HP.app.state.image, {}, path.basename(file));
  await frame(page);
}

async function setField(page, id, value) {
  await page.click('#' + id, { count: 3 });
  await page.keyboard.type(String(value));
  await page.keyboard.press('Enter');
  await frame(page);
}

// Color of one canvas pixel at a page coordinate.
async function pixel(page, p) {
  await frame(page);
  return page.evaluate((x, y) => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    return [...c.getContext('2d').getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data];
  }, p.x, p.y);
}

async function allowDownloads(page) {
  for (const f of fs.readdirSync(DOWNLOADS)) fs.unlinkSync(path.join(DOWNLOADS, f));
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
  return client;
}

async function waitForFile(name, timeout) {
  const file = path.join(DOWNLOADS, name);
  const until = Date.now() + (timeout || 8000);
  while (Date.now() < until) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0 && !fs.existsSync(file + '.crdownload')) return file;
    await sleep(100);
  }
  return null;
}

const itemBy = (i, pred) => i.plan.items.find(pred);
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 0.011 : eps);

module.exports = {
  PROJECT, SAMPLE, SHOTS, DOWNLOADS, check, summary, launch, openPage, frame, sleep, info,
  planToPage, imageToPage, drag, click, combo, uploadImage, setField, pixel, allowDownloads, waitForFile, itemBy, near
};

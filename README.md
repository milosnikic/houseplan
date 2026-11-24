# Houseplan

Plan apartment furniture on top of a floor plan image. Everything runs in the browser: no backend, no account, no build step, no runtime dependencies.

## Run it

Either way works, both were checked in Chrome:

1. Double-click `index.html` (opens from `file://`).
2. Or run `npm start` and open http://localhost:5173 (set `PORT=8080` to change the port).

The scripts are plain classic scripts rather than ES modules, because Chrome refuses module imports from `file://`. That is why double-clicking works.

The two ways are separate origins for the browser, so each keeps its own autosaved plan. Pick one, or move a plan between them with Export JSON and Import JSON.

Only Chrome was tested. Safari and Firefox should work but were not checked.

## Tests

```
npm test
```

Nothing to install. Run with Node 24; it only uses the built-in test runner, so Node 18 or newer should do. The tests cover the geometry (cm to px, rotated overlap, snapping, rotation about the item center, resize), the plan model (scale changes, conflicts, save format) and undo history.

Browser checks drive the app in headless Chrome through real mouse, keyboard and file-input events:

```
npm install
npm run test:browser
```

They need Google Chrome and one dev dependency, puppeteer-core. Set `CHROME_PATH` if Chrome is not in the default macOS location. Screenshots and downloads land in `e2e/output/`.

## How to use it

1. **Open floor plan**: pick a PNG or JPG, or drop it on the window. It is shown fit to screen.
2. **Set scale**: click the two ends of a wall you know the length of, then type the length in cm. Hold Shift for a straight line. You can do this again at any time: furniture stays on the same spot of the image and keeps its real size. If the scale is already set, the dialog also tells you how long the clicked line is, which makes it a quick measuring tool (Cancel leaves the scale alone).
3. Click an item in the library to add it at the middle of the view. Drag to move, drag a corner to resize, drag the round handle to rotate.
4. The panel on the right edits label, X, Y, width, depth and rotation as numbers. X and Y are the center of the item, measured in cm from the top-left corner of the image.

| Input | Action |
| --- | --- |
| Wheel, trackpad pinch, two-finger pinch | Zoom at the pointer |
| Space + drag, middle-button drag, drag on empty space | Pan |
| Click, Shift + click | Select, add to or remove from the selection |
| Arrows, Shift + arrows | Move 1 cm, 10 cm |
| Alt while dragging | Snapping off for that drag |
| Shift while rotating | Free angle instead of 15 degree steps |
| Shift while resizing | Keep proportions |
| R, Shift + R | Turn 90 degrees right, left |
| Ctrl/Cmd + D | Duplicate |
| Ctrl/Cmd + C, X, V | Copy, cut, paste |
| Ctrl/Cmd + A | Select all |
| Del, Backspace | Delete |
| ] and [ | Bring to front, send to back |
| L | Lock or unlock |
| Ctrl/Cmd + Z, with Shift (or Ctrl + Y) | Undo, redo (100 steps) |
| F, + and - | Fit to screen, zoom in and out |
| Esc | Cancel a drag, leave the scale tool, clear the selection |

## Things worth knowing

- **Snapping** is to a 5 cm grid that starts at the top-left corner of the image, not at a wall. It lines up the bounding box of the item. To push something flush against a drawn wall, hold Alt.
- **Conflicts**: furniture that overlaps other furniture, or sticks out of the image, turns red. Walls are not modelled, so furniture inside a wall is not detected. Door swings and windows are markers: a window never conflicts, a door swing over furniture turns both amber. Items that only touch are fine.
- **L-shaped sofa**: Flip moves the return to the other side. Its inner corner stays free, so a coffee table there is not a conflict.
- **Wall-mounted TV and 2-zone hob** sit above or on other furniture and never conflict.
- **Rugs and curtains** never conflict. A new rug goes under the furniture already on the plan.
- **Walking route**: lay this strip along a path you want to keep free. Furniture standing on it turns amber.
- **Clearances** (toolbar checkbox, off by default): shows the free space needed in front of wardrobes (90 cm), kitchen units (100), washing machines (90), toilets (60) and bathroom sinks (70), and turns an item amber when something stands in it.
- **Electrical** (toolbar checkbox): sockets, switches, lights, LED strips, power feeds and network points form their own layer, drawn on top of the furniture. Hiding the layer also leaves it out of the PNG. With the layer shown, Export PNG adds a legend with the count of each symbol below the plan.
- **Distances**: with "Distances" on, the selected item shows the gap to its nearest neighbour. While you drag, that line is always shown. There is no distance to walls.
- **Locked** items cannot be moved, resized, rotated or deleted until unlocked.
- **Undo and redo** bring back items, positions and the scale, not the selection. A burst of arrow-key nudges counts as one step.
- **Labels** are drawn on an item only when they fit, and not on doors and windows.
- **Before the scale is set**, the long side of the image is assumed to be 12 m, so sizes are a guess. The toolbar says so.
- **Opening another image** keeps the furniture on the same pixels and resets the scale, unless the new image has the same pixel size as the old one, in which case the scale is kept.

## Saving

- The layout autosaves to `localStorage` as a small JSON (well under 1 KB per item). The image bytes go to IndexedDB, so a large image cannot blow the roughly 5 MB `localStorage` quota.
- If IndexedDB is not available, a downscaled JPEG copy of the image is stored in `localStorage` instead. If that does not fit either, the layout is still saved and the status bar says the image was not. Nothing fails silently: the status bar in the bottom right always shows the save state.
- **Export JSON** writes one file with the layout and the original image inside it. **Import JSON** restores both.
- **Export PNG** renders the plan and the furniture at the image's own resolution, without selection marks or conflict colors.
- Undo history is kept in memory only. Opening an image, importing a file and New plan start a fresh history.

## Code layout

```
index.html        page structure, loads the scripts in order
css/style.css     layout and styling
src/geometry.js   pure math in cm: scale, view transform, outlines, overlap, snapping, resize, rotate
src/catalog.js    furniture library: names, default sizes, icon and shape of each type
src/model.js      the plan: items, scale, ordering, conflicts, nearest item, JSON save format
src/history.js    undo and redo stack
src/icons.js      top-down icon painters (canvas, drawn in cm)
src/render.js     canvas drawing: plan, items, selection, measurements, PNG export
src/storage.js    autosave: localStorage for the layout, IndexedDB for the image
src/app.js        UI wiring: pointer and keyboard input, panels, import and export
tests/            unit tests for geometry, model and history (node --test)
e2e/              browser checks (npm run test:browser)
tools/serve.js    static file server behind npm start
tools/make-layouts.js  writes the ready-made layouts from room-relative positions in cm
layouts/          ready-made layouts for the sample plan, load them with Import JSON
docs/apartment-plan.md  the design decisions for the apartment on the sample plan
samples/          the measured empty plan, handy for trying the app
```

All geometry is stored in cm in plan coordinates (origin at the image's top-left corner, y down, item position is its center, rotation in degrees clockwise). `geometry.js`, `catalog.js`, `model.js` and `history.js` have no DOM access and load in Node for the tests. Pixels appear only in `render.js` and in the pointer handling of `app.js`.

To add a furniture type, add one line to `TYPES` in `src/catalog.js` and, if it needs its own drawing, a painter in `src/icons.js`.

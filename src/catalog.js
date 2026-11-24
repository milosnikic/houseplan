/* Furniture library. Sizes are width x depth in cm, seen from above. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HP = root.HP || {}).catalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORIES = [
    { id: 'bedroom', name: 'Bedroom' },
    { id: 'living', name: 'Living room' },
    { id: 'dining', name: 'Dining' },
    { id: 'work', name: 'Work' },
    { id: 'kitchen', name: 'Kitchen and laundry' },
    { id: 'bathroom', name: 'Bathroom' },
    { id: 'storage', name: 'Storage and hall' },
    { id: 'terrace', name: 'Terrace' },
    { id: 'soft', name: 'Rugs, curtains and routes' },
    { id: 'electrical', name: 'Electrical and smart' },
    { id: 'openings', name: 'Doors and windows' }
  ];

  // Extra traits: clear = free space needed in front (cm), under = drawn below other items,
  // layer = toggled as a group, warn = reason shown when furniture stands on a non-blocking item.
  function def(type, name, category, w, d, icon, extra) {
    return Object.assign({ type, name, category, w, d, icon, shape: 'rect', blocking: true, keepAspect: false }, extra);
  }
  const symbol = (type, name, w, d, icon, extra) =>
    def(type, name, 'electrical', w, d, icon, Object.assign({ blocking: false, layer: 'electrical', keepAspect: true }, extra));

  const TYPES = [
    def('bed-single', 'Single bed', 'bedroom', 90, 200, 'bed'),
    def('bed-140', 'Bed 140', 'bedroom', 140, 200, 'bed'),
    def('bed-double', 'Double bed', 'bedroom', 160, 200, 'bed'),
    def('bed-queen', 'Queen bed', 'bedroom', 160, 200, 'bed'),
    def('bed-180', 'Bed 180', 'bedroom', 180, 200, 'bed'),
    def('wardrobe-200', 'Wardrobe 200', 'bedroom', 200, 60, 'wardrobe', { clear: 90 }),
    def('wardrobe-120', 'Wardrobe 120', 'bedroom', 120, 60, 'wardrobe', { clear: 90 }),
    def('nightstand', 'Nightstand', 'bedroom', 45, 40, 'nightstand'),
    def('vanity', 'Vanity', 'bedroom', 90, 40, 'vanity'),

    def('sofa-2', 'Sofa 2-seat', 'living', 160, 90, 'sofa'),
    def('sofa-3', 'Sofa 3-seat', 'living', 210, 90, 'sofa'),
    def('sofa-l', 'L-shaped sofa', 'living', 250, 160, 'lsofa', { shape: 'lshape' }),
    def('armchair', 'Armchair', 'living', 80, 80, 'sofa'),
    def('ottoman', 'Ottoman', 'living', 80, 80, 'ottoman'),
    def('coffee-table', 'Coffee table', 'living', 100, 60, 'coffee'),
    def('tv-unit', 'TV unit', 'living', 150, 40, 'tv'),
    // Hangs on the wall above other furniture, so it never blocks.
    def('tv-wall', 'Wall-mounted TV', 'living', 145, 8, 'tvwall', { blocking: false }),
    def('speaker', 'Speaker', 'living', 30, 30, 'speaker'),
    def('dog-bed', 'Dog bed', 'living', 60, 50, 'dogbed'),
    def('plant', 'Plant', 'living', 40, 40, 'plant', { shape: 'ellipse', keepAspect: true }),

    def('table-4', 'Dining table 4-seat', 'dining', 120, 80, 'table'),
    def('table-6', 'Dining table 6-seat', 'dining', 180, 90, 'table'),
    def('table-round', 'Round dining table', 'dining', 110, 110, 'round', { shape: 'ellipse', keepAspect: true }),
    def('dining-chair', 'Dining chair', 'dining', 45, 45, 'chair'),

    def('desk', 'Desk', 'work', 120, 60, 'desk'),
    def('office-chair', 'Office chair', 'work', 60, 60, 'officechair'),

    def('counter', 'Kitchen counter', 'kitchen', 240, 60, 'counter', { clear: 100 }),
    def('counter-corner', 'Counter L-corner', 'kitchen', 60, 60, 'corner'),
    def('tall-unit', 'Tall kitchen unit', 'kitchen', 60, 60, 'tall', { clear: 100 }),
    def('fridge', 'Fridge', 'kitchen', 60, 65, 'fridge', { clear: 100 }),
    def('dishwasher', 'Dishwasher', 'kitchen', 60, 60, 'dishwasher', { clear: 100 }),
    def('stove', 'Stove', 'kitchen', 60, 60, 'stove', { clear: 100 }),
    // Sits on top of a counter, so it never blocks.
    def('hob-2', 'Hob 2-zone', 'kitchen', 30, 52, 'hob2', { blocking: false }),
    def('kitchen-sink', 'Sink', 'kitchen', 60, 55, 'sink', { clear: 100 }),
    def('washing-machine', 'Washing machine', 'kitchen', 60, 60, 'washer', { clear: 90 }),

    def('toilet', 'Toilet', 'bathroom', 40, 65, 'toilet', { clear: 60 }),
    def('bathtub', 'Bathtub', 'bathroom', 170, 75, 'bathtub'),
    def('shower', 'Shower', 'bathroom', 90, 90, 'shower'),
    def('bath-sink', 'Bathroom sink', 'bathroom', 60, 45, 'basin', { clear: 70 }),

    def('sideboard', 'Sideboard', 'storage', 140, 35, 'sideboard'),
    def('shelf-unit', 'Shelf unit', 'storage', 80, 40, 'shelf'),
    def('display-cabinet', 'Display cabinet', 'storage', 35, 32, 'display'),
    def('shoe-cabinet', 'Shoe cabinet', 'storage', 52, 18, 'sideboard'),
    def('bench', 'Bench', 'storage', 100, 40, 'bench'),

    def('lounge-chair', 'Lounge chair', 'terrace', 70, 70, 'sofa'),
    def('side-table', 'Side table', 'terrace', 45, 45, 'round', { shape: 'ellipse', keepAspect: true }),

    // Soft furnishings lie under or beside furniture and never block it.
    def('rug', 'Rug', 'soft', 200, 300, 'rug', { blocking: false, under: true }),
    def('rug-round', 'Round rug', 'soft', 160, 160, 'ruground', { shape: 'ellipse', blocking: false, under: true, keepAspect: true }),
    def('curtain', 'Curtain', 'soft', 240, 20, 'curtain', { blocking: false }),
    // A strip to lay along a walking route. Furniture standing on it earns a warning.
    def('walkway', 'Walking route', 'soft', 90, 200, 'route', { blocking: false, under: true, warn: 'route' }),

    symbol('e-socket', 'Socket', 20, 20, 'esocket'),
    symbol('e-socket-2', 'Double socket', 36, 20, 'esocket2'),
    symbol('e-feed', 'Always-on power feed', 20, 20, 'efeed'),
    symbol('e-switch', 'Switch', 20, 20, 'eswitch'),
    symbol('e-light', 'Ceiling light', 30, 30, 'elight'),
    symbol('e-wall-light', 'Wall light', 24, 14, 'ewall'),
    symbol('e-led', 'LED strip', 100, 6, 'eled', { keepAspect: false }),
    symbol('e-network', 'Network point', 20, 20, 'enet'),

    // Markers: they show where a door opens or a window sits and never block furniture.
    def('door', 'Door swing', 'openings', 80, 80, 'door', { shape: 'door', blocking: false, keepAspect: true, warn: 'door' }),
    def('window', 'Window', 'openings', 100, 15, 'window', { blocking: false })
  ];

  const CUSTOM = def('custom', 'Custom item', null, 100, 50, 'box');
  const BY_TYPE = new Map(TYPES.map((t) => [t.type, t]));

  // Unknown types (for example from a newer file) fall back to a plain box.
  function byType(type) { return BY_TYPE.get(type) || CUSTOM; }

  function sizeText(d) {
    if (d.shape === 'ellipse' && d.w === d.d) return 'Ø ' + d.w;
    if (d.shape === 'door') return String(d.w);
    return d.w + ' × ' + d.d;
  }

  return { CATEGORIES, TYPES, CUSTOM, byType, sizeText };
});

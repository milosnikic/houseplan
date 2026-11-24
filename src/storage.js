/* Autosave: the layout JSON goes to localStorage, the image bytes go to IndexedDB. */
(function (root) {
  'use strict';

  const LAYOUT_KEY = 'houseplan.layout.v1';
  const IMAGE_COPY_KEY = 'houseplan.image.v1';
  const DB_NAME = 'houseplan';
  const STORE = 'files';
  const IMAGE_ID = 'floorplan';
  const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;

  function describe(err) { return (err && (err.message || err.name)) || 'unknown error'; }

  function removeKey(key) { try { localStorage.removeItem(key); } catch (err) { /* storage unavailable */ } }

  // Never throws. A small layout always gets priority over the fallback image copy.
  function saveLayout(json) {
    try {
      localStorage.setItem(LAYOUT_KEY, json);
      return { ok: true };
    } catch (first) {
      removeKey(IMAGE_COPY_KEY);
      try {
        localStorage.setItem(LAYOUT_KEY, json);
        return { ok: true, droppedImageCopy: true };
      } catch (err) {
        return { ok: false, error: describe(err) };
      }
    }
  }

  function loadLayout() {
    try { return localStorage.getItem(LAYOUT_KEY); } catch (err) { return null; }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      let req;
      try { req = root.indexedDB.open(DB_NAME, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB could not be opened'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
  }

  async function withStore(mode, work) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error || req.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      });
    } finally {
      db.close();
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // Accepts raster image data URLs only. Returns null for anything else.
  function dataUrlToBlob(url) {
    const m = typeof url === 'string' ? DATA_URL.exec(url) : null;
    if (!m) return null;
    try {
      const bin = atob(m[2].replace(/\s+/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: m[1] });
    } catch (err) {
      return null;
    }
  }

  function smallerCopy(img, maxSide) {
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // Full image into IndexedDB. If that fails, a downscaled JPEG copy into localStorage.
  // Resolves to { where: 'indexeddb' | 'copy' | 'none', error? } and never rejects.
  async function saveImage(blob, img) {
    try {
      const bytes = await blob.arrayBuffer();
      await withStore('readwrite', (store) => store.put({ id: IMAGE_ID, bytes, type: blob.type }));
      removeKey(IMAGE_COPY_KEY);
      return { where: 'indexeddb' };
    } catch (err) {
      for (const maxSide of [1600, 1000, 600]) {
        try {
          localStorage.setItem(IMAGE_COPY_KEY, smallerCopy(img, maxSide));
          return { where: 'copy', error: describe(err) };
        } catch (e) { /* too big for the quota, try a smaller copy */ }
      }
      removeKey(IMAGE_COPY_KEY);
      return { where: 'none', error: describe(err) };
    }
  }

  // Resolves to { blob, where } or null. Never rejects.
  async function loadImage() {
    try {
      const rec = await withStore('readonly', (store) => store.get(IMAGE_ID));
      if (rec && rec.bytes) return { blob: new Blob([rec.bytes], { type: rec.type || 'image/png' }), where: 'indexeddb' };
    } catch (err) { /* fall through to the copy */ }
    try {
      const blob = dataUrlToBlob(localStorage.getItem(IMAGE_COPY_KEY));
      if (blob) return { blob, where: 'copy' };
    } catch (err) { /* storage unavailable */ }
    return null;
  }

  async function clearImage() {
    removeKey(IMAGE_COPY_KEY);
    try { await withStore('readwrite', (store) => store.delete(IMAGE_ID)); } catch (err) { /* nothing stored */ }
  }

  root.HP.storage = { saveLayout, loadLayout, saveImage, loadImage, clearImage, blobToDataUrl, dataUrlToBlob };
})(window);

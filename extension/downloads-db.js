// Copyright (c) 2026 Hakan Oktay (Zetasis). All rights reserved. Not open source: see LICENSE.
// KeepKeep's record of what it downloaded (specs/2026-10-28-no-duplicate-downloads.md):
// `downloaded` holds each file by Instagram's id of the photo / video
// ({ id, top, at, dl, name }); `posts` holds each post or story downloaded
// ({ key, url, username, type, files, at, thumb }) for the app's Downloads
// view. IndexedDB of the extension's own origin: the service worker writes,
// the app page reads (and forgets). Kept apart from chrome.storage, so the
// pages listening there don't re-render on every file and users' saved data
// is never touched. Losing it only means files are downloaded again.
const KeepKeepDownloads = (() => {
  let db = null;
  const open = () => (db ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('keepkeep', 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('downloaded')) d.createObjectStore('downloaded', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('posts')) d.createObjectStore('posts', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => { d.close(); db = null; }; // a newer page or worker upgrades it
      resolve(d);
    };
    req.onerror = () => { db = null; reject(req.error); };
  }));

  async function run(store, mode, fn) {
    const t = (await open()).transaction(store, mode);
    const req = fn(t.objectStore(store));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  return {
    file: (id) => run('downloaded', 'readonly', (s) => s.get(id)),
    putFile: (rec) => run('downloaded', 'readwrite', (s) => s.put(rec)),
    post: (key) => run('posts', 'readonly', (s) => s.get(key)),
    putPost: (rec) => run('posts', 'readwrite', (s) => s.put(rec)),
    posts: () => run('posts', 'readonly', (s) => s.getAll()),
    async forget() {
      await run('downloaded', 'readwrite', (s) => s.clear());
      await run('posts', 'readwrite', (s) => s.clear());
    },
  };
})();

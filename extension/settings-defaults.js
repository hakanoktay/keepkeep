// Copyright (c) 2026 Hakan Oktay (Zetasis). All rights reserved. Not open source: see LICENSE.
// KeepKeep's settings, the values each can have and what it is when never set
// (or set to something unknown). The one place for this: every part reads its
// settings through here (the content scripts, veil.js at document_start too,
// the popup, the app page and the service worker), so a default changes in
// one line.
var KeepKeepSettings = (() => {
  const VALUES = {
    photoSize: ['original', 'standard'],
    videoQuality: ['standard', 'original', 'best'],
    anonStories: [true, false],
    skipDownloaded: [true, false],
  };
  // anonStories is set to true on install (background.js), so new users have
  // it on; never set (users from before) it is off.
  const DEFAULTS = { photoSize: 'original', videoQuality: 'standard', anonStories: false, skipDownloaded: true };
  const KEYS = Object.keys(VALUES);

  const value = (key, stored) => (VALUES[key].includes(stored) ? stored : DEFAULTS[key]);
  const read = (stored = {}) => Object.fromEntries(KEYS.map((k) => [k, value(k, stored[k])]));
  const get = async () => read(await chrome.storage.local.get(KEYS));

  return { KEYS, VALUES, DEFAULTS, value, read, get };
})();

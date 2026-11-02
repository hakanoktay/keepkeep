// Updating from 1.0.0 (the version in users' hands) must keep every saved
// record exactly. The 1.0.0 extension is taken from git (commit 4864539),
// installed, filled through its own basket.js API; then the browser is closed,
// the same folder is overwritten with today's extension/ and the same profile
// is opened again (same extension id, same storage) — what a store update does
// to the data. Limitation: for --load-extension Chrome reports this relaunch as
// onInstalled 'install', not 'update' (checked), so the install-only steps run
// here (welcome tab, anonStories = true) though they don't on a real update;
// which page opens on update is tested in app-whats-new.spec.js (pagesToOpen).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const base = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const V100 = '4864539';

async function launch(dir, profile) {
  const context = await base.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return { context, id: new URL(worker.url()).host };
}

base.test('an update from 1.0.0 keeps every saved record and setting, and shows them', async () => {
  base.test.setTimeout(90_000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-update-'));
  const dir = path.join(tmp, 'extension');
  const profile = path.join(tmp, 'profile');
  execFileSync('bash', ['-c', `git -C "${ROOT}" archive ${V100} extension | tar -x -C "${tmp}"`]);
  let { context, id } = await launch(dir, profile);
  try {
    // Fill 1.0.0's storage through its own code, as its users did.
    const old = await context.newPage();
    await old.goto(`chrome-extension://${id}/popup.html`);
    await old.evaluate(async () => {
      const media = await KeepKeep.createList('Recipes', 'm');
      const people = await KeepKeep.createList('Designers', 'p');
      await KeepKeep.saveProfile({ username: 'alice', addedAt: 1700000000000, lists: [] });
      await KeepKeep.saveUser({ username: 'alice', fullName: 'Alice A', pic: 'data:image/jpeg;base64,AAAA', triedAt: 1 });
      await KeepKeep.saveMedia({ kind: 'media', key: 'ABC', code: 'ABC', type: 'reel', username: 'alice', url: 'https://www.instagram.com/reel/ABC/', thumb: 'data:image/jpeg;base64,BBBB', addedAt: 1700000001000, lists: [] });
      await KeepKeep.saveMedia({ kind: 'media', key: 'story:123', type: 'story-video', username: 'alice', url: 'https://www.instagram.com/stories/alice/123/', addedAt: 1700000002000, expiresAt: 1700086402000, lists: [] });
      await KeepKeep.setInList('m:ABC', media.id, true);
      await KeepKeep.setInList('p:alice', people.id, true);
      await chrome.storage.local.set({ photoSize: 'standard', anonStories: false });
    });
    const before = await old.evaluate(() => chrome.storage.local.get(null));
    await old.close();

    // Update: today's extension, with the version it will ship as.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, 'extension'), dir, { recursive: true });
    const manifest = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace(/"version": "[^"]+"/, '"version": "1.1.0"'));
    await context.close();
    const relaunched = launch(dir, profile);
    ({ context } = await relaunched.then((r) => { expect(r.id).toBe(id); return r; }));
    const tab = await context.newPage();
    await tab.goto(`chrome-extension://${id}/app.html#media`);
    const after = await tab.evaluate(() => chrome.storage.local.get(null));
    // Every key 1.0.0 wrote is still there, unchanged. (anonStories: see the
    // limitation above — the harness runs the install step.)
    const { anonStories: _a, ...kept } = before;
    for (const [k, v] of Object.entries(kept)) expect(after[k], k).toEqual(v);
    // Nothing else was added but the harness's install step and the app's own keys.
    expect(Object.keys(after).filter((k) => !(k in before) && k !== 'anonStories')).toEqual([]);

    // The app shows the old records.
    await tab.goto(`chrome-extension://${id}/app.html#media`);
    await expect(tab.locator('.grid .card')).toHaveCount(2);
    await expect(tab.locator('.card[data-key="m:ABC"] .chip')).toHaveText(['Recipes']);
    await tab.goto(`chrome-extension://${id}/app.html#profiles`);
    await expect(tab.locator('.card[data-key="p:alice"] .name')).toHaveText('Alice A');
    await expect(tab.locator('.card[data-key="p:alice"] .chip')).toHaveText(['Designers']);
    // New settings read as their defaults; old ones as they were.
    await tab.goto(`chrome-extension://${id}/app.html#settings`);
    await expect(tab.locator('input[name=video-quality][value=best]')).toBeChecked();
    await expect(tab.locator('input[name=photo-size][value=standard]')).toBeChecked();
  } finally {
    await context.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

const { expect } = base;

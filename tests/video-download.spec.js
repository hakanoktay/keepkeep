// Videos end to end: Download → content script → background → offscreen page →
// one MP4 in Downloads/KeepKeep. Up to 1080p from Instagram's DASH files (Best:
// the video converted to H.264; Original: joined as is), or the 720p single file
// (Standard, a manifest with nothing bigger, or whenever DASH fails).
// The fixtures stand in for the CDN files: tests/fixtures/media/make.sh.
const fs = require('fs'); const path = require('path');
const { test, expect } = require('./fixtures');

const media = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'media', name));
const PROG = media('prog-720.mp4');
const JPEG = Buffer.from('a photo, as far as this test is concerned');
const SERVED = { 'p.mp4': PROG, 'v1080.mp4': media('v-vp9.mp4'), 'v720.mp4': media('v-vp9.mp4'), 'a.mp4': media('a-aac.mp4') };
const NO_H264 = 'this browser cannot encode H.264 (WebCodecs), so Best cannot be tested here';

const V = 'https://scontent.cdninstagram.com/v/';
const rep = (mime, w, h, bw, codecs, url) => `<Representation mimeType="${mime}" ${w ? `width="${w}" height="${h}"` : ''} bandwidth="${bw}" codecs="${codecs}"><BaseURL>${url}</BaseURL><SegmentBase indexRange="818-873"><Initialization range="0-817"/></SegmentBase></Representation>`;
const mpd = (...reps) => `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>${reps.join('')}</AdaptationSet></Period></MPD>`;
const AUDIO = rep('audio/mp4', 0, 0, 66000, 'mp4a.40.5', V + 'a.mp4');
const V720 = rep('video/mp4', 720, 1280, 1500000, 'vp09.00.31.08', V + 'v720.mp4');
const MPD_1080 = mpd(V720, rep('video/mp4', 1080, 1920, 2400000, 'vp09.00.40.08', V + 'v1080.mp4'), AUDIO);
const MPD_720 = mpd(V720, AUDIO); // nothing bigger than the single file

const video = (manifest) => ({ media_type: 2, video_duration: 2, video_dash_manifest: manifest,
  image_versions2: { candidates: [{ url: V + 'c.jpg', width: 640, height: 1136 }] },
  video_versions: [{ url: V + 'p.mp4', width: 720, height: 1280 }] });
const photo = { media_type: 1, image_versions2: { candidates: [{ url: V + 't51/B1.jpg?stp=dst-jpg_e35_p1080x1080', width: 1080, height: 1080 }] } };

// Opens a fake post (video-post.html, or album.html for an album) whose API
// item is `item`, with Video quality set to `quality` (nothing stored when
// undefined), and clicks Download – or, with `story`, asks the Instagram tab
// to download story `story` as KeepKeep's own page does. `broken` maps CDN
// file names to an answer that replaces the file: 404 or a body of junk bytes.
async function download(context, extensionId, { item, quality, broken = {}, page: pageName = 'video-post', story }) {
  await context.route(/\/api\/v1\/media\/\d+\/info\//, (r) => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ items: [{ taken_at: 1719323002, user: { username: 'alice' }, ...item }] }) }));
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/app.html#about`);
  if (quality !== undefined) await ext.evaluate((videoQuality) => chrome.storage.local.set({ videoQuality }), quality);
  const requested = {}; // file name → how many times the offscreen page asked for it
  await fakeCdn(context, ext, (url) => {
    const name = new URL(url).pathname.split('/').pop();
    requested[name] = (requested[name] || 0) + 1;
    if (broken[name] === 404) return { status: 404 };
    if (broken[name]) return { body: broken[name] };
    if (name.endsWith('.jpg')) return { type: 'image/jpeg', body: JPEG };
    return SERVED[name] ? { body: SERVED[name] } : { status: 404 };
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(`https://www.instagram.com/?page=${story ? 'blank' : pageName}`);
  const button = page.locator('[data-keepkeep="action-group"] button').nth(2);
  if (!story) await expect(button).toBeVisible({ timeout: 5000 });
  // Every text the item balloons' size line shows, as it changes.
  await page.evaluate(() => {
    window.shown = new Set();
    new MutationObserver((_, watching) => {
      const host = document.getElementById('keepkeep-downloads');
      if (!host?.shadowRoot) return;
      watching.disconnect();
      new MutationObserver(() => host.shadowRoot.querySelectorAll('.bubble.item .sub').forEach((s) => window.shown.add(s.textContent)))
        .observe(host.shadowRoot, { subtree: true, childList: true, characterData: true });
    }).observe(document.documentElement, { childList: true });
  });
  if (!story) await button.click();
  else {
    await ext.evaluate(async (key) => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
      await chrome.tabs.sendMessage(tab.id, { type: 'download-keys', keys: [key] });
    }, `m:story:${story}`);
  }
  const header = page.locator('#keepkeep-downloads .bubble.header');
  await expect(header.locator('.name')).toHaveText('Saved to Downloads/KeepKeep', { timeout: 20000 });
  await expect(header).not.toHaveClass(/bad/);
  await expect(page.locator('#keepkeep-downloads .bubble.item:not(.done)')).toHaveCount(0);
  const names = await page.locator('#keepkeep-downloads .bubble.item .name').allTextContents();
  const shown = await page.evaluate(() => [...window.shown]);
  return { ext, page, requested, names, shown, files: await savedFiles(ext) };
}

// The files are fetched by the offscreen page, whose requests Playwright's
// routes don't reach: answer them through the DevTools protocol instead
// (`answer(url)` → { status = 200, type = 'video/mp4', body }).
async function fakeCdn(context, ext, answer) {
  await ext.evaluate(() => chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'test' }));
  const cdp = await context.newCDPSession(ext);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const { targetId } = targetInfos.find((t) => t.url.endsWith('/offscreen.html'));
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let lastId = 0;
  const waiting = new Map();
  const call = (method, params) => new Promise((resolve) => {
    waiting.set(++lastId, resolve);
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: lastId, method, params }) });
  });
  cdp.on('Target.receivedMessageFromTarget', (e) => {
    if (e.sessionId !== sessionId) return;
    const m = JSON.parse(e.message);
    if (waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    }
    if (m.method !== 'Fetch.requestPaused') return;
    const { status = 200, type = status === 200 ? 'video/mp4' : 'text/html', body = Buffer.alloc(0) } = answer(m.params.request.url);
    call('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: status, body: body.toString('base64'),
      responseHeaders: [{ name: 'content-type', value: type }, { name: 'content-length', value: String(body.length) }] });
  });
  await call('Fetch.enable', { patterns: [{ urlPattern: 'https://scontent.cdninstagram.com/*' }] });
}

// Every file the test browser saved (it stores them under its own names).
async function savedFiles(ext) {
  const paths = await ext.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const all = await chrome.downloads.search({});
      if (all.length && all.every((d) => d.state === 'complete')) return all.map((d) => d.filename);
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });
  return paths.map((p) => fs.readFileSync(p));
}

// The codecs of an MP4's tracks, read with Mediabunny.
function tracks(ext, bytes) {
  return ext.evaluate(async (b64) => {
    const mb = await import('/lib/mediabunny.min.mjs');
    const input = new mb.Input({ source: new mb.BufferSource(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))), formats: mb.ALL_FORMATS });
    const codecs = async (list) => Promise.all(list.map((t) => t.getCodec()));
    const out = { video: await codecs(await input.getVideoTracks()), audio: await codecs(await input.getAudioTracks()) };
    input.dispose();
    return out;
  }, bytes.toString('base64'));
}

async function encodesH264(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  const ok = await page.evaluate(async () => {
    const mb = await import('/lib/mediabunny.min.mjs');
    return mb.canEncodeVideo('avc', { width: 270, height: 480 }).catch(() => false);
  });
  await page.close();
  return ok;
}

test('Original: one MP4 with the DASH video (VP9) and audio (AAC) joined', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), quality: 'original' });
  expect(r.names).toEqual([expect.stringMatching(/^alice_\d{10}\.mp4$/)]);
  expect(r.files).toHaveLength(1);
  expect(await tracks(r.ext, r.files[0])).toEqual({ video: ['vp9'], audio: ['aac'] });
  expect(r.requested).toMatchObject({ 'v1080.mp4': 1, 'a.mp4': 1 });
  expect(r.requested['p.mp4']).toBeUndefined();
  expect(r.requested['v720.mp4']).toBeUndefined();
  // The balloon: both files' bytes together, then "Joining…", then (done) the MP4's size.
  const kb = `${Math.round((SERVED['v1080.mp4'].length + SERVED['a.mp4'].length) / 1024)} KB`;
  const both = r.shown.indexOf(`${kb} of ${kb}`);
  expect(both).toBeGreaterThanOrEqual(0);
  expect(r.shown.indexOf('Joining…')).toBeGreaterThan(both);
  expect(r.shown.at(-1)).toBe(`${Math.max(1, Math.round(r.files[0].length / 1024))} KB`);
});

test('Best (nothing stored): the video converted to H.264, the balloon says Converting', async ({ context, extensionId }) => {
  test.skip(!await encodesH264(context, extensionId), NO_H264);
  const r = await download(context, extensionId, { item: video(MPD_1080) });
  expect(r.files).toHaveLength(1);
  expect(await tracks(r.ext, r.files[0])).toEqual({ video: ['avc'], audio: ['aac'] });
  expect(r.shown.some((t) => /^Converting \d{1,3}%$/.test(t))).toBe(true);
  expect(r.requested['p.mp4']).toBeUndefined();
});

test('a stray stored value counts as Best', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), quality: 'ultra' });
  expect(r.shown.some((t) => /^Converting \d{1,3}%$/.test(t))).toBe(true);
  expect(r.files).toHaveLength(1);
});

test('Standard: the 720p single file as today, the DASH files never asked for', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), quality: 'standard' });
  expect(r.files).toHaveLength(1);
  expect(r.files[0].equals(PROG)).toBe(true);
  expect(r.requested).toMatchObject({ 'p.mp4': 1 });
  expect(r.requested['v1080.mp4']).toBeUndefined();
  expect(r.requested['a.mp4']).toBeUndefined();
});

test('a DASH file that answers 404: the single file instead, the balloon done (not failed)', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), quality: 'original', broken: { 'v1080.mp4': 404 } });
  expect(r.files).toHaveLength(1);
  expect(r.files[0].equals(PROG)).toBe(true);
  expect(r.requested).toMatchObject({ 'v1080.mp4': 1, 'p.mp4': 1 });
});

test('DASH files that cannot be joined: the single file instead', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), broken: { 'a.mp4': Buffer.from([1, 2, 3]) } });
  expect(r.files).toHaveLength(1);
  expect(r.files[0].equals(PROG)).toBe(true);
  expect(r.requested).toMatchObject({ 'v1080.mp4': 1, 'a.mp4': 1, 'p.mp4': 1 });
});

test('album with a photo and a video: _1.jpg as is, _2.mp4 joined', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { page: 'album', quality: 'original',
    item: { media_type: 8, ...photo, carousel_media: [photo, video(MPD_1080)] } });
  expect(r.names).toEqual([expect.stringMatching(/^alice_\d{10}_1\.jpg$/), expect.stringMatching(/^alice_\d{10}_2\.mp4$/)]);
  expect(r.files).toHaveLength(2);
  const mp4 = r.files.find((f) => !f.equals(JPEG));
  expect(r.files.filter((f) => f.equals(JPEG))).toHaveLength(1);
  expect(await tracks(r.ext, mp4)).toEqual({ video: ['vp9'], audio: ['aac'] });
});

test('stories take the same way: a video story joined from its DASH files', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_1080), quality: 'original', story: '333' });
  expect(r.names).toEqual([expect.stringMatching(/^alice_\d{10}_story\.mp4$/)]);
  expect(r.files).toHaveLength(1);
  expect(await tracks(r.ext, r.files[0])).toEqual({ video: ['vp9'], audio: ['aac'] });
  expect(r.requested['p.mp4']).toBeUndefined();
});

test('a manifest with nothing bigger than 720p: no DASH request, the single file', async ({ context, extensionId }) => {
  const r = await download(context, extensionId, { item: video(MPD_720) });
  expect(r.files).toHaveLength(1);
  expect(r.files[0].equals(PROG)).toBe(true);
  expect(r.requested).toMatchObject({ 'p.mp4': 1 });
  expect(r.requested['v720.mp4']).toBeUndefined();
  expect(r.requested['a.mp4']).toBeUndefined();
});

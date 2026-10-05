const fs = require('fs'); const path = require('path');
const { test, expect } = require('./fixtures');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'instagram.js'), 'utf8');
const rep = (mime, w, h, bw, codecs, url) => `<Representation mimeType="${mime}" ${w ? `width="${w}" height="${h}"` : ''} bandwidth="${bw}" codecs="${codecs}"><BaseURL>${url}</BaseURL><SegmentBase indexRange="818-873"><Initialization range="0-817"/></SegmentBase></Representation>`;
const mpd = (...reps) => `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet>${reps.join('')}</AdaptationSet></Period></MPD>`;
const V = 'https://scontent.cdninstagram.com/v/';
const item = (manifest, prog = [[720, 1280]]) => ({ media_type: 2, video_duration: 43, video_dash_manifest: manifest,
  image_versions2: { candidates: [{ url: V + 'c.jpg', width: 640, height: 1136 }] },
  video_versions: prog.map(([w, h], i) => ({ url: `${V}p${i}.mp4`, width: w, height: h })) });

async function files(context, extensionId, it) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(src + ';window.InstaApi = InstaApi;');
  return page.evaluate((it) => InstaApi.filesOf(it), it);
}

test('a 1080p manifest adds dash with the largest video and the audio', async ({ context, extensionId }) => {
  const [f] = await files(context, extensionId, item(mpd(
    rep('video/mp4', 540, 960, 900000, 'vp09.00.30.08', V + 'v540.mp4'),
    rep('video/mp4', 1080, 1920, 2400000, 'vp09.00.40.08', V + 'v1080.mp4'),
    rep('video/mp4', 720, 1280, 1500000, 'vp09.00.31.08', V + 'v720.mp4'),
    rep('audio/mp4', 0, 0, 66000, 'mp4a.40.5', V + 'a.mp4'))));
  expect(f.url).toBe(V + 'p0.mp4');
  expect(f.dash).toEqual({ video: { url: V + 'v1080.mp4', width: 1080, height: 1920, codec: 'vp09.00.40.08', bandwidth: 2400000 },
    audio: { url: V + 'a.mp4', codec: 'mp4a.40.5', bandwidth: 66000 }, duration: 43 });
});
test('720p-only manifest: no dash', async ({ context, extensionId }) => {
  const [f] = await files(context, extensionId, item(mpd(rep('video/mp4', 720, 1280, 1500000, 'vp09.00.31.08', V + 'v720.mp4'), rep('audio/mp4', 0, 0, 66000, 'mp4a.40.5', V + 'a.mp4'))));
  expect(f.dash).toBeUndefined();
});
test('no audio Representation: dash with audio null', async ({ context, extensionId }) => {
  const [f] = await files(context, extensionId, item(mpd(rep('video/mp4', 1080, 1920, 2400000, 'vp09.00.40.08', V + 'v1080.mp4'))));
  expect(f.dash.audio).toBeNull();
});
test('missing or broken manifest: no dash, no error', async ({ context, extensionId }) => {
  expect((await files(context, extensionId, item(undefined)))[0].dash).toBeUndefined();
  expect((await files(context, extensionId, item('<not xml')))[0].dash).toBeUndefined();
  expect((await files(context, extensionId, item(mpd(rep('video/mp4', 1080, 1920, 1, 'x', 'http://evil.example/v.mp4')))))[0].dash).toBeUndefined();
});
test('photos and album items are unchanged', async ({ context, extensionId }) => {
  const album = { media_type: 8, carousel_media: [{ media_type: 1, image_versions2: { candidates: [{ url: V + 'i.jpg', width: 1080, height: 1080 }] } }] };
  const [f] = await files(context, extensionId, album);
  expect(f).toEqual({ url: V + 'i.jpg', kind: 'image', thumb: V + 'i.jpg' });
});

// video-join.js: Instagram's DASH video + audio (fragmented MP4s) into one MP4,
// copied as is (Original) or with the video converted to H.264 (Best).
// Fixtures: tests/fixtures/media/make.sh (VP9 270x480 + AAC, 2 s).
const fs = require('fs'); const path = require('path');
const { test, expect } = require('./fixtures');
const media = (name) => [...fs.readFileSync(path.join(__dirname, 'fixtures', 'media', name))];
const VP9 = media('v-vp9.mp4'); const AAC = media('a-aac.mp4'); const ALAC = media('a-alac.mp4');

// Runs joinDash in an extension page and describes the result with Mediabunny and a <video>.
// `encoder` (true / false / 'throws') replaces canEncode with a stub that records what it was asked.
async function join(context, extensionId, opts) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  return page.evaluate(async (o) => {
    const { joinDash } = await import('/video-join.js');
    const mb = await import('/lib/mediabunny.min.mjs');
    const progress = []; const asked = [];
    const r = await joinDash({
      video: new Uint8Array(o.video), audio: o.audio ? new Uint8Array(o.audio) : null,
      mode: o.mode, duration: o.duration ?? null, onProgress: (p) => progress.push(p),
      canEncode: 'encoder' in o ? async (config) => {
        asked.push(config);
        if (o.encoder === 'throws') throw new Error('encoder check failed');
        return o.encoder;
      } : undefined,
    });
    const input = new mb.Input({ source: new mb.BufferSource(r.bytes), formats: mb.ALL_FORMATS });
    const codecs = (tracks) => Promise.all(tracks.map((t) => t.getCodec()));
    const out = { mode: r.mode, isBytes: r.bytes instanceof Uint8Array, progress, asked,
      video: await codecs(await input.getVideoTracks()), audio: await codecs(await input.getAudioTracks()),
      duration: await input.computeDuration() };
    input.dispose();
    const el = document.createElement('video');
    out.width = await new Promise((resolve) => {
      el.onloadedmetadata = () => resolve(el.videoWidth);
      el.onerror = () => resolve(`error: ${el.error && el.error.message}`);
      el.src = URL.createObjectURL(new Blob([r.bytes], { type: 'video/mp4' }));
    });
    return out;
  }, opts);
}

test('original: VP9 and AAC copied into one MP4 that plays', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'original', duration: 2 });
  expect(r).toMatchObject({ mode: 'original', isBytes: true, video: ['vp9'], audio: ['aac'], width: 270 });
  expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
});

test('best: video converted to H.264, audio copied, progress up to the end', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2 });
  expect(r).toMatchObject({ mode: 'best', video: ['avc'], audio: ['aac'], width: 270 });
  expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
  expect(r.progress.length).toBeGreaterThan(0);
  expect(r.progress.at(-1)).toBeGreaterThanOrEqual(0.99);
});

test('a video without sound: one video track, no audio track', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: null, mode: 'original', duration: 2 });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: [], width: 270 });
});

test('best without an H.264 encoder falls back to original', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: false });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  // A check that throws counts as "can't".
  const t = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: 'throws' });
  expect(t).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
});

test('best asks the encoder about the real size and 3x the bitrate, kept within 4-12 Mbps', async ({ context, extensionId }) => {
  // The 2 s fixture is ~0.16 Mbps: 3x is below 4 Mbps.
  const low = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: false });
  expect(low.asked).toEqual([expect.objectContaining({ codec: 'avc', width: 270, height: 480, bitrate: 4e6 })]);
  // The same bytes said to last 0.01 s: ~31 Mbps, 3x is above 12 Mbps.
  const high = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 0.01, encoder: false });
  expect(high.asked).toEqual([expect.objectContaining({ bitrate: 12e6 })]);
  // Without a duration it is read from the file (2 s).
  const read = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', encoder: false });
  expect(read.asked).toEqual([expect.objectContaining({ bitrate: 4e6 })]);
});

test('best on a video longer than 10 minutes uses original', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 601, encoder: true });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  expect(r.asked).toEqual([]);
});

test('audio in a codec it cannot handle is left out; the video still joins', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: ALAC, mode: 'original', duration: 2 });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: [], width: 270 });
});

test('unreadable input rejects', async ({ context, extensionId }) => {
  await expect(join(context, extensionId, { video: [1, 2, 3], audio: AAC, mode: 'original', duration: 2 })).rejects.toThrow();
  await expect(join(context, extensionId, { video: [1, 2, 3], audio: null, mode: 'best', duration: 2 })).rejects.toThrow();
  await expect(join(context, extensionId, { video: AAC, audio: null, mode: 'original', duration: 2 })).rejects.toThrow();
});

// video-join.js: Instagram's DASH video + audio (fragmented MP4s) into one MP4,
// copied as is (Original) or with the video converted to H.264 (Best).
// Fixtures: tests/fixtures/media/make.sh (VP9 270x480 + AAC, 2 s, and a few odd ones).
const fs = require('fs'); const path = require('path');
const { test, expect } = require('./fixtures');
const media = (name) => [...fs.readFileSync(path.join(__dirname, 'fixtures', 'media', name))];
const VP9 = media('v-vp9.mp4'); const AAC = media('a-aac.mp4'); const ALAC = media('a-alac.mp4');
const VP9_8192 = media('v-vp9-8192.mp4');
const UNREADABLE = /unsupported or unrecognizable format/;
const NO_H264 = 'this browser cannot encode H.264 (WebCodecs), so Best cannot be tested here';

async function extensionPage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  return page;
}

// Whether this browser can encode H.264 at the fixture's size at all.
async function encodesH264(context, extensionId) {
  const page = await extensionPage(context, extensionId);
  return page.evaluate(async () => {
    const mb = await import('/lib/mediabunny.min.mjs');
    return mb.canEncodeVideo('avc', { width: 270, height: 480 }).catch(() => false);
  });
}

// Runs joinDash in an extension page and describes the result with Mediabunny
// and a <video>, or returns { error } when it rejects. `encoder` (true / false /
// 'throws' / { [hardwareAcceleration]: answer }) replaces canEncode with a stub
// that records what it was asked; `progressThrows` makes onProgress throw;
// `cancelled` counts the conversions that were cancelled (on failure).
async function join(context, extensionId, opts) {
  const page = await extensionPage(context, extensionId);
  return page.evaluate(async (o) => {
    const { joinDash } = await import('/video-join.js');
    const mb = await import('/lib/mediabunny.min.mjs'); // the same module instance video-join.js uses
    const progress = []; const asked = []; const cancelled = new Set();
    const cancel = mb.Conversion.prototype.cancel;
    mb.Conversion.prototype.cancel = function () { cancelled.add(this); return cancel.call(this); };
    let r;
    try {
      r = await joinDash({
        video: new Uint8Array(o.video), audio: o.audio ? new Uint8Array(o.audio) : null,
        mode: o.mode, duration: o.duration ?? null,
        onProgress: (p) => { if (o.progressThrows) throw new Error('progress failed'); progress.push(p); },
        canEncode: 'encoder' in o ? async (config) => {
          asked.push(config);
          if (o.encoder === 'throws') throw new Error('encoder check failed');
          return typeof o.encoder === 'object' ? o.encoder[config.hardwareAcceleration] : o.encoder;
        } : undefined,
      });
    } catch (e) {
      return { error: String(e && e.message || e), asked, cancelled: cancelled.size };
    }
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
  test.skip(!await encodesH264(context, extensionId), NO_H264);
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2 });
  expect(r).toMatchObject({ mode: 'best', video: ['avc'], audio: ['aac'], width: 270 });
  expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
  expect(r.progress.length).toBeGreaterThan(0);
  expect(r.progress.at(-1)).toBeGreaterThanOrEqual(0.99);
});

test('best tries the hardware encoder first, then any encoder', async ({ context, extensionId }) => {
  test.skip(!await encodesH264(context, extensionId), NO_H264);
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2,
    encoder: { 'prefer-hardware': false, 'no-preference': true } });
  expect(r).toMatchObject({ mode: 'best', video: ['avc'], audio: ['aac'], width: 270 });
  expect(r.asked.map((c) => c.hardwareAcceleration)).toEqual(['prefer-hardware', 'no-preference']);
});

test('a video without sound: one video track, no audio track', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: null, mode: 'original', duration: 2 });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: [], width: 270 });
});

test('best without an H.264 encoder falls back to original', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: false });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  expect(r.asked.map((c) => c.hardwareAcceleration)).toEqual(['prefer-hardware', 'no-preference']);
  // A check that throws counts as "can't".
  const t = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: 'throws' });
  expect(t).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  expect(t.asked).toHaveLength(2);
});

test('best that the encoder refuses after all copies the video instead', async ({ context, extensionId }) => {
  // The check says yes, but no H.264 encoder takes 8192x8192: the conversion drops the track.
  const r = await join(context, extensionId, { video: VP9_8192, audio: AAC, mode: 'best', duration: 2, encoder: true });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
});

test('best asks the encoder about the real size and 3x the bitrate, kept within 4-12 Mbps', async ({ context, extensionId }) => {
  // The 2 s fixture is ~0.16 Mbps: 3x is below 4 Mbps.
  const low = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 2, encoder: false });
  expect(low.asked).toEqual([
    { codec: 'avc', width: 270, height: 480, bitrate: 4e6, hardwareAcceleration: 'prefer-hardware' },
    { codec: 'avc', width: 270, height: 480, bitrate: 4e6, hardwareAcceleration: 'no-preference' },
  ]);
  // The same bytes said to last 0.01 s: ~31 Mbps, 3x is above 12 Mbps.
  const high = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 0.01, encoder: false });
  expect(high.asked.map((c) => c.bitrate)).toEqual([12e6, 12e6]);
  // Without a duration it is read from the file (2 s).
  const read = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', encoder: false });
  expect(read.asked.map((c) => c.bitrate)).toEqual([4e6, 4e6]);
});

test('best on a video longer than 10 minutes uses original', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'best', duration: 601, encoder: true });
  expect(r).toMatchObject({ mode: 'original', video: ['vp9'], audio: ['aac'] });
  expect(r.asked).toEqual([]);
});

test('audio that cannot be used fails the join (the caller saves the single file, with sound)', async ({ context, extensionId }) => {
  // ALAC: readable, but a codec Mediabunny doesn't know.
  const alac = await join(context, extensionId, { video: VP9, audio: ALAC, mode: 'original', duration: 2 });
  expect(alac.error).toMatch(/no usable audio track/);
  const garbage = await join(context, extensionId, { video: VP9, audio: [1, 2, 3], mode: 'original', duration: 2 });
  expect(garbage.error).toMatch(UNREADABLE);
});

test('an unreadable video, or a file with no video track, rejects', async ({ context, extensionId }) => {
  expect((await join(context, extensionId, { video: [1, 2, 3], audio: AAC, mode: 'original', duration: 2 })).error).toMatch(UNREADABLE);
  expect((await join(context, extensionId, { video: [1, 2, 3], audio: null, mode: 'best', duration: 2 })).error).toMatch(UNREADABLE);
  // An audio file given as the video.
  expect((await join(context, extensionId, { video: AAC, audio: null, mode: 'original', duration: 2 })).error).toMatch(/no usable video track/);
});

test('a failure while joining cancels both conversions', async ({ context, extensionId }) => {
  const r = await join(context, extensionId, { video: VP9, audio: AAC, mode: 'original', duration: 2, progressThrows: true });
  expect(r.error).toBe('progress failed');
  expect(r.cancelled).toBe(2); // the failing video conversion and the audio one
});

# Video Quality (up to 1080p) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Videos download up to 1080p as one MP4, with a "Video quality" setting (Best / Original / Standard) in the popup and the app page.

**Architecture:** `instagram.js` reads Instagram's DASH manifest and adds a `dash` field to video files when it beats the 720p single file. The content script sends the files plus the chosen mode; the background passes them to the offscreen document, which fetches both DASH files and joins them with a new ES module `extension/video-join.js` (wrapping the bundled Mediabunny): copy (Original) or VP9→H.264 (Best). Any failure falls back to today's single file.

**Tech Stack:** Chrome MV3 (no build step), WebCodecs, Mediabunny 1.61.1 (`extension/lib/mediabunny.min.mjs`, MPL-2.0, already committed), Playwright tests, ffmpeg (only to make test fixtures once).

**Spec:** `specs/2026-10-04-video-quality.md`

## Global Constraints

- No build step; `extension/` loads unpacked. Content scripts and pages stay classic scripts; only `video-join.js` is an ES module, loaded with `import()`.
- Nothing loaded from the internet: Mediabunny is bundled (`extension/lib/`), unmodified, with `extension/lib/mediabunny.LICENSE`.
- Setting key `videoQuality`: `'best' | 'original' | 'standard'`; missing → `'best'`. No other storage change. `basket.js` stays the only writer of saved records.
- Best: H.264 (`codec: 'avc'`), bitrate = 3 × source video bitrate, clamped to 4 000 000–12 000 000 bit/s; audio copied. Videos longer than 600 s use Original instead of Best. If H.264 encoding is unavailable for the size/bitrate, use Original.
- A download never fails because of DASH: any DASH error → the single file (`url`, then its `fallback`), silently.
- DASH is used only when its largest video is larger (width × height) than the largest `video_versions` entry.
- Downloads: one file per video, `Downloads/KeepKeep`, same file names as today (`.mp4`).
- UI texts (exact): **Video quality** section; options
  - Best — "Up to 1080p, plays everywhere. Takes a few seconds longer."
  - Original — "Up to 1080p, exactly as Instagram stores it. Fastest, but may not open in QuickTime, Photos or iMovie."
  - Standard — "Up to 720p, a single file, fastest. The size Instagram plays on the web."
- Balloon texts while working: "Converting 45%" (Best), "Joining…" (Original).
- Every task: `cd tests && npm test` all green, commit on `v1.1.0` ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, `git push`.

## Review Focus

1. A video with no audio track (DASH has no audio Representation): the file must still come out (video only), never fall back needlessly. → Task 2 test "video without audio".
2. A manifest whose best video is not larger than the 720p single file (most reels are 720p): no DASH work at all, same bytes as today. → Task 1 test "720p-only manifest", Task 4 test "standard path untouched".
3. DASH file fetch fails (expired / 403 / 404): the 720p single file is downloaded and the balloon ends as done, not failed. → Task 4 test "DASH failure falls back".
4. Album with photos and videos mixed: photos unaffected, each video joined on its own, names `_1`, `_2`… unchanged. → Task 4 test "album".
5. Machine without an H.264 encoder: Best quietly gives Original. → Task 2 test "no encoder → copy".

---

## File Structure

```
extension/instagram.js     Modify: dashOf(item); filesOf adds `dash`; export filesOf
extension/video-join.js    Create: ES module, joinDash({ video, audio, mode, duration, onProgress, canEncode }) → { bytes, mode }
extension/offscreen.js     Modify: build() uses joinDash for files with dash; progress phases
extension/background.js    Modify: pass `mode` and validated `dash` through to the offscreen document
extension/content.js       Modify: read videoQuality, send mode + dash
extension/panel.js         Modify: balloon phase text (downloads.phase)
extension/popup.html/.js   Modify: Video quality options
extension/app/settings.js  Modify: Video quality options
extension/basket.js        Modify: SETTINGS includes 'videoQuality' (export)
tests/fixtures/media/      Create: make.sh + v-vp9.mp4, a-aac.mp4, prog-720.mp4 (tiny, committed)
tests/dash.spec.js         Create: Task 1
tests/video-join.spec.js   Create: Task 2
tests/video-settings.spec.js Create: Task 3
tests/video-download.spec.js Create: Task 4
```

---

### Task 1: Read the DASH manifest

**Files:** Modify `extension/instagram.js` (`filesOf`, new `dashOf`, return object); Test `tests/dash.spec.js`

**Interfaces:**
- Produces: `InstaApi.filesOf(item)` → `[{ url, kind, thumb, dash? }]`, where for a video with a better DASH manifest `dash = { video: { url, width, height, codec, bandwidth }, audio: { url, codec, bandwidth } | null, duration }` (`duration` = `item.video_duration` seconds, number or null). `InstaApi.dashOf(m)` exported for tests.

- [ ] **Step 1: Failing test** (`tests/dash.spec.js`) — evaluate `instagram.js` in an extension page (as `tests/panel.spec.js` does with panel.js) and call `InstaApi.filesOf`:

```js
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
```
- [ ] **Step 2: Run** `cd tests && npx playwright test dash.spec.js` → FAIL (`dash` undefined / `filesOf` not exported).
- [ ] **Step 3: Implement** in `instagram.js`:
  - `dashOf(m)`: return null unless `typeof m.video_dash_manifest === 'string'`; parse with `new DOMParser().parseFromString(..., 'application/xml')`; return null if a `parsererror` element exists. Representations: `mimeType` on the element or its parent AdaptationSet; `width`/`height`/`bandwidth` numbers; `codecs`; URL = trimmed `BaseURL` text, kept only if `https:` and host ends with `cdninstagram.com` or `fbcdn.net`. Video = largest width×height, ties → larger bandwidth; audio = the audio Representation with the largest bandwidth, or null. Return null if no video, or if video area ≤ the largest `video_versions` area. Wrap in try/catch → null.
  - `filesOf`: for video parts, `const dash = dashOf(m); return { url, kind: 'video', thumb, ...(dash && { dash }) }`.
  - Export `filesOf` and `dashOf` in the returned object.
- [ ] **Step 4: Run** focused test → PASS; full suite → green.
- [ ] **Step 5: Commit** `"Videos: read Instagram's DASH manifest (up to 1080p) next to the single file"`, push.

### Task 2: Join / convert module

**Files:** Create `extension/video-join.js`, `tests/fixtures/media/make.sh` + its outputs, `tests/video-join.spec.js`

**Interfaces:**
- Produces: `export async function joinDash({ video, audio, mode, duration, onProgress, canEncode })` where `video` and `audio` are `Uint8Array` (audio may be null), `mode` is `'best' | 'original'`, `duration` seconds or null, `onProgress(fraction 0–1)` optional, `canEncode` optional override `(config) => Promise<boolean>` (default: Mediabunny `canEncodeVideo('avc', { width, height, bitrate })`). Returns `{ bytes: Uint8Array, mode: 'best' | 'original' }` (the mode actually used). Throws on unreadable input.
- Imports `./lib/mediabunny.min.mjs`.

- [ ] **Step 1: Fixtures.** `tests/fixtures/media/make.sh` (run once, outputs committed, each < 200 KB):

```sh
#!/usr/bin/env bash
# Tiny DASH-like test media (fragmented MP4, like Instagram's): run once, commit the outputs.
set -euo pipefail
cd "$(dirname "$0")"
FRAG='-movflags +frag_keyframe+empty_moov+default_base_moof'
ffmpeg -v error -y -f lavfi -i testsrc=size=270x480:rate=30 -t 2 -c:v libvpx-vp9 -b:v 300k -pix_fmt yuv420p $FRAG v-vp9.mp4
ffmpeg -v error -y -f lavfi -i sine=frequency=440:duration=2 -c:a aac -b:a 64k $FRAG a-aac.mp4
ffmpeg -v error -y -f lavfi -i testsrc=size=180x320:rate=30 -f lavfi -i sine=duration=2 -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest prog-720.mp4
```
- [ ] **Step 2: Failing tests** (`tests/video-join.spec.js`): in an extension page (`app.html#about`), read the fixtures in Node, pass them as arrays, `await import('/video-join.js')`, run, then inspect the result with Mediabunny in the page (`Input` + `BufferSource` + `ALL_FORMATS`; `getVideoTracks()`, `getAudioTracks()`, track `.codec`, `computeDuration()`), and check a `<video>` loads it (`loadedmetadata`, `videoWidth === 270`):
  - original → tracks `vp9` + `aac`, duration 2 ± 0.1, returned mode `'original'`
  - best → `avc` + `aac`, mode `'best'`, `onProgress` called with values ending ≥ 0.99
  - video without audio (`audio: null`) → one video track, no audio track
  - best with `canEncode: async () => false` → `vp9`, mode `'original'`
  - best with `duration: 601` → mode `'original'`
  - garbage bytes (`new Uint8Array([1,2,3])`) → rejects
- [ ] **Step 3: Run** → FAIL (module missing).
- [ ] **Step 4: Implement** `video-join.js`:
  - `Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })`; `Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })` for video and audio.
  - Best: `srcBitrate = video.length * 8 / (duration || await vin.computeDuration())`; `bitrate = clamp(3 * srcBitrate, 4e6, 12e6)`; track size from `getPrimaryVideoTrack()` (`displayWidth`/`displayHeight`); use Best only if `duration ≤ 600` and `await canEncode({ codec: 'avc', width, height, bitrate })`.
  - Two composable conversions on the same output: video (`{ codec: 'avc', bitrate, forceTranscode: true, hardwareAcceleration: 'prefer-hardware' }` for Best, `{}` for Original) and audio (copy, `{}`); `showWarnings: false`; check `isValid` (throw if the video conversion isn't valid); `await output.start(); await Promise.all(executes); await output.finalize();` → `new Uint8Array(output.target.buffer)`.
  - `onProgress` from the video conversion's `onProgress`.
- [ ] **Step 5: Run** focused + full suite → green. **Step 6: Commit** `"video-join.js: join Instagram's DASH video and audio into one MP4, or convert to H.264"`, push.

### Task 3: The Video quality setting

**Files:** Modify `extension/popup.html`, `extension/popup.js`, `extension/app/settings.js`, `extension/basket.js` (`SETTINGS`); Test `tests/video-settings.spec.js`

**Interfaces:** Produces storage `videoQuality` (`'best' | 'original' | 'standard'`, missing = `'best'`); radio inputs `input[name=video-quality]` with values `best`, `original`, `standard` in both popup and app.

- [ ] **Step 1: Failing tests:** popup and app each show the section "Video quality" after "Photo size", three options with the exact titles and descriptions from Global Constraints; with nothing stored, Best is checked; choosing Original stores `videoQuality: 'original'`; a change made in the popup shows in an open app page; `KeepKeep.exportData()` includes `settings.videoQuality` when set; the popup has no horizontal overflow (`document.body.scrollWidth <= 400` after the settings pane opens and its 0.3 s slide ends).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** following the existing `photo-size` markup and code in each file (the app's `option()` helper gets a `name`/`key` parameter instead of the hard-coded `photo-size`; keep one helper). **Step 4: Run** → green. **Step 5: Commit** `"Settings: Video quality — Best, Original, Standard"`, push.

### Task 4: Wire it end to end (content → background → offscreen → balloons)

**Files:** Modify `extension/content.js` (`download`, `downloadStoryItems`), `extension/background.js` (`startDownload`), `extension/offscreen.js` (`build`), `extension/panel.js` (download balloons); Test `tests/video-download.spec.js`

**Interfaces:**
- Consumes: `InstaApi.filesOf` `dash` (Task 1); `joinDash` (Task 2); `videoQuality` (Task 3).
- Download message (content → background): `{ type: 'download', job, mode, files: [{ url, fallback, filename, dash? }] }`, `mode = videoQuality || 'best'`.
- Background → offscreen `build`: same `mode`, `files[i].dash` kept only if both its URLs pass `ALLOWED_HOSTS` (audio may be null).
- Progress (offscreen → background → tab): existing `{ type: 'dl-progress', job, index, loaded, total, done }`, plus `phase: 'convert' | 'join'` and `fraction` while joining. `KeepKeepPanel.downloads.progress(job, index, loaded, total, done, phase, fraction)` shows "Converting 45%" / "Joining…" in the item's size line and percent.

- [ ] **Step 1: Failing tests** (`tests/video-download.spec.js`), on a fake post page (reuse `tests/pages/album.html`'s structure or a new `tests/pages/video-post.html` with one `<video>` post), routing `/api/v1/media/*/info/` to an item whose `video_dash_manifest` points to `https://scontent.cdninstagram.com/v/v1080.mp4` and `.../a.mp4` (served from the fixtures with `content-type: video/mp4`; declare width 1080 / height 1920 in the manifest) and `video_versions` → `.../p.mp4` (prog-720.mp4). Read the saved file with `chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 })` + `fs.readFileSync`, inspect tracks with Mediabunny in an extension page:
  - mode `original` → one file, `vp9` + `aac`
  - mode `best` → `avc` + `aac`; the balloon showed "Converting" at some point
  - mode `standard` → the saved bytes equal `prog-720.mp4`, and the DASH URLs were never requested
  - DASH file answers 404 → saved bytes equal `prog-720.mp4`, balloon done (not failed)
  - album (photo + video) → two files `_1.jpg`, `_2.mp4`, the mp4 joined
  - a 720p-only manifest → no DASH request (Task 1 makes `dash` absent; assert the route was not hit)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:**
  - content.js: `const { photoSize, videoQuality } = await chrome.storage.local.get([...])`; send `mode: videoQuality || 'best'` and each file's `dash`. Story items go through the same `files` (they come from `filesOf`).
  - background.js: keep `dash` (host-checked) and `mode` when mapping files; pass `mode` in the `build` message.
  - offscreen.js: for a file with `dash` and `mode !== 'standard'`: fetch video then audio with `fetchWithProgress` (report the sum of both as this file's bytes), `const { joinDash } = await import('./video-join.js')`, call it with `onProgress` → `dl-progress` with `phase` (`'convert'` when mode is best, `'join'` otherwise) and `fraction`; on any error, fetch `url` (then `fallback`) as today. Blob type `video/mp4`.
  - panel.js: show the phase text; keep the done mark and size as today.
- [ ] **Step 4: Run** → green (whole suite). **Step 5: Commit** `"Downloads: videos up to 1080p (Best / Original), 720p as the safe fallback"`, push.

### Task 5: Notes, docs, third-party notice

**Files:** Modify `CLAUDE.md` (Layout rows: `extension/video-join.js`, `extension/lib/`; Instagram knowledge: DASH Representation details and the measured bitrate choice; remove "video Original via DASH merge" from "Not started"), `ROADMAP.md` (Video "Original" quality → done in v1.1.0, with the three modes), `README.md` (Downloading: video quality modes; a "Third-party" line: Mediabunny, MPL-2.0, unmodified, source https://github.com/Vanilagy/mediabunny), `store/listing.md` (DOWNLOAD IN FULL QUALITY: "Videos up to 1080p, in a file that plays everywhere."), `extension/app/whats-new.js` (1.1.0 notes: one line "Videos now download in up to 1080p."), `extension/lib/README.md` (what the file is, version 1.61.1, license, source link, "unmodified").
- [ ] Check `./scripts/package.sh` output lists `lib/mediabunny.min.mjs` and `video-join.js` in the ZIP (`unzip -l dist/*.zip`), then delete the ZIP.
- [ ] Run the full suite; commit `"Notes: video quality"`, push.

---

## Self-review

- Spec coverage: setting (T3), DASH only when better (T1), offscreen + Mediabunny (T2, T4), progress texts (T4), errors → single file (T2 throws, T4 falls back), no audio (T1, T2), >600 s and no encoder → Original (T2), albums and stories via `filesOf` (T1, T4), library bundled with license (already committed; T5 notes), tests incl. Best automated (T2, T4). Real 1080p reel check in the owner's Chrome: controller, after T4.
- Names: `dash` field shape, `joinDash({...}) → { bytes, mode }`, `videoQuality`, `mode`, `phase`/`fraction` — consistent across tasks.

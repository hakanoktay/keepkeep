# Video quality setting (up to 1080p) — design

Status: approved by the owner (2026-10-05), for 1.1.0. Feasibility checked in the owner's Chrome (see "Measured").

## Goal

Videos download in the best quality Instagram has (up to 1080p) as one file
that opens everywhere, and the user can choose in the settings. Downloads
stay one click, no dialogs, one file per video in `Downloads/KeepKeep`.

## What Instagram gives (checked on the real site, 2026-10-04)

- `/api/v1/media/<id>/info/`: `video_versions` (single progressive files,
  H.264 + audio) top out at **720p** even when the upload is 1080x1920
  (`original_width` / `original_height` say 1080x1920).
- The same item has `video_dash_manifest` (MPEG-DASH XML): several video
  Representations, **VP9** (`vp09.00.40.08…` for 1080x1920), and one audio
  Representation, AAC (`mp4a.40.5`). Each Representation is one fragmented
  MP4 file at its `BaseURL` (`SegmentBase` with `indexRange` /
  `Initialization`).
- VP9 in MP4 plays in Chrome and VLC but may not open in QuickTime, Photos or
  iMovie. Chrome (checked in the owner's Chrome on macOS) has WebCodecs with
  VP9 decoding and H.264 encoding up to 1080x1920, hardware accelerated.

## The setting

Settings (popup and app page), next to Photo size, the same option style:

- **Best (recommended)** — "Up to 1080p, plays everywhere. Takes a few
  seconds longer." The 1080p VP9 video is converted to H.264; the audio is
  copied as is; one MP4.
- **Original** — "Up to 1080p, exactly as Instagram stores it. Fastest, but
  may not open in QuickTime, Photos or iMovie." Video and audio are put into
  one MP4 without converting.
- **Standard** — "Up to 720p, a single file, fastest. The size Instagram
  plays on the web." Today's behaviour.

Stored as `videoQuality`: `'best' | 'original' | 'standard'`; missing means
`'best'`, so existing users get the better quality after the update. Nothing
else in storage changes. Backup export / import carry it like the other
settings (export only; import keeps this computer's settings, as today).

## When the DASH path is used

Only when it is better than the single file: the largest DASH video is taller
(or wider) than the largest `video_versions` entry, and there is a DASH audio
track (or the video has no sound in both). Otherwise the single file is
downloaded as today, in every mode. Videos longer than 10 minutes use
Original instead of Best (conversion would take too long).

Applies to posts, reels and album videos; stories and highlights too when
their items carry a manifest.

## Measured (2026-10-05, owner's Chrome 154 on macOS, a 43 s 1080x1920 reel)

- Inputs: VP9 1080x1920 11.9 MB (≈2.2 Mbps) + AAC 0.4 MB, fetched in 0.1–7 s.
- **Original** (copy into one MP4 with Mediabunny): 0.03 s, 12.3 MB, plays in
  Chrome; macOS Quick Look can't open it (no thumbnail) — as expected for VP9.
- **Best** (VP9 → H.264 High, hardware, audio copied): 6.7 s at 2× the source
  bitrate (24 MB, SSIM 0.972 vs the VP9 source). With the Mac's hardware
  encoder, 3× gives SSIM 0.980 (36 MB), 4× 0.986 (47 MB). **Chosen: 3× the
  source video bitrate, clamped to 4–12 Mbps.** macOS Quick Look opens the
  file (thumbnail made), so QuickTime / Photos / iMovie can.
- Chrome for Testing (the automated tests' browser) also has VP9 / AAC
  decoding and H.264 encoding, so Best is tested automatically too.

## Where it runs

- `instagram.js` `filesOf(item)` keeps today's fields and adds, for videos with
  a usable manifest, `dash: { video: { url, width, height, codec }, audio: { url, codec } | null, duration }`.
- The content script passes it through the existing `download` message.
- `offscreen.js` (already fetches every file and reports progress): for a
  file with `dash` and a mode other than Standard, fetches both files, then
  builds the MP4 with `video-join.js` (an ES module, loaded on first use with
  `import()`, wrapping **Mediabunny**) and hands the blob to `chrome.downloads`
  like any other file. The offscreen document can't read storage, so the
  content script sends the mode along with the files. On any error it downloads the single `url` instead —
  a download never fails because of this.
- Progress: the balloon shows "Downloading" (both files' bytes) then
  "Converting 45%" (Best) or "Joining" (Original).

## Library

**Mediabunny** (`mediabunny`, MPL-2.0, maintained; ~690 KB minified ES
module), bundled unmodified as `extension/lib/mediabunny.min.mjs` with its
LICENSE next to it, loaded only by the offscreen document (`<script
type="module">`). It reads the fragmented MP4 inputs, converts with
WebCodecs and writes the MP4. Chosen over `mp4-muxer` (MIT, small) because
mp4-muxer is deprecated in favour of Mediabunny and would need our own MP4
demuxer; one maintained library means far less custom code. Nothing is
loaded from the internet; the store's "no remote code" answer stays true.
`scripts/package.sh` includes `lib/`; the privacy answers don't change.

## Error handling

- Manifest missing, unparsable, no taller video: single file (today).
- Fetch of a DASH file fails, Mediabunny fails, WebCodecs unavailable or the
  config unsupported (`VideoEncoder.isConfigSupported`), or the offscreen
  document runs out of memory: single file, and the balloon says "720p"
  quietly in its size line. No error message.
- Best on a machine without an H.264 encoder: Original.

## Testing

- `filesOf` / manifest parsing: unit tests with saved manifests (VP9 1080p +
  AAC; 720p-only; no audio; malformed).
- Joining (Original): Playwright test in the offscreen document with tiny
  fixture files made by ffmpeg (VP9 fragmented MP4 + AAC fragmented MP4,
  2 s), checking the result has two tracks, the right duration and plays
  (a `<video>` element loads it).
- Best: tested automatically (Chrome for Testing encodes H.264), plus one
  real 1080p reel in the owner's Chrome via the dev window at the end. A test
  checks that Best falls back to Original when the encoder is unavailable.
- Fallback: a test where the DASH fetch fails ends with the single file.
- Settings UI: the three options in popup and app, stored as `videoQuality`.

## Out of scope

Choosing a resolution by hand, audio-only download, converting old
downloads, DASH for photos (there is none).

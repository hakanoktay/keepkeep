// Joins a video's DASH files from Instagram (video and audio, each a
// fragmented MP4) into one MP4, with Mediabunny (lib/, MPL-2.0). Loaded by the
// offscreen document on first use.
// - 'original': both tracks copied as they are (fast; VP9 plays in Chrome and
//   VLC, but may not open in QuickTime, Photos or iMovie).
// - 'best': the video converted to H.264 so the file opens everywhere, the
//   audio copied. Falls back to 'original' for long videos or when the
//   browser can't encode H.264 at this size.
import * as mb from './lib/mediabunny.min.mjs';

const BEST_MAX_SECONDS = 600; // longer videos would take too long to convert
const BITRATE_MIN = 4e6; // Best: 3x the source video's bitrate, kept within these
const BITRATE_MAX = 12e6;
const HARDWARE = 'prefer-hardware';

const open = (bytes) => new mb.Input({ source: new mb.BufferSource(bytes), formats: mb.ALL_FORMATS });
const encoderFor = ({ codec, width, height, bitrate, hardwareAcceleration }) =>
  mb.canEncodeVideo(codec, { width, height, bitrate, hardwareAcceleration });

// Conversion options for Best, or null when Original has to do.
async function bestVideo(input, size, duration, canEncode) {
  const seconds = duration || await input.computeDuration();
  if (!(seconds > 0) || seconds > BEST_MAX_SECONDS) return null;
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const bitrate = Math.round(Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, 3 * size * 8 / seconds)));
  const config = { codec: 'avc', width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), bitrate, hardwareAcceleration: HARDWARE };
  try {
    if (!await canEncode(config)) return null;
  } catch {
    return null;
  }
  return { codec: 'avc', bitrate, forceTranscode: true, hardwareAcceleration: HARDWARE };
}

// video, audio: Uint8Array (audio may be null). Returns { bytes, mode } with
// the mode actually used. Throws when the video can't be read.
export async function joinDash({ video, audio, mode, duration, onProgress, canEncode = encoderFor }) {
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const inputs = [];
  const common = { output, composable: true, showWarnings: false };
  try {
    const videoIn = open(video);
    inputs.push(videoIn);
    const best = mode === 'best' ? await bestVideo(videoIn, video.length, duration, canEncode) : null;
    // Each file gives its own kind of track (the video file's sound only when there is no audio file).
    const videoConv = await mb.Conversion.init({ ...common, input: videoIn, video: best || {}, audio: audio ? { discard: true } : {} });
    if (!videoConv.utilizedTracks.some((t) => t.isVideoTrack())) throw new Error('no usable video track');
    let audioConv = null;
    if (audio) {
      const audioIn = open(audio);
      inputs.push(audioIn);
      audioConv = await mb.Conversion.init({ ...common, input: audioIn, video: { discard: true } });
      // A codec it can't handle: the video without sound rather than no video.
      if (!audioConv.utilizedTracks.some((t) => t.isAudioTrack())) audioConv = null;
    }
    if (onProgress) videoConv.onProgress = (p) => onProgress(p);
    await output.start();
    await Promise.all([videoConv.execute(), audioConv?.execute()]);
    await output.finalize();
    return { bytes: new Uint8Array(target.buffer), mode: best ? 'best' : 'original' };
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    for (const input of inputs) input.dispose();
  }
}

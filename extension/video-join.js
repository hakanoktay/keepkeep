// Joins a video's DASH files from Instagram (video and audio, each a
// fragmented MP4) into one MP4, with Mediabunny (lib/, MPL-2.0). Loaded by the
// offscreen document on first use.
// - 'original': both tracks copied as they are (fast; VP9 plays in Chrome and
//   VLC, but may not open in QuickTime, Photos or iMovie).
// - 'best': the video converted to H.264 so the file opens everywhere, the
//   audio copied. Falls back to 'original' for long videos or when the
//   browser can't encode H.264 at this size.
// Throws when the video or a given audio file can't be used; the caller then
// saves Instagram's single file instead (it has sound).
import * as mb from './lib/mediabunny.min.mjs';

const BEST_MAX_SECONDS = 600; // longer videos would take too long to convert
const BITRATE_MIN = 4e6; // Best: 3x the source video's bitrate, kept within these
const BITRATE_MAX = 12e6;
// Hardware encoder first, then any (Chrome treats 'prefer-hardware' as a requirement).
const ACCELERATIONS = ['prefer-hardware', 'no-preference'];

const open = (bytes) => new mb.Input({ source: new mb.BufferSource(bytes), formats: mb.ALL_FORMATS });
const encoderFor = ({ codec, width, height, bitrate, hardwareAcceleration }) =>
  mb.canEncodeVideo(codec, { width, height, bitrate, hardwareAcceleration });
const uses = (conversion, type) => conversion.utilizedTracks.some((t) => t.type === type);

// Conversion options for Best, or null when Original has to do.
async function bestVideo(input, size, duration, canEncode) {
  const seconds = duration || await input.computeDuration();
  if (!(seconds > 0) || seconds > BEST_MAX_SECONDS) return null;
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const bitrate = Math.round(Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, 3 * size * 8 / seconds)));
  const config = { codec: 'avc', width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), bitrate };
  for (const hardwareAcceleration of ACCELERATIONS) {
    let ok = false;
    try {
      ok = await canEncode({ ...config, hardwareAcceleration });
    } catch {} // a check that fails counts as "can't"
    if (ok) return { codec: 'avc', bitrate, forceTranscode: true, hardwareAcceleration };
  }
  return null;
}

// video, audio: Uint8Array (audio may be null: a video without sound).
// Returns { bytes, mode } with the mode actually used.
export async function joinDash({ video, audio, mode, duration, onProgress, canEncode = encoderFor }) {
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const inputs = [];
  const conversions = [];
  const convert = async (input, options) => {
    const conversion = await mb.Conversion.init({ input, output, composable: true, showWarnings: false, ...options });
    conversions.push(conversion);
    return conversion;
  };
  try {
    const videoIn = open(video);
    inputs.push(videoIn);
    let best = mode === 'best' ? await bestVideo(videoIn, video.length, duration, canEncode) : null;
    // Each file gives its own kind of track (the video file's sound only when there is no audio file).
    const ownAudio = audio ? { discard: true } : {};
    let videoConv = await convert(videoIn, { video: best || {}, audio: ownAudio });
    // The encoder turned it down after all: copy it instead (nothing was added to the output yet).
    if (best && !videoConv.utilizedTracks.length) {
      best = null;
      videoConv = await convert(videoIn, { video: {}, audio: ownAudio });
    }
    if (!uses(videoConv, 'video')) throw new Error('no usable video track');
    let audioConv = null;
    if (audio) {
      const audioIn = open(audio);
      inputs.push(audioIn);
      audioConv = await convert(audioIn, { video: { discard: true } });
      if (!uses(audioConv, 'audio')) throw new Error('no usable audio track');
    }
    if (onProgress) videoConv.onProgress = (p) => onProgress(p);
    await output.start();
    await Promise.all([videoConv.execute(), audioConv?.execute()]);
    await output.finalize();
    return { bytes: new Uint8Array(target.buffer), mode: best ? 'best' : 'original' };
  } catch (e) {
    // Stop whatever still runs (decoders / encoders) before dropping the output.
    for (const conversion of conversions) {
      if (conversion.state === 'idle' || conversion.state === 'executing') await conversion.cancel().catch(() => {});
    }
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    for (const input of inputs) input.dispose();
  }
}

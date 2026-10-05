// Hidden helper page for downloads. It fetches a post's files (reporting
// progress), joins a video's DASH files into one MP4 when the Video quality
// setting asks for it, and hands back blob: URLs for chrome.downloads (the
// background service worker can't turn large data into a URL itself).

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'build') {
    build(msg).then(sendResponse, (e) => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg.type === 'revoke') URL.revokeObjectURL(msg.url);
});

async function build({ job, mode, files }) {
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    const send = (progress) => {
      try {
        chrome.runtime.sendMessage({ type: 'dl-progress', job, index: i, ...progress }).catch(() => {});
      } catch {} // progress is only for show
    };
    const report = (loaded, total, done) => send({ loaded, total, done });
    const file = files[i];
    // A video up to 1080p from its DASH files; on any problem with them, the
    // single file below, without a word (a download never fails because of this).
    const joined = file.dash && mode !== 'standard' ? await joinDashFiles(file.dash, mode, send).catch(() => null) : null;
    // The original-size address first; if the CDN refuses it, the listed size.
    parts.push(joined || await fetchWithProgress(file.url, report).catch((e) => {
      if (!file.fallback) throw e;
      return fetchWithProgress(file.fallback, report);
    }));
  }
  return {
    outputs: files.map((f, i) => ({ url: URL.createObjectURL(new Blob([parts[i]], { type: parts[i].mediaType })), filename: f.filename })),
  };
}

// Instagram keeps a video's larger sizes (up to 1080p) as separate video and
// audio files (DASH). Fetches both – the balloon counts their bytes together –
// and puts them into one MP4 with video-join.js: the video converted to H.264
// ('best') or both as they are ('original'). Throws on any problem.
async function joinDashFiles({ video, audio, duration }, mode, send) {
  const { joinDash } = await import('./video-join.js');
  // Until the audio's real size is known, a guess from its bitrate, so the bar doesn't step back.
  const audioGuess = audio ? Math.round(((audio.bandwidth || 0) * (duration || 0)) / 8) : 0;
  // The files' own "done" isn't passed on: the video is done once it's joined.
  const videoBytes = await fetchWithProgress(video.url, (loaded, total) => send({ loaded, total: total && total + audioGuess, done: false }));
  const audioBytes = audio
    ? await fetchWithProgress(audio.url, (loaded, total) => send({ loaded: videoBytes.length + loaded, total: total && videoBytes.length + total, done: false }))
    : null;
  const fetched = videoBytes.length + (audioBytes?.length || 0);
  const phase = mode === 'best' ? 'convert' : 'join';
  const step = (fraction) => send({ loaded: fetched, total: fetched, done: false, phase, fraction });
  step(0);
  let last = 0;
  const { bytes } = await joinDash({
    video: videoBytes, audio: audioBytes, mode, duration,
    onProgress: (fraction) => {
      if (performance.now() - last < 120) return; // don't flood the page with messages
      last = performance.now();
      step(fraction);
    },
  });
  send({ loaded: bytes.length, total: bytes.length, done: true });
  bytes.mediaType = 'video/mp4';
  return bytes;
}

// Fetches a file, reporting progress, and returns its bytes.
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // An error page or message instead of the file (e.g. an expired link) must
  // never be saved under a photo / video name.
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^(image|video)\/|^application\/octet-stream$/.test(type)) throw new Error(`not a photo or video (${type || 'unknown type'})`);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (performance.now() - last > 120) { // don't flood the page with messages
      last = performance.now();
      onProgress(loaded, total, false);
    }
  }
  onProgress(loaded, loaded, true);
  if (loaded === 0) throw new Error('empty file');
  const data = new Uint8Array(loaded);
  data.mediaType = type;
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return data;
}

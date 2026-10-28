// Background work the content script can't do itself because Instagram's CDN
// is on a different origin: making thumbnails (downloads an image, crops it to
// a square and returns a data: URL) and downloading posts.
importScripts('app/whats-new.js', 'downloads-db.js'); // shouldShowWhatsNew, pagesToOpen; KeepKeepDownloads

const ALLOWED_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'thumbnail') {
    thumbnail(msg.url, msg.size).then(sendResponse, () => sendResponse(null));
    return true; // respond asynchronously
  }
  if (msg?.type === 'download') {
    startDownload(msg, sender.tab?.id).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }
  if (msg?.type === 'dl-progress') {
    // From the helper page; pass it on to the Instagram tab that asked.
    const tabId = jobs.get(msg.job);
    if (tabId != null) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
});

// ---- Downloads ----
//
// Files are fetched by the hidden helper page (offscreen.js), which reports
// progress, and saved in Downloads/KeepKeep/ with chrome.downloads, each photo
// and video as its own file.

const jobs = new Map(); // job id → tab id, for progress messages

// `groups`: the posts / stories the files belong to ({ key, url, username,
// type, thumb, files: [index] }), recorded for the app's Downloads view.
async function startDownload({ job, mode, files, force, groups }, tabId) {
  const allowed = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && ALLOWED_HOSTS.test(u.hostname);
    } catch {
      return false;
    }
  };
  // A video's DASH files (up to 1080p) only from Instagram's CDN too; the audio may be missing.
  const dashOk = (d) => d && allowed(d.video?.url) && (d.audio == null || allowed(d.audio.url));
  // `index`: the file's place in the page's list (progress messages use it).
  files = (files || []).map((f, index) => ({ ...f, index })).filter(({ url }) => allowed(url)).map((f) => ({
    index: f.index, id: typeof f.id === 'string' && /^\d{1,40}$/.test(f.id) ? f.id : null,
    url: f.url, fallback: allowed(f.fallback) ? f.fallback : null, filename: safeName(f.filename),
    ...(dashOk(f.dash) && { dash: f.dash }),
  }));
  if (!files.length) throw new Error('no files');
  // Files saved before are skipped (shown as done in the card) unless `force`
  // or the user turned it off (Downloads view: "Skip files downloaded before").
  const skipped = [];
  const { skipDownloaded } = await chrome.storage.local.get('skipDownloaded');
  if (!force && skipDownloaded !== false) {
    const seen = await Promise.all(files.map((f) => savedBefore(f, mode).catch(() => null)));
    files = files.filter((f, i) => {
      if (!seen[i]) return true;
      skipped.push(f.index);
      if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'dl-progress', job, index: f.index, done: true, skipped: true, at: seen[i].at }).catch(() => {});
      return false;
    });
  }
  if (!files.length) return { ok: true, filenames: [], skipped };
  jobs.set(job, tabId);
  try {
    await ensureHelper();
    const built = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'build', job, mode, files });
    if (!built || built.error) throw new Error(built?.error || 'build failed');
    for (const { url, filename, index, top } of built.outputs) {
      const id = await chrome.downloads.download({
        url, filename: `KeepKeep/${filename}`, conflictAction: 'uniquify', saveAs: false,
      });
      const file = files.find((f) => f.index === index);
      releaseWhenDone(id, url, () => file?.id && KeepKeepDownloads.putFile({ id: file.id, top: !!top, at: Date.now(), dl: id, name: filename }).catch(() => {}));
    }
    recordPosts(groups, built.outputs.map((o) => o.index)).catch(() => {});
    return { ok: true, filenames: built.outputs.map((o) => o.filename), skipped };
  } finally {
    jobs.delete(job);
  }
}

function safeName(name) {
  return String(name || 'instagram').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

let helperReady = null;
async function ensureHelper() {
  if (await chrome.offscreen.hasDocument()) return;
  helperReady ||= chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Fetch Instagram media for download',
  }).finally(() => { helperReady = null; });
  await helperReady;
}

// The posts / stories with at least one file downloaded now, for the app's
// Downloads view, with a small square picture (Instagram's addresses expire).
async function recordPosts(groups, indexes) {
  const got = new Set(indexes);
  const instagram = (u) => { try { return new URL(u).hostname === 'www.instagram.com'; } catch { return false; } };
  for (const g of Array.isArray(groups) ? groups : []) {
    if (typeof g?.key !== 'string' || !/^(story:)?[\w-]{1,80}$/.test(g.key) || !instagram(g.url)) continue;
    const files = (Array.isArray(g.files) ? g.files : []).filter(Number.isInteger);
    if (!files.some((i) => got.has(i))) continue;
    const before = await KeepKeepDownloads.post(g.key).catch(() => null);
    const thumb = (g.thumb && await thumbnail(g.thumb, 240).catch(() => null)) || before?.thumb || null;
    await KeepKeepDownloads.putPost({
      key: g.key, url: g.url, username: typeof g.username === 'string' ? g.username : null,
      type: ['post', 'story', 'highlight'].includes(g.type) ? g.type : 'post', files: files.length, at: Date.now(), thumb,
    });
  }
  chrome.runtime.sendMessage({ type: 'downloads-changed' }).catch(() => {});
}

// The blob: URL has to stay valid until Chrome has written the file (including
// while a "Save as" window is open); free it afterwards.
// `onComplete` once the file is written (also if that happened before the
// listener was added: small files can finish at once).
function releaseWhenDone(downloadId, url, onComplete) {
  let over = false;
  const end = (state) => {
    if (over || state === 'in_progress') return;
    over = true;
    chrome.downloads.onChanged.removeListener(listener);
    if (state === 'complete') onComplete?.();
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url }).catch(() => {});
  };
  const listener = (delta) => { if (delta.id === downloadId && delta.state) end(delta.state.current); };
  chrome.downloads.onChanged.addListener(listener);
  chrome.downloads.search({ id: downloadId }).then(([item]) => item && end(item.state), () => {});
}

// ---- Files saved before (specs/2026-10-28-no-duplicate-downloads.md) ----
//
// Whether `file` was saved before and should be skipped: { at } or null
// (download it). A file saved in a lower quality than is possible now is
// downloaded again, and so is one Chrome reports as removed. Chrome's word
// that a file still exists can't be trusted (verified 2026-10-28: after the
// file was deleted, search() kept answering exists: true), so a skip never
// claims the file is in the folder: the card says "Downloaded before".
async function savedBefore(file, mode) {
  if (!file.id) return null;
  const rec = await KeepKeepDownloads.file(file.id);
  if (!rec) return null;
  const couldBeBetter = file.dash ? mode !== 'standard' : !!file.fallback;
  if (!rec.top && couldBeBetter) return null;
  const [item] = rec.dl != null ? await chrome.downloads.search({ id: rec.dl }) : [];
  if (item && (item.state !== 'complete' || item.exists === false)) return null;
  return { at: rec.at };
}

async function thumbnail(url, size) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.test(u.hostname)) return null;
  const res = await fetch(u);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());

  // Center-crop to a square.
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size || 240, side);
  const canvas = new OffscreenCanvas(out, out);
  canvas.getContext('2d').drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out,
  );
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return 'data:image/jpeg;base64,' + btoa(binary);
}

// ---- Anonymous stories: a masked toolbar icon, like a private window ----

async function showAnonIcon() {
  const { anonStories } = await chrome.storage.local.get('anonStories');
  const name = anonStories === true ? 'anon' : 'icon';
  await chrome.action.setIcon({ path: Object.fromEntries([16, 32, 48, 128].map((s) => [s, `icons/${name}${s}.png`])) });
  await chrome.action.setTitle({ title: anonStories === true ? 'KeepKeep – watching stories anonymously' : 'KeepKeep' });
}
chrome.storage.onChanged.addListener((changes, area) => area === 'local' && changes.anonStories && showAnonIcon());
chrome.runtime.onStartup.addListener(showAnonIcon);
chrome.runtime.onInstalled.addListener(showAnonIcon);

// ---- First run, only on install (never on updates) ----
// New users start with anonymous stories on (owner's choice); people who
// already use KeepKeep keep whatever they had, so an update changes nothing.

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') await chrome.storage.local.set({ anonStories: true });
  // Install: welcome. Update: what's new, only when this version has notes
  // and it is a minor/major step. Nothing else opens a tab.
  const page = pagesToOpen(details, chrome.runtime.getManifest().version);
  if (page) chrome.tabs.create({ url: page });
});

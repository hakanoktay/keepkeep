// Copyright (c) 2026 Hakan Oktay (Zetasis). All rights reserved. Not open source: see LICENSE.
// Runs in Instagram's own page context (world: MAIN) so it can see the
// page's requests. When "Watch stories anonymously" is on, the request that
// tells Instagram a story was seen is answered here instead of being sent, so
// the story's owner doesn't see you in their viewers list. Everything else
// goes through untouched. The setting arrives from stories.js as an attribute
// on <html>.
//
// It also keeps the stories Instagram's page loads for its story viewer (a
// highlight, an account's current stories; from its GraphQL answers, or from
// the JSON in the HTML when opened from a link) and hands them to KeepKeep's
// content scripts (instagram.js), which download them: Instagram's
// /api/v1/feed/reels_media/ answers 500 since 2026-11 and the page now loads
// them through GraphQL. Only read, never changed; nothing leaves the page.
(() => {
  // ---- The stories the page loads ----
  const reels = new Map(); // reel id ("highlight:<id>" or the owner's id) → { id, username, items }
  const KEEP = ['pk', 'id', 'taken_at', 'expiring_at', 'media_type', 'image_versions2', 'video_versions', 'video_dash_manifest'];
  const slim = (it) => {
    const o = {};
    for (const k of KEEP) if (it[k] != null) o[k] = it[k];
    if (Array.isArray(it.carousel_media)) o.carousel_media = it.carousel_media.map(slim);
    return o;
  };
  const isItem = (it) => it && typeof it === 'object' && it.pk != null && (it.image_versions2 || it.video_versions);
  function collect(o, found, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (Array.isArray(o)) { for (const x of o) collect(x, found, depth + 1); return; }
    if ((typeof o.id === 'string' || typeof o.id === 'number') && Array.isArray(o.items) && o.items.length && o.items.every(isItem) && o.user?.username) {
      found.push({ id: String(o.id), username: String(o.user.username).toLowerCase(), items: o.items.map(slim) });
      return;
    }
    for (const v of Object.values(o)) collect(v, found, depth + 1);
  }
  function share(list) {
    if (list.length) window.postMessage({ keepkeep: 'reels', reels: list }, location.origin);
  }
  function read(text) {
    if (typeof text !== 'string' || !text.includes('"items"') || !text.includes('reels_media')) return;
    const found = [];
    // GraphQL answers can be several JSON documents, one per line.
    for (const part of text.split(/\r?\n/)) {
      try { collect(JSON.parse(part), found); } catch {}
    }
    const fresh = [];
    for (const r of found) {
      const had = reels.get(r.id);
      if (had && had.items.length >= r.items.length) continue; // a later, shorter page of the same reel
      reels.set(r.id, r);
      fresh.push(r);
    }
    while (reels.size > 60) reels.delete(reels.keys().next().value);
    share(fresh);
  }
  // Opened from a link, the page comes with its stories already in it, as
  // JSON in the HTML instead of a request.
  function readInline() {
    for (const el of document.querySelectorAll('script[type="application/json"]')) {
      if (el.textContent.includes('reels_media')) read(el.textContent);
    }
  }
  document.addEventListener('DOMContentLoaded', readInline);
  // A content script that started later asks for what is already here.
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.keepkeep !== 'reels?') return;
    readInline();
    share([...reels.values()]);
  });
  const isGraphql = (url) => /\/graphql/.test(String(url || ''));

  // Instagram has used these for "story seen" (web GraphQL mutation names and
  // the older REST endpoint). Matched against the request's URL and body.
  const SEEN = /Stories\w*SeenMutation|StoryViewerSeen\w*Mutation|ReelSeen\w*Mutation|\/stories\/reel\/seen|\/api\/v1\/media\/seen/i;
  const FAKE = '{"data":{},"status":"ok"}';

  const enabled = () => document.documentElement.dataset.keepkeepAnonStories === '1';

  function bodyText(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      let out = '';
      for (const [k, v] of body) out += `${k}=${typeof v === 'string' ? v : ''}&`;
      return out;
    }
    return '';
  }

  function isSeen(url, body) {
    if (!enabled()) return false;
    const text = bodyText(body);
    const hit = String(url).match(SEEN) || text.match(SEEN);
    if (hit) console.info('[KeepKeep] story seen not sent:', hit[0]);
    return !!hit;
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (isSeen(url, init?.body)) {
      return Promise.resolve(new Response(FAKE, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    const answer = origFetch.apply(this, arguments);
    if (isGraphql(url)) answer.then((res) => res.clone().text()).then(read).catch(() => {});
    return answer;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__keepkeepUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (!isSeen(this.__keepkeepUrl, body)) {
      if (isGraphql(this.__keepkeepUrl)) {
        this.addEventListener('load', () => {
          try { read(this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? JSON.stringify(this.response) : ''); } catch {}
        });
      }
      return origSend.apply(this, arguments);
    }
    // Answer as if Instagram had said "ok".
    const define = (k, v) => Object.defineProperty(this, k, { configurable: true, get: () => v });
    define('readyState', 4);
    define('status', 200);
    define('statusText', 'OK');
    define('responseText', FAKE);
    define('response', this.responseType === 'json' ? JSON.parse(FAKE) : FAKE);
    setTimeout(() => {
      for (const type of ['readystatechange', 'load', 'loadend']) {
        const ev = new ProgressEvent(type);
        this.dispatchEvent(ev);
        this['on' + type]?.call(this, ev);
      }
    }, 0);
  };
})();

// The side panel: clicking a media card slides it in from the right with the
// post itself (Instagram's own embed view: every photo and video, the
// caption) under KeepKeep's details — owner, date, lists, Download, Open on
// Instagram, Remove. Stories and highlights have no embed: their saved
// picture is shown instead. A profile card opens the profile the same way:
// what KeepKeep has saved about it (picture, name, lists, the media saved
// from it); a post opened from there has a way back. ← / → step through the
// grid, Escape or × closes.
(() => {
  const { el, icon, on, state } = KeepKeepApp;
  const saved = KeepKeepApp.saved;
  let panel = null; // the <aside>, while open
  let scrim = null; // the dimmed page behind it: a click there closes the panel
  let openKey = null;
  let full = null; // the large view over the whole page, while open
  let from = null; // the profile a post was opened from (its key), for "back"

  const media = (key) => state.media.find((m) => 'm:' + m.key === key);
  const profile = (key) => state.profiles.find((p) => 'p:' + p.username === key);
  const isProfileKey = (key) => String(key).startsWith('p:');
  const savedFrom = (username) => state.media.filter((m) => m.username === username).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const isStory = (m) => String(m.key).startsWith('story:');
  // Posts and reels share one embed address, by shortcode.
  const embedUrl = (m) => `https://www.instagram.com/p/${encodeURIComponent(m.code || m.key)}/embed/captioned/`;

  function dateText(ts) {
    return ts ? `Saved ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  }

  // Only the lists the post is in (× takes it out); "+ Add to list" opens a
  // small searchable menu of the other media lists, where typing a new name
  // offers to create that list. A user may have dozens of lists.
  let pickerOpen = false;
  function lists(item, key) {
    const kind = key[0]; // 'm' or 'p': media lists or profile lists
    const mine = new Set(item.lists || []);
    const all = state.lists.filter((l) => l.kind === kind);
    const chips = all.filter((l) => mine.has(l.id)).map((l) => el('span', { class: 'peek-list on', 'data-id': l.id },
      el('span', { text: l.name }),
      el('button', { type: 'button', class: 'peek-unlist', title: `Remove from ${l.name}`, 'aria-label': `Remove from ${l.name}`,
        onclick: () => KeepKeep.setInList(key, l.id, false) }, icon('close'))));
    const add = el('button', { type: 'button', class: 'peek-list peek-add', 'aria-expanded': String(pickerOpen),
      onclick: (e) => { e.stopPropagation(); pickerOpen = !pickerOpen; refreshHead(); } }, icon('plus'), el('span', { text: 'Add to list' }));
    return el('div', { class: 'peek-lists-wrap' },
      el('div', { class: 'peek-lists' }, chips, add),
      pickerOpen ? picker(key, kind, all.filter((l) => !mine.has(l.id))) : null);
  }

  function picker(key, kind, others) {
    const input = el('input', { type: 'search', class: 'peek-search', placeholder: 'Find or create a list', 'aria-label': 'Find or create a list', maxlength: '40' });
    const items = el('div', { class: 'peek-options', role: 'listbox' });
    const choose = async (id) => { pickerOpen = false; await KeepKeep.setInList(key, id, true); };
    const create = async (name) => { pickerOpen = false; const l = await KeepKeep.createList(name, kind); await KeepKeep.setInList(key, l.id, true); };
    function fill() {
      const q = input.value.trim().toLowerCase();
      const shown = others.filter((l) => l.name.toLowerCase().includes(q));
      const exact = state.lists.some((l) => l.kind === kind && l.name.trim().toLowerCase() === q);
      items.replaceChildren(...[
        ...shown.map((l) => el('button', { type: 'button', class: 'peek-option', role: 'option', onclick: () => choose(l.id) }, el('span', { text: l.name }))),
        q && !exact ? el('button', { type: 'button', class: 'peek-option create', onclick: () => create(input.value.trim()) }, icon('plus'), el('span', { text: `Create "${input.value.trim()}"` })) : null,
        !others.length && !q ? el('p', { class: 'peek-empty', text: 'Type a name to create a list.' }) : null,
      ].filter(Boolean));
    }
    input.addEventListener('input', fill);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pickerOpen = false; refreshHead(); }
      else if (e.key === 'Enter') { e.preventDefault(); items.querySelector('.peek-option')?.click(); }
    });
    fill();
    queueMicrotask(() => input.focus());
    return el('div', { class: 'peek-picker' }, input, items);
  }

  const backButton = () => (from && profile(from)
    ? el('button', { type: 'button', class: 'peek-back', title: `Back to @${profile(from).username}`, onclick: () => open(from) },
      icon('back'), el('span', { text: '@' + profile(from).username }))
    : null);

  function head(m) {
    return el('div', { class: 'peek-head' },
      backButton(),
      el('div', { class: 'peek-top' },
        el('div', { class: 'peek-who' },
          el('b', { text: m.username ? '@' + m.username : 'Owner not found' }),
          el('span', { class: 'peek-date', text: dateText(m.addedAt) })),
        el('div', { class: 'peek-tools' },
          el('button', { type: 'button', class: 'peek-close', title: 'View large (F)', 'aria-label': 'View large', onclick: () => showFull(true) }, icon('expand')),
          el('button', { type: 'button', class: 'peek-close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }, icon('close')))),
      lists(m, 'm:' + m.key),
      el('div', { class: 'peek-actions' },
        el('button', { type: 'button', class: 'peek-btn', onclick: () => saved.bulkDownload?.(['m:' + m.key]) }, icon('download'), 'Download'),
        m.url ? el('a', { class: 'peek-btn', href: m.url, target: '_blank', rel: 'noopener' }, icon('open'), 'Open on Instagram') : null,
        el('button', { type: 'button', class: 'peek-btn danger', onclick: () => { close(); saved.removeWithUndo(['m:' + m.key]); } }, icon('trash'), 'Remove')));
  }

  // A profile: what KeepKeep has saved about it. Kept small for now; later
  // this is where tabs with more about the account go.
  function profileHead(p) {
    const user = state.users[p.username] || {};
    const url = `https://www.instagram.com/${encodeURIComponent(p.username)}/`;
    return el('div', { class: 'peek-head' },
      el('div', { class: 'peek-top' },
        user.pic ? el('img', { class: 'peek-pic', src: user.pic, alt: '' }) : el('span', { class: 'peek-pic', text: p.username[0].toUpperCase() }),
        el('div', { class: 'peek-who' },
          el('b', { text: '@' + p.username }),
          user.fullName ? el('span', { class: 'peek-name', text: user.fullName }) : null,
          el('span', { class: 'peek-date', text: dateText(p.addedAt) })),
        el('div', { class: 'peek-tools' },
          el('button', { type: 'button', class: 'peek-close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }, icon('close')))),
      lists(p, 'p:' + p.username),
      el('div', { class: 'peek-actions' },
        el('a', { class: 'peek-btn', href: url, target: '_blank', rel: 'noopener' }, icon('open'), 'Open on Instagram'),
        el('button', { type: 'button', class: 'peek-btn danger', onclick: () => { close(); saved.removeWithUndo(['p:' + p.username]); } }, icon('trash'), 'Remove')));
  }

  function profileBody(p) {
    const items = savedFrom(p.username);
    const grid = el('div', { class: 'peek-grid' }, items.map((m) => el('button', {
      type: 'button', class: 'peek-tile', 'data-key': 'm:' + m.key, title: 'Open this post',
      onclick: () => { from = 'p:' + p.username; open('m:' + m.key, true); },
    }, m.thumb ? el('img', { src: m.thumb, alt: '', loading: 'lazy' }) : el('span', { class: 'placeholder' }))));
    return el('div', { class: 'peek-body peek-profile' },
      el('h3', { class: 'peek-section', text: `Saved from @${p.username}` }, el('span', { class: 'count', text: String(items.length) })),
      items.length ? grid : el('p', { class: 'peek-note', text: 'Nothing saved from this account yet.' }));
  }

  function refreshHead() {
    if (!panel) return;
    const item = isProfileKey(openKey) ? profile(openKey) : media(openKey);
    if (item) panel.querySelector('.peek-head')?.replaceWith(isProfileKey(openKey) ? profileHead(item) : head(item));
  }

  // Some accounts' posts are refused in Instagram's embed view (it shows
  // "The link to this photo or video may be broken…" although the post is
  // live; verified 2026-10-28: every post of such an account, while other
  // accounts' posts embed fine). The refusal page carries "EmbedBrokenMedia".
  // Checked once per post per session, alongside the iframe.
  const refused = new Map(); // embed URL → Promise<boolean>
  function isRefused(url) {
    if (!refused.has(url)) {
      refused.set(url, fetch(url, { credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((html) => html.includes('EmbedBrokenMedia'))
        .catch(() => false));
    }
    return refused.get(url);
  }

  function refusedView(m) {
    return el('div', { class: 'peek-body peek-still' },
      m.thumb ? el('img', { class: 'wide', src: m.thumb, alt: '' }) : null,
      el('p', { class: 'peek-note', text: 'Instagram doesn\'t allow this post to be shown here. Open it on Instagram to see it.' }));
  }

  function body(m) {
    if (isStory(m) || !(m.code || m.key)) {
      return el('div', { class: 'peek-body peek-still' },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder', text: 'No preview' }),
        el('p', { class: 'peek-note', text: 'Stories have no preview here. Open it on Instagram to watch it.' }));
    }
    // Instagram's view can take a while on a slow connection: a spinner until it has loaded.
    const wrap = el('div', { class: 'peek-body loading' },
      el('div', { class: 'peek-spinner', role: 'status', 'aria-label': 'Loading the post' }, el('span', {})));
    const frame = el('iframe', { class: 'peek-embed', src: embedUrl(m), title: 'The post on Instagram', loading: 'eager', allowfullscreen: true,
      onload: () => wrap.classList.remove('loading') });
    wrap.append(frame);
    isRefused(frame.src).then((no) => { if (no && wrap.isConnected) wrap.replaceWith(refusedView(m)); });
    return wrap;
  }

  // The large view: the same post over the whole page on a dark backdrop, as
  // big as the window allows; ← / → keep stepping; Escape, × or a click on
  // the backdrop return to the panel. No new tab.
  function showFull(on) {
    full?.remove();
    full = null;
    const m = on && panel && media(openKey);
    if (!m) return; // posts only
    full = el('div', { id: 'peek-full', role: 'dialog', 'aria-label': 'The post, large', onclick: (e) => { if (e.target === full) showFull(false); } },
      el('div', { class: 'peek-full-tools' },
        el('button', { type: 'button', class: 'peek-full-btn', title: 'Download', 'aria-label': 'Download', onclick: () => saved.bulkDownload?.([openKey]) }, icon('download')),
        el('button', { type: 'button', class: 'peek-full-btn', title: 'Back (Esc)', 'aria-label': 'Back', onclick: () => showFull(false) }, icon('close'))),
      el('div', { class: 'peek-full-stage' }, body(m)));
    document.body.append(full);
  }

  function markCard() {
    for (const c of document.querySelectorAll('.card.peeking')) c.classList.remove('peeking');
    const key = from || openKey; // a post opened from a profile: the profile's card
    if (key) document.querySelector(`.card[data-key="${CSS.escape(key)}"]`)?.classList.add('peeking');
  }

  // `keepFrom`: opened from a profile's panel (so the post can lead back).
  function open(key, keepFrom = false) {
    if (key === openKey) return close(); // clicking the open card again closes
    const isProfile = isProfileKey(key);
    const m = isProfile ? profile(key) : media(key);
    if (!m) return;
    if (!keepFrom) from = null;
    const first = !panel;
    if (first) {
      scrim = el('div', { id: 'peek-scrim', onclick: close });
      panel = el('aside', { id: 'peek', 'aria-label': 'Post' });
      document.body.append(scrim, panel);
    }
    openKey = key;
    pickerOpen = false;
    document.body.classList.add('peek-open');
    panel.replaceChildren(...(isProfile ? [profileHead(m), profileBody(m)] : [head(m), body(m)]));
    if (full) showFull(!isProfile); // stepping with ← / → in the large view
    panel.classList.toggle('entering', first);
    markCard();
  }

  function close() {
    showFull(false);
    if (!panel) return;
    const p = panel, sc = scrim;
    panel = null;
    scrim = null;
    sc?.classList.add('leaving');
    setTimeout(() => sc?.remove(), 220);
    openKey = null;
    from = null;
    document.body.classList.remove('peek-open');
    markCard();
    p.classList.add('leaving');
    setTimeout(() => p.remove(), 220);
  }

  // Previous / next card in the grid's order.
  function step(dir) {
    // A post opened from a profile steps through that profile's saved posts.
    const keys = from ? savedFrom(profile(from)?.username).map((m) => 'm:' + m.key) : saved.keys().filter((k) => k[0] === openKey[0]);
    const i = keys.indexOf(openKey);
    const next = keys[i + dir];
    if (i < 0 || !next) return;
    open(next, !!from);
    if (from) return;
    document.querySelector(`.card[data-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  saved.openItem = open;

  // A click elsewhere closes the list menu.
  document.addEventListener('click', (e) => {
    if (pickerOpen && !e.target.closest?.('.peek-lists-wrap')) { pickerOpen = false; refreshHead(); }
  });

  // Before the grid's own keys (Escape there clears the selection).
  addEventListener('keydown', (e) => {
    if (!panel || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Escape') { if (full) showFull(false); else close(); }
    else if ((e.key === 'f' || e.key === 'F') && !isProfileKey(openKey)) showFull(!full);
    else if (e.key === 'Backspace' && from) open(from);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Storage changed (a list toggled here or elsewhere, the item removed…).
  on('change', () => {
    if (!panel) return;
    if (isProfileKey(openKey)) {
      const p = profile(openKey);
      if (!p) return close();
      refreshHead();
      panel.querySelector('.peek-body')?.replaceWith(profileBody(p)); // saved media may have changed
    } else {
      if (!media(openKey)) return close();
      refreshHead(); // the embed keeps playing
    }
    markCard();
  });
  // Leaving the grid (Settings, About…) closes it; re-renders keep the mark.
  on('route', () => {
    const view = document.querySelector('main')?.dataset.view;
    // The panel belongs to the grid it was opened from (a post opened from a
    // profile's panel stays while on Profiles).
    const home = from || openKey;
    if (!home || view !== (isProfileKey(home) ? 'profiles' : 'media')) close();
    else markCard();
  });
})();

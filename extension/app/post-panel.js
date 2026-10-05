// The side panel: clicking a media card slides it in from the right with the
// post itself (Instagram's own embed view: every photo and video, the
// caption) under KeepKeep's details — owner, date, lists, Download, Open on
// Instagram, Remove. Stories and highlights have no embed: their saved
// picture is shown instead. ← / → step through the grid, Escape or × closes.
(() => {
  const { el, icon, on, state } = KeepKeepApp;
  const saved = KeepKeepApp.saved;
  let panel = null; // the <aside>, while open
  let scrim = null; // the dimmed page behind it: a click there closes the panel
  let openKey = null;
  let full = null; // the large view over the whole page, while open

  const media = (key) => state.media.find((m) => 'm:' + m.key === key);
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
  function lists(m) {
    const key = 'm:' + m.key;
    const mine = new Set(m.lists || []);
    const all = state.lists.filter((l) => l.kind === 'm');
    const chips = all.filter((l) => mine.has(l.id)).map((l) => el('span', { class: 'peek-list on', 'data-id': l.id },
      el('span', { text: l.name }),
      el('button', { type: 'button', class: 'peek-unlist', title: `Remove from ${l.name}`, 'aria-label': `Remove from ${l.name}`,
        onclick: () => KeepKeep.setInList(key, l.id, false) }, icon('close'))));
    const add = el('button', { type: 'button', class: 'peek-list peek-add', 'aria-expanded': String(pickerOpen),
      onclick: (e) => { e.stopPropagation(); pickerOpen = !pickerOpen; refreshHead(); } }, icon('plus'), el('span', { text: 'Add to list' }));
    return el('div', { class: 'peek-lists-wrap' },
      el('div', { class: 'peek-lists' }, chips, add),
      pickerOpen ? picker(key, all.filter((l) => !mine.has(l.id))) : null);
  }

  function picker(key, others) {
    const input = el('input', { type: 'search', class: 'peek-search', placeholder: 'Find or create a list', 'aria-label': 'Find or create a list', maxlength: '40' });
    const items = el('div', { class: 'peek-options', role: 'listbox' });
    const choose = async (id) => { pickerOpen = false; await KeepKeep.setInList(key, id, true); };
    const create = async (name) => { pickerOpen = false; const l = await KeepKeep.createList(name, 'm'); await KeepKeep.setInList(key, l.id, true); };
    function fill() {
      const q = input.value.trim().toLowerCase();
      const shown = others.filter((l) => l.name.toLowerCase().includes(q));
      const exact = state.lists.some((l) => l.kind === 'm' && l.name.trim().toLowerCase() === q);
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

  function head(m) {
    return el('div', { class: 'peek-head' },
      el('div', { class: 'peek-top' },
        el('div', { class: 'peek-who' },
          el('b', { text: m.username ? '@' + m.username : 'Owner not found' }),
          el('span', { class: 'peek-date', text: dateText(m.addedAt) })),
        el('div', { class: 'peek-tools' },
          el('button', { type: 'button', class: 'peek-close', title: 'View large (F)', 'aria-label': 'View large', onclick: () => showFull(true) }, icon('expand')),
          el('button', { type: 'button', class: 'peek-close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }, icon('close')))),
      lists(m),
      el('div', { class: 'peek-actions' },
        el('button', { type: 'button', class: 'peek-btn', onclick: () => saved.bulkDownload?.(['m:' + m.key]) }, icon('download'), 'Download'),
        m.url ? el('a', { class: 'peek-btn', href: m.url, target: '_blank', rel: 'noopener' }, icon('open'), 'Open on Instagram') : null,
        el('button', { type: 'button', class: 'peek-btn danger', onclick: () => { close(); saved.removeWithUndo(['m:' + m.key]); } }, icon('trash'), 'Remove')));
  }

  function refreshHead() {
    const m = panel && media(openKey);
    if (m) panel.querySelector('.peek-head')?.replaceWith(head(m));
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
    return wrap;
  }

  // The large view: the same post over the whole page on a dark backdrop, as
  // big as the window allows; ← / → keep stepping; Escape, × or a click on
  // the backdrop return to the panel. No new tab.
  function showFull(on) {
    full?.remove();
    full = null;
    const m = on && panel && media(openKey);
    if (!m) return;
    full = el('div', { id: 'peek-full', role: 'dialog', 'aria-label': 'The post, large', onclick: (e) => { if (e.target === full) showFull(false); } },
      el('div', { class: 'peek-full-tools' },
        el('button', { type: 'button', class: 'peek-full-btn', title: 'Download', 'aria-label': 'Download', onclick: () => saved.bulkDownload?.([openKey]) }, icon('download')),
        el('button', { type: 'button', class: 'peek-full-btn', title: 'Back (Esc)', 'aria-label': 'Back', onclick: () => showFull(false) }, icon('close'))),
      el('div', { class: 'peek-full-stage' }, body(m)));
    document.body.append(full);
  }

  function markCard() {
    for (const c of document.querySelectorAll('.card.peeking')) c.classList.remove('peeking');
    if (openKey) document.querySelector(`.card[data-key="${CSS.escape(openKey)}"]`)?.classList.add('peeking');
  }

  function open(key) {
    if (key === openKey) return close(); // clicking the open card again closes
    const m = media(key);
    if (!m) return;
    const first = !panel;
    if (first) {
      scrim = el('div', { id: 'peek-scrim', onclick: close });
      panel = el('aside', { id: 'peek', 'aria-label': 'Post' });
      document.body.append(scrim, panel);
    }
    openKey = key;
    pickerOpen = false;
    document.body.classList.add('peek-open');
    panel.replaceChildren(head(m), body(m));
    if (full) showFull(true); // stepping with ← / → in the large view
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
    document.body.classList.remove('peek-open');
    markCard();
    p.classList.add('leaving');
    setTimeout(() => p.remove(), 220);
  }

  // Previous / next card in the grid's order.
  function step(dir) {
    const keys = saved.keys().filter((k) => k.startsWith('m:'));
    const i = keys.indexOf(openKey);
    const next = keys[i + dir];
    if (i < 0 || !next) return;
    open(next);
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
    else if (e.key === 'f' || e.key === 'F') showFull(!full);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Storage changed (a list toggled here or elsewhere, the item removed…).
  on('change', () => {
    if (!panel) return;
    const m = media(openKey);
    if (!m) return close();
    refreshHead(); // the embed keeps playing
    markCard();
  });
  // Leaving the grid (Settings, About…) closes it; re-renders keep the mark.
  on('route', () => {
    const view = document.querySelector('main')?.dataset.view;
    if (view !== 'media') close();
    else markCard();
  });
})();

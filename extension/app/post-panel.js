// The side panel: clicking a media card slides it in from the right with the
// post itself (Instagram's own embed view: every photo and video, the
// caption) under KeepKeep's details — owner, date, lists, Download, Open on
// Instagram, Remove. Stories and highlights have no embed: their saved
// picture is shown instead. ← / → step through the grid, Escape or × closes.
(() => {
  const { el, icon, on, state } = KeepKeepApp;
  const saved = KeepKeepApp.saved;
  let panel = null; // the <aside>, while open
  let openKey = null;

  const media = (key) => state.media.find((m) => 'm:' + m.key === key);
  const isStory = (m) => String(m.key).startsWith('story:');
  // Posts and reels share one embed address, by shortcode.
  const embedUrl = (m) => `https://www.instagram.com/p/${encodeURIComponent(m.code || m.key)}/embed/captioned/`;

  function dateText(ts) {
    return ts ? `Saved ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  }

  function lists(m) {
    const ids = new Set(m.lists || []);
    return el('div', { class: 'peek-lists' },
      state.lists.filter((l) => l.kind === 'm').map((l) => el('button', {
        type: 'button', class: 'peek-list' + (ids.has(l.id) ? ' on' : ''), 'data-id': l.id, 'aria-pressed': String(ids.has(l.id)),
        onclick: () => KeepKeep.setInList('m:' + m.key, l.id, !ids.has(l.id)),
      }, ids.has(l.id) ? icon('check') : icon('plus'), el('span', { text: l.name }))));
  }

  function head(m) {
    return el('div', { class: 'peek-head' },
      el('div', { class: 'peek-top' },
        el('div', { class: 'peek-who' },
          el('b', { text: m.username ? '@' + m.username : 'Owner not found' }),
          el('span', { class: 'peek-date', text: dateText(m.addedAt) })),
        el('button', { type: 'button', class: 'peek-close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }, icon('close'))),
      lists(m),
      el('div', { class: 'peek-actions' },
        el('button', { type: 'button', class: 'peek-btn', onclick: () => saved.bulkDownload?.(['m:' + m.key]) }, icon('download'), 'Download'),
        m.url ? el('a', { class: 'peek-btn', href: m.url, target: '_blank', rel: 'noopener' }, icon('open'), 'Open on Instagram') : null,
        el('button', { type: 'button', class: 'peek-btn danger', onclick: () => { close(); saved.removeWithUndo(['m:' + m.key]); } }, icon('trash'), 'Remove')));
  }

  function body(m) {
    if (isStory(m) || !(m.code || m.key)) {
      return el('div', { class: 'peek-body peek-still' },
        m.thumb ? el('img', { src: m.thumb, alt: '' }) : el('div', { class: 'placeholder', text: 'No preview' }),
        el('p', { class: 'peek-note', text: 'Stories have no preview here. Open it on Instagram to watch it.' }));
    }
    return el('div', { class: 'peek-body' },
      el('iframe', { class: 'peek-embed', src: embedUrl(m), title: 'The post on Instagram', loading: 'eager', allowfullscreen: true }));
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
      panel = el('aside', { id: 'peek', 'aria-label': 'Post' });
      document.body.append(panel);
    }
    openKey = key;
    document.body.classList.add('peek-open');
    panel.replaceChildren(head(m), body(m));
    panel.classList.toggle('entering', first);
    markCard();
  }

  function close() {
    if (!panel) return;
    const p = panel;
    panel = null;
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

  // Before the grid's own keys (Escape there clears the selection).
  addEventListener('keydown', (e) => {
    if (!panel || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Escape') close();
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
    panel.querySelector('.peek-head')?.replaceWith(head(m)); // the embed keeps playing
    markCard();
  });
  // Leaving the grid (Settings, About…) closes it; re-renders keep the mark.
  on('route', () => {
    const view = document.querySelector('main')?.dataset.view;
    if (view !== 'media') close();
    else markCard();
  });
})();

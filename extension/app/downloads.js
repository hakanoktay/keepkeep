// The Downloads view: every post and story KeepKeep downloaded (newest first),
// from its record in IndexedDB (downloads-db.js; the service worker writes it
// and says "downloads-changed"). A card opens the side panel (post-panel.js:
// Download again, Save to Media). On top: the "Skip files downloaded before"
// switch and Forget. This is a history, not a collection: no lists, no
// dragging; Save to Media puts a post in the collection.
(() => {
  const { el, icon, view, state } = KeepKeepApp;
  let records = []; // newest first
  let grid = null, empty = null, countLine = null, q = '';

  const DAY = 86400000;
  function dateText(ts) {
    const days = Math.floor((Date.now() - ts) / DAY);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  }
  const plural = (n, one) => `${n} ${n === 1 ? one : one + 's'}`;

  async function load() {
    records = (await KeepKeepDownloads.posts().catch(() => [])).sort((a, b) => b.at - a.at);
    state.downloads = records.length;
    KeepKeepApp.renderNav();
    paint();
  }

  function card(r) {
    const story = r.type === 'story' || r.type === 'highlight';
    return el('div', { class: 'card download', 'data-key': 'd:' + r.key },
      el('div', { class: 'thumb' },
        el('div', { class: 'preview' }, r.thumb ? el('img', { src: r.thumb, alt: '', loading: 'lazy', draggable: 'false' }) : el('div', { class: 'placeholder', text: 'No preview' })),
        story ? el('span', { class: 'type' }, icon('story'), 'Story') : null),
      el('div', { class: 'meta' },
        el('div', { class: 'row' },
          el('span', { class: 'owner' + (r.username ? '' : ' unknown'), text: r.username ? '@' + r.username : 'Owner not found' }),
          el('span', { class: 'date', text: dateText(r.at) })),
        el('span', { class: 'files', text: plural(r.files, 'file') })));
  }

  const shown = () => records.filter((r) => !q || (r.username || '').includes(q.toLowerCase().replace(/^@/, '')));

  function paint() {
    if (!grid?.isConnected) return;
    const list = shown();
    grid.replaceChildren(...list.map(card));
    empty.hidden = list.length > 0;
    empty.textContent = records.length ? 'Nothing matches.' : 'Nothing downloaded yet. Posts and stories you download appear here.';
    countLine.textContent = records.length ? `${records.length} downloaded` : '';
    KeepKeepApp.emit('downloads');
  }

  // What KeepKeep can't do here, said up front so a limit isn't taken for a bug
  // (specs/2026-10-28-no-duplicate-downloads.md): a card under the toolbar's
  // "Good to know" button, open by itself on the first visit only (remembered
  // in this browser); outside click or Escape closes it.
  const SEEN = 'keepkeep.downloads.goodToKnow.seen';
  const LIMITS = [
    ["KeepKeep can't see your Downloads folder.", "Chrome doesn't let extensions look at your files, so KeepKeep remembers what it downloaded, not what is still there. A file you deleted, moved or renamed still counts as downloaded: open it here and use Download again."],
    ['Only downloads from this version on are listed.', 'What you downloaded earlier is still in your folder, just not in this list.'],
    ['This list stays in this browser.', "It isn't part of Backup and doesn't move to another computer. Forget, or removing KeepKeep, empties it; your files stay."],
    ['A post removed from Instagram is gone.', "If its owner deletes it or hides it from you, it can't be downloaded again; the files you already have stay yours."],
  ];
  let note = null, noteBtn = null;
  function showNote(open) {
    if (!note?.isConnected) return;
    note.hidden = !open;
    noteBtn.setAttribute('aria-expanded', String(open));
    if (!open) try { localStorage.setItem(SEEN, '1'); } catch {}
  }
  document.addEventListener('pointerdown', (e) => { if (note && !note.hidden && !note.contains(e.target) && !noteBtn.contains(e.target)) showNote(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && note && !note.hidden) showNote(false); });

  function controls() {
    const forget = el('div', { class: 'forget' });
    const ask = () => forget.replaceChildren(
      el('span', { text: 'Forget this list? Your files stay.' }),
      el('button', { type: 'button', class: 'btn danger', id: 'forget-yes', onclick: async () => { await KeepKeepDownloads.forget(); idle(); load(); } }, 'Forget'),
      el('button', { type: 'button', class: 'btn quiet', onclick: idle }, 'Cancel'));
    const idle = () => forget.replaceChildren(countLine,
      el('button', { type: 'button', class: 'link-btn', id: 'forget', onclick: ask }, 'Forget'));
    idle();
    return el('div', { class: 'downloads-title' }, el('h1', { text: 'Downloads' }), forget);
  }

  function toolbar() {
    const skip = el('input', { type: 'checkbox', id: 'skip-downloaded', onchange: (e) => chrome.storage.local.set({ skipDownloaded: e.target.checked }) });
    chrome.storage.local.get('skipDownloaded').then(({ skipDownloaded }) => { skip.checked = skipDownloaded !== false; });
    noteBtn = el('button', { type: 'button', class: 'chip', id: 'good-to-know-btn', 'aria-expanded': 'false', 'aria-controls': 'good-to-know',
      onclick: () => showNote(note.hidden) }, icon('about'), 'Good to know');
    note = el('div', { class: 'good-to-know', id: 'good-to-know', role: 'note', hidden: true },
      el('ul', {}, ...LIMITS.map(([head, text]) => el('li', {}, el('b', { text: head }), ' ', text))));
    let seen = false;
    try { seen = localStorage.getItem(SEEN) === '1'; } catch {}
    if (!seen) { note.hidden = false; noteBtn.setAttribute('aria-expanded', 'true'); }
    return el('div', { class: 'toolbar downloads-toolbar' },
      el('label', { class: 'search' }, icon('search'),
        el('input', { id: 'search', type: 'search', placeholder: 'Search owner', value: q, autocomplete: 'off',
          oninput: (e) => { q = e.target.value.trim(); paint(); } })),
      el('div', { class: 'tools' },
        el('label', { class: 'chip skip-toggle', title: "KeepKeep remembers what it downloaded and doesn't save it again, so your folder gets no copies. \"Download again\" always saves it anyway." },
          skip, 'Skip downloaded before'),
        noteBtn),
      note);
  }

  view({
    id: 'downloads', title: 'Downloads', nav: 'main', icon: 'download', full: false,
    render(main) {
      grid = el('div', { class: 'grid' });
      empty = el('p', { class: 'empty', hidden: true });
      countLine = el('span', { class: 'count-line' });
      // A card opens the side panel; ⌘ / Ctrl / Shift-click opens Instagram in a new tab.
      grid.addEventListener('click', (e) => {
        const c = e.target.closest('.card[data-key]');
        if (!c) return;
        const r = find(c.dataset.key);
        if (e.metaKey || e.ctrlKey || e.shiftKey) { if (r) window.open(r.url, '_blank', 'noopener'); return; }
        KeepKeepApp.saved.openItem?.(c.dataset.key);
      });
      main.append(controls(), toolbar(), grid, empty);
      load();
    },
  });

  const find = (key) => records.find((r) => 'd:' + r.key === key) || null;
  // For the side panel: a record by its key ("d:<post key>"), and the order of the grid.
  KeepKeepApp.downloads = { find, keys: () => shown().map((r) => 'd:' + r.key) };

  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'downloads-changed') load(); });
  load(); // the sidebar's count
})();

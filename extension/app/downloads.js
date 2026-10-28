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

  function controls() {
    const skip = el('input', { type: 'checkbox', id: 'skip-downloaded', onchange: (e) => chrome.storage.local.set({ skipDownloaded: e.target.checked }) });
    chrome.storage.local.get('skipDownloaded').then(({ skipDownloaded }) => { skip.checked = skipDownloaded !== false; });
    const forget = el('div', { class: 'forget' });
    const ask = () => forget.replaceChildren(
      el('span', { text: 'Forget everything KeepKeep downloaded? Your files stay where they are.' }),
      el('button', { type: 'button', class: 'btn danger', id: 'forget-yes', onclick: async () => { await KeepKeepDownloads.forget(); idle(); load(); } }, 'Forget'),
      el('button', { type: 'button', class: 'btn quiet', onclick: idle }, 'Cancel'));
    const idle = () => forget.replaceChildren(countLine,
      el('button', { type: 'button', class: 'link-btn', id: 'forget', onclick: ask }, 'Forget'));
    idle();
    return el('div', { class: 'downloads-head' },
      el('label', { class: 'setting-toggle' },
        el('span', { class: 'text' }, el('b', { text: 'Skip files downloaded before' }),
          el('span', { class: 'desc', text: "KeepKeep remembers what it downloaded and doesn't save it again, so your folder gets no copies. \"Download again\" always saves it anyway." })),
        skip),
      forget);
  }

  view({
    id: 'downloads', title: 'Downloads', nav: 'main', icon: 'download', full: false,
    render(main) {
      grid = el('div', { class: 'grid' });
      empty = el('p', { class: 'empty', hidden: true });
      countLine = el('span', { class: 'count-line' });
      const toolbar = el('div', { class: 'toolbar' },
        el('label', { class: 'search' }, icon('search'),
          el('input', { id: 'search', type: 'search', placeholder: 'Search owner', value: q, autocomplete: 'off',
            oninput: (e) => { q = e.target.value.trim(); paint(); } })));
      // A card opens the side panel; ⌘ / Ctrl / Shift-click opens Instagram in a new tab.
      grid.addEventListener('click', (e) => {
        const c = e.target.closest('.card[data-key]');
        if (!c) return;
        const r = find(c.dataset.key);
        if (e.metaKey || e.ctrlKey || e.shiftKey) { if (r) window.open(r.url, '_blank', 'noopener'); return; }
        KeepKeepApp.saved.openItem?.(c.dataset.key);
      });
      main.append(el('h1', { text: 'Downloads' }), controls(), toolbar, grid, empty);
      load();
    },
  });

  const find = (key) => records.find((r) => 'd:' + r.key === key) || null;
  // For the side panel: a record by its key ("d:<post key>"), and the order of the grid.
  KeepKeepApp.downloads = { find, keys: () => shown().map((r) => 'd:' + r.key) };

  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'downloads-changed') load(); });
  load(); // the sidebar's count
})();

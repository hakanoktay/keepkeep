// Copyright (c) 2026 Hakan Oktay (Zetasis). All rights reserved. Not open source: see LICENSE.
// The welcome view: opens once after installing (and from About). What
// KeepKeep does first, how to start, then the trust badges as the supporting key.
(() => {
  const { el, view, svg } = KeepKeepApp;

  const MASK = '<path d="M2 9c3-2 6.5-3 10-3s7 1 10 3c0 5-4 8-7 8-1.6 0-2.3-1.5-3-1.5S10.6 17 9 17c-3 0-7-3-7-8z"/><circle cx="8" cy="11" r="1.6"/><circle cx="16" cy="11" r="1.6"/>';


  // Says whether anonymous stories are on right now (on by default for new
  // installs, but the welcome can be opened again from About after turning
  // them off), and follows the setting while the page is open.
  function anonNote() {
    const note = el('p', { class: 'note', id: 'anon-note' });
    const paint = (on) => note.replaceChildren(svg(MASK), on
      ? el('span', {}, el('b', { text: 'Anonymous stories are on.' }), " You won't appear in viewers lists, and Instagram turns KeepKeep purple so you always know. Switch it off any time in KeepKeep's popup.")
      : el('span', {}, el('b', { text: 'Anonymous stories are off.' }), ' Story owners see you in their viewers lists. ',
        el('button', { type: 'button', class: 'link-btn', id: 'anon-on', onclick: () => chrome.storage.local.set({ anonStories: true }) }, 'Turn them on')));
    KeepKeepSettings.get().then(({ anonStories }) => paint(anonStories));
    const follow = (changes) => {
      if (!note.isConnected) return chrome.storage.onChanged.removeListener(follow);
      if ('anonStories' in changes) paint(KeepKeepSettings.value('anonStories', changes.anonStories.newValue));
    };
    chrome.storage.onChanged.addListener(follow);
    return note;
  }

  function step(n, title, text) {
    return el('li', {}, el('span', { class: 'n', text: String(n) }), el('div', {}, el('b', { text: title }), el('span', { text }))); 
  }

  function render(main) {
    main.append(el('div', { class: 'welcome' },
      el('div', { class: 'brand' }, el('img', { src: 'icons/logo.svg', alt: '', width: 40, height: 40 }), el('span', { text: 'KeepKeep' })),
      el('h1', {}, 'Keep what you ', el('em', { text: 'find' }), ' on Instagram'),
      el('p', { class: 'lead', text: 'Reels, Stories, Photos, Videos, Highlights and Posts: save them to your own lists, download them in full quality, and watch stories anonymously – right inside Instagram.' }),
      el('ol', { class: 'steps' },
        step(1, 'Open Instagram', 'on instagram.com, in this browser.'),
        step(2, 'Use the purple buttons', 'next to posts, reels, stories and profiles to save or download.'),
        step(3, 'Find everything in KeepKeep', 'click its icon in the toolbar. Pin it from the puzzle-piece menu to keep it in view.')),
      anonNote(),
      el('div', { class: 'actions' },
        el('a', { class: 'cta', href: 'https://www.instagram.com/', text: 'Open Instagram' }),
        el('a', { class: 'settings-cta', href: '#settings', text: 'Settings' })),
      el('section', { class: 'trust', 'aria-label': 'Privacy' },
        KeepKeepApp.trustTags(),
        el('p', { text: KeepKeepApp.TRUST_LINE })),
      el('footer', {}, 'Made by ', el('a', { href: 'https://zetasis.net', text: 'Zetasis' }), ' · ', el('a', { href: 'https://buymeacoffee.com/zetasis', text: '☕ Buy me a coffee' })),
      el('a', { class: 'go', href: '#media', text: 'Go to KeepKeep →' })));
  }

  view({ id: 'welcome', title: 'Welcome', nav: null, full: true, render });
})();

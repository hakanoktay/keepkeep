# No duplicate downloads

The owner sometimes downloads the same post twice; Chrome then saves
`name (1).jpg` next to the first copy. KeepKeep should notice files it has
already saved and not save them again, without folder pickers or extra
windows (the owner rejected those).

## What extensions can know

- They can't read the disk. Reading `Downloads/KeepKeep` would need the user
  to pick the folder once (File System Access): a picker, so not used.
- `chrome.downloads.search({ id })` knows a file KeepKeep downloaded only
  while it is in Chrome's history (users can clear it), and its `exists` can't
  be trusted: **verified 2026-10-28 in real Chrome** (dev profile, raw DevTools
  connection, not Playwright, which moves downloads to its own folder): after
  the file was deleted from `Downloads/KeepKeep`, `search()` kept answering
  `exists: true` for 2 s, and no `onChanged` came. Chrome only knows of a
  removal it made itself (e.g. `removeFile`) or found on its own.

So KeepKeep keeps its own record and never claims a file is still in the
folder; Chrome's answer is used only when it says a file is gone.

## The record

- One entry per saved file, keyed by **Instagram's id of the photo / video**
  (the item's `pk`/`id`, also for each album item and story), not by the file
  name: `{ id, top, at, dl, name }`.
  - `top`: the file was saved in the best quality available then (photo:
    the original-size address, not its fallback; video: joined from the
    DASH files, or it had none).
  - `at`: when; `dl`: Chrome's download id; `name`: the file name.
- Kept in **IndexedDB in the service worker** (`background.js`), not in
  `chrome.storage.local`: the popup, the app page and the buttons on
  Instagram re-render on every storage change, and the record must never
  touch users' saved data. Not in backups (another computer doesn't have the
  files). Losing it is harmless: files are only downloaded again.

## The decision, per file, before fetching

| Record | Chrome says | Result |
| --- | --- | --- |
| none | — | download |
| saved, but lower quality and better is possible now | — | download |
| saved | the file was removed / the download failed | download |
| saved | anything else, or nothing (history cleared) | skip: "Downloaded before · 12 Oct" |

Skipped files show in the card as done (grey ✓). When anything was skipped
the card ends with a **Download again** button that saves just those files,
ignoring the record (`force`). The card stays longer then (9 s, and while
hovered). Header: everything skipped → "Already downloaded"; some → "Saved to
Downloads/KeepKeep" and "n files · k downloaded before".

## Known limit

A file deleted from the folder by the user is still skipped (Chrome doesn't
notice, see above). That's why every skip says "Downloaded before" (not "in
your folder") and comes with one-click **Download again**.

## The Downloads view (2026-10-29)

The owner asked for a place in the app to see this. `app/downloads.js`: a
**Downloads** section in the sidebar under Media and Profiles, listing every
post and story KeepKeep downloaded (newest first; picture, owner, date, "7
files"). It is a history, not a collection: no lists, no dragging.

- Recorded by the background for each post / story with at least one file
  downloaded (`posts` store, a small square picture made at once, since
  Instagram's addresses expire). Only downloads since this version.
- A card opens the side panel: "Downloaded 28 Oct · 7 files", **Download
  again** (through an Instagram tab, `force`; a story means just that story),
  **Save to Media** (from what the record knows; "In Media" once there), Open
  on Instagram; ← / → step through the list.
- On top: the **Skip files downloaded before** switch (`skipDownloaded` in
  `chrome.storage.local`, in backups; on unless `false`) and **Forget** (asks
  first; clears both stores, files stay where they are). Settings → Downloads
  points here.
- **The head is compact** (2026-10-29, owner's request): the title line has
  "n downloaded · Clear download history" on the right (was "Forget"; the
  owner wanted it clearer); under it one toolbar like Media's: search, a
  small "Skip downloaded before" switch with a "?" that opens its explanation
  in a card like Good to know's, and a "Good to know" button. Earlier the switch and the note were
  full-width boxes and pushed the grid ~180 px down.
- **Good to know** (2026-10-29, owner's request): a card floating under its
  button (over the grid, so nothing moves), open by itself on the first visit
  only; outside click / Escape closes it. It says the limits plainly, so a limit isn't taken for a bug: KeepKeep can't
  see the folder (deleted / moved / renamed files still count; Download
  again), only downloads from 1.1.0 on are listed, the list stays in this
  browser (not in Backup), a post removed from Instagram can't be downloaded
  again. "Seen" is remembered in `localStorage`.
- **Not done: listing earlier downloads from Chrome's history** (discussed
  2026-10-29). File names give owner and date but no post code (no link, no
  Download again), pictures can't be read from disk, and history can be
  cleared. The owner judged it not worth the effort for a new extension.

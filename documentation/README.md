# KeepKeep documentation

Everything KeepKeep does, written for the people who use it. This is the
source for what comes after it, in this order:

1. **This documentation** (here, Markdown).
2. **The website** (`docs/`, GitHub Pages), compiled from these files:
   `00-overview.md` is the home page, each other file a page.
3. **The Chrome Web Store listing**: images and texts (`store/`).
4. Then **What's new** and the other short texts inside the extension.

## Contents

| # | Page | File | Status |
| --- | --- | --- | --- |
| – | Home: what KeepKeep is, the features, privacy, get started | [00-overview.md](00-overview.md) | draft |
| 1 | Save profiles and posts | [01-save.md](01-save.md) | Save profiles: reviewed · Save posts: draft |
| 2 | Your own lists | [02-lists.md](02-lists.md) | draft |
| 3 | Download in full quality | [03-download.md](03-download.md) | draft |
| 4 | Download stories and highlights | [04-stories-and-highlights.md](04-stories-and-highlights.md) | draft |
| 5 | Anonymous story viewing | [05-anonymous-stories.md](05-anonymous-stories.md) | draft |
| 6 | Video controls | [06-video-controls.md](06-video-controls.md) | draft |
| 7 | The KeepKeep app | [07-app.md](07-app.md) | draft |
| 8 | No duplicate downloads | [08-no-duplicate-downloads.md](08-no-duplicate-downloads.md) | draft |
| 9 | Backup and import | [09-backup.md](09-backup.md) | draft |
| 10 | Private and secure by design | [10-privacy-and-security.md](10-privacy-and-security.md) | draft |
| 11 | Settings | [11-settings.md](11-settings.md) | draft |
| 12 | Keyboard shortcuts | [12-keyboard-shortcuts.md](12-keyboard-shortcuts.md) | draft |

"draft" = written and checked against the code, waiting for the owner's
review; "reviewed" = the owner went through it.

## How these pages are written

- **For users**, in plain English. Instagram's places by their everyday names
  (home feed, post window, Reels, stories), not by addresses or code.
- **Where it works** is a tree of places only: no button names or positions.
  It is complete: every place, and every way a user gets there (a story
  opened from the stories row, from a profile picture or from a link).
- **Only what is verified**: checked in the code, and on the real site when
  the code can't tell. Something not yet checked stays out until it is.
  Checked on the real site on 2026-10-29: a reel link opens in the Reels
  feed with KeepKeep's buttons; Explore's small pictures and the post window
  opened from Explore; the home feed; a profile's Reels and Tagged tabs.
- Each feature: *Where it works*, *What happens*, *What KeepKeep keeps*,
  *Where you find it*, *Good to know*. A part with nothing to say is left out.
- Privacy wording: "Never asks for your password. Your data never leaves your
  computer." Never claim KeepKeep "collects no data" (the store's privacy
  panel lists Website content).

## Open points found while writing (for the owner)

- `docs/privacy.html` says KeepKeep "keeps no record of what you downloaded":
  no longer true since the Downloads list. It must be updated before 1.1.0
  (also: the app's side panel shows Instagram's own post view).
- Settings: both "Standard" and "Best" video quality say "(recommended)";
  Best is the default.
- Import doesn't apply the settings stored in a backup (documented as is).
- The welcome page always says "Anonymous stories are on", even if they were
  turned off before it is opened again from About.

`_sources/` holds raw notes collected from the code to write from; they are
not published.

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
| 3 | Download in full quality (videos, photos) | [03-download.md](03-download.md) | draft |
| 4 | Anonymous story viewing and downloading | [04-stories.md](04-stories.md) | draft |
| 5 | Video controls | [05-video-controls.md](05-video-controls.md) | draft |
| 6 | The KeepKeep app | [06-app.md](06-app.md) | draft |
| 7 | No duplicate downloads | [07-no-duplicate-downloads.md](07-no-duplicate-downloads.md) | draft |
| 8 | Backup and import | [08-backup.md](08-backup.md) | draft |
| 9 | Private and secure by design | [09-privacy-and-security.md](09-privacy-and-security.md) | draft |
| 10 | Settings | [10-settings.md](10-settings.md) | draft |
| 11 | Keyboard shortcuts | [11-keyboard-shortcuts.md](11-keyboard-shortcuts.md) | draft |

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

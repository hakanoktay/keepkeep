# Download card: decisions and why

The card at the top right that shows downloads (`extension/panel.js`, the
`downloads` section; tests in `tests/download-balloons.spec.js`). Each step
below came from the owner testing it on real posts. Read this before
changing how the card behaves, so a rejected idea doesn't come back.

## What it is now (2026-10-28)

- **One card for all downloads.** A second post started while one is running
  joins the same card ("Downloading 2 posts · 21 files"); no second card.
- **The size is fixed.** "✓ n of N saved", then the file downloading in its
  own fixed place, then a list window of up to 2 rows, then "+n more"; both
  lines are there from the start when the files don't all fit. The card
  changes height only when another post joins (eased).
- **The file downloading has its own fixed place** (`.now`, under the saved
  line), never in the list as well. When it finishes it drops into the list
  and the next one rises in; at the end the last file stays there.
- **The list keeps the other files in their order**: finished ones above,
  waiting ones below; a file finishing only scrolls it on (smoothly) so the
  next waiting file is at the top.
- **The list scrolls by hand.** Scrolling stops the auto-follow; the page
  under the card doesn't scroll. Following comes back with "Back to current"
  (the "+n more" line turns into it) or 1.5 s after the pointer leaves the
  card.
- **Minimise** (the chevron) is on every download, a single file too; folded,
  the header says "x of y saved · n%".
- **Click-through only over KeepKeep's own buttons** (`[data-keepkeep]`):
  there the card fades and the click reaches the button. Over anything else
  (Instagram links, the post) the card stays solid.

## Tried and dropped

- **A balloon per file, then a card per post:** too many cards; several posts
  in a row stacked cards ("dancing").
- **Finished rows staying ~1 s with their ✓, then folding away; rows moving
  with FLIP animations:** with fast (cached) files the finished rows piled
  up, the card grew to 10 rows and rows overlapped while fading out. Hence the
  fixed window and the scrolling list.
- **A scroll-free "smart list"** (only current + next two): fine until the
  owner wanted to look at other files; hence scrolling by hand.
- **Pulling the list back to the current file after every finished file,
  even while the user scrolls:** rejected before building it. Fast files
  would snap the list back all the time and make scrolling impossible. The
  fixed place for the current file solves "where is it" instead.
- **The current file as a sticky row in the list** (`position: sticky`, top
  and bottom 0; 2026-10-28): scrolling down it stuck to the top, which was
  right, but scrolling up to the saved files it stuck to the bottom: the eye
  had to look for it in two places, and a row behind it showed under it.
  Replaced the same day by the fixed place above the list.
- **Fading the card whenever the pointer is over it, or over anything
  clickable under it:** the card kept going transparent. Now only over
  KeepKeep's own buttons.

## Considered, not done (yet)

- **Auto-resume like chat apps:** scrolling back to the current file resumes
  following by itself, without "Back to current" or leaving the card. Offered
  on 2026-10-28; the owner chose only the sticky row for now.

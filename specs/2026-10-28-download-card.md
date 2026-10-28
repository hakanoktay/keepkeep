# Download card: decisions and why

The card at the top right that shows downloads (`extension/panel.js`, the
`downloads` section; tests in `tests/download-balloons.spec.js`). Each step
below came from the owner testing it on real posts. Read this before
changing how the card behaves, so a rejected idea doesn't come back.

## What it is now (2026-10-28)

- **One card for all downloads.** A second post started while one is running
  joins the same card ("Downloading 2 posts · 21 files"); no second card.
- **The size is fixed.** A window of up to 3 file rows, with "✓ n of N saved"
  above and "+n more" below; both lines are there from the start when the
  files don't all fit. The card changes height only when another post joins
  (eased).
- **Files never move to another place.** They stay in their order in one
  list; a file finishing only scrolls the list up (smoothly) so the first
  unfinished file is at the top.
- **The list scrolls by hand.** Scrolling stops the auto-follow; the page
  under the card doesn't scroll. Following comes back with "Back to current"
  (the "+n more" line turns into it) or 1.5 s after the pointer leaves the
  card.
- **The file downloading is never out of sight.** Its row is `position:
  sticky` (top and bottom 0): while scrolling it sticks to the top or bottom
  edge of the window.
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
  sticky current row solves "where is the current file" instead.
- **Fading the card whenever the pointer is over it, or over anything
  clickable under it:** the card kept going transparent. Now only over
  KeepKeep's own buttons.

## Considered, not done (yet)

- **Auto-resume like chat apps:** scrolling back to the current file resumes
  following by itself, without "Back to current" or leaving the card. Offered
  on 2026-10-28; the owner chose only the sticky row for now.

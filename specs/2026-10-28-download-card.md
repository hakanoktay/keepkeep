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
- **The progress panel, Stop and Resume** (2026-11-02, the owner's design
  choice "3 · A soft panel" from mock-ups). While anything downloads, a soft
  lilac panel under the header holds "**2 of 5** saved · 44%", a thin bar and
  a **■ Stop** button (icon left, word right); the header's own spinner and
  bar step aside, and the old "✓ n of N saved" row is gone (the panel says
  it). The panel is there from the start, also while Instagram is still asked.
  Stop catches the post on the way: KeepKeep hands a post's files to Chrome
  only once the whole post is built, so none of a stopped post's files reach
  the folder (2026-11-02, the owner: "if you can catch them, catch them").
  Its rows leave the list. The header turns to "@alice · 5 files" with a
  purple **▶ Resume** across from the name, and one row says "Download
  stopped · nothing was saved", or, when earlier posts in the card had
  finished, "· 1 of 6 files saved" with a **trash** button at the row's end:
  one click deletes those files from the folder again (only downloads
  KeepKeep made), KeepKeep forgets them, and the row says "Download undone ·
  1 file deleted". No trash when nothing reached the folder. Resume
  downloads the stopped post again (and posts that were waiting in the app's
  queue), in the same card. A stopped card stays 6 s, and while hovered
  (2.5 s after the pointer leaves); 12 s was too long for the owner.
  Whatever hasn't answered 4 s after Stop is ended by the card itself. Once a
  download is done, the chevron goes, so "Saved to Downloads/KeepKeep" fits.
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

- **Stop as a ✕, and a grey ✕ "Stopped" row for every file not saved**
  (2026-11-02): the ✕ read as "close the card", and a big album filled the
  list with ✕s. Rejected by the owner the same day: Stop is a ■, files not
  saved leave the list.
- **Stop as the word "Stop" in the header**, and **Stop as a lone ■**:
  the pill cut the header's title ("Downloading 5…"); the lone ■ stood apart
  from the chevron and stayed visible after the end. Both replaced by the
  panel. Mock-ups of the options (bottom bar, own progress bar, Stop on
  hover, Stop in the saved row; then three ways to join the bar to the
  header) were made as HTML first, on the owner's request, before any code.

- **"Delete the saved files" behind a ••• menu, with "Undo this download"
  under it** (mock-up, 2026-11-02): the two lines read as two menu items.
  The trash at the end of the stopped row replaced it.

## Considered, not done (yet)

- **Auto-resume like chat apps:** scrolling back to the current file resumes
  following by itself, without "Back to current" or leaving the card. Offered
  on 2026-10-28; the owner chose only the sticky row for now.

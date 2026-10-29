Raw notes from the code (unchecked). Each fact is checked when its documentation section is written. Not for publishing.

Snapshot: branch `v1.1.0`, 2026-10-29. `extension/manifest.json:5` still says version **1.0.0** (the 1.1.0 release is not done; the app page, Downloads view, video quality, highlights, backup are all unreleased features on this branch). Paths below are relative to `/Volumes/Newline/projects/KeepKeep/` unless they start with `extension/`. "(inferred)" = not read in code, concluded. Tests only use local demo pages (`tests/pages/*.html`), so "works on page X of real Instagram" is code-derived, not verified on the real site, unless CLAUDE.md says "verified".

Content scripts (all run only in the top frame of `https://www.instagram.com/*` and `https://instagram.com/*`): `stories-main.js` (MAIN world, document_start), `veil.js` + `veil.css` (document_start), `basket.js, instagram.js, panel.js, content.js, buttons.js, video.js` (document_idle). `extension/manifest.json:37-76`. Permissions: storage, unlimitedStorage, downloads, offscreen; hosts instagram.com, *.cdninstagram.com, *.fbcdn.net (`extension/manifest.json:13-23`).

URL shapes the code understands (`KeepKeep.parse`, `extension/basket.js:28-63`; reserved non-user paths `:19-23`; USERNAME = `[A-Za-z0-9._]{1,30}` `:17`):
- `/p/<code>/`, `/reel/<code>/`, `/reels/<code>/`, `/tv/<code>/` -> media (types post, reel, reel, video) (`:24,42`)
- `/<user>/p/<code>/`, `/<user>/reel/<code>/` (and `reels`, `tv`) -> media with owner known (`:44-46`)
- `/stories/<user>/<digits>/` -> story media, key `story:<id>` (`:50-57`)
- `/stories/highlights/<id>/` -> parse returns **null** on purpose; buttons.js reads the page instead (`:47-49`)
- `/<user>/` and any 2-segment path like `/<user>/reels/`, `/<user>/tagged/` -> profile (`:58-61`); a 1-2 segment path whose first segment is reserved (`about accounts api ar challenge developer direct emails explore graphql legal locations nametag p privacy reel reels session settings stories tags tv web your_activity`) -> null.
- `/stories/<user>/` (no id) -> null in parse (reserved `stories`), handled separately in buttons.js (`:758`).
- Query strings (`?img_index=1`) are dropped; host must end in `instagram.com` (`:37`).

---

## 1. Save posts (posts, reels, stories, highlights saved as "Media")

### Where it works
```
Instagram (content scripts, buttons.js; re-scan: MutationObserver + scroll + 1 s interval, extension/buttons.js:878-921)
├─ Posts with a date link (feed, post page /p/<code>/, post window opened over feed/profile/explore)   [addPostButtons, buttons.js:229-263]
│   └─ 3 purple icons in the post's action bar, just LEFT of Instagram's save (bookmark) icon:
│       Profile (saves owner), Media (saves this post), Download  [addActionButtons :304-333]
│       found by position (a row of >=4 icons 18-32 px wide spanning >=150 px), not by label [findActionBar :267-302]
│       fallback after 6 failed tries: a text button "Save" next to the date (Media only, no Profile/Download) [:256-261]
│       post identified from the date link href: /p/, /reel/, /reels/, /tv/, /<user>/p|reel/ (<=3 path segments; comment links /p/<c>/c/<n>/ ignored) [postItem :207-217]
├─ Post thumbnails (hover): round purple icon top-right of the tile -> saves the POST (Media only)  [addOverlayButtons :469-484]
│   ├─ profile grid (Posts tab), profile Reels tab (tiles with background-image; test uses /<user>/reel/<code>/), Explore (autoplay video tiles) [tests/tiles.spec.js:4-7]
│   └─ any other page with tiles that are <a href*="/p/"> or <a href*="/reel/"> (note: selector is "/reel/" singular) wrapping img/video/background-image, width >=100, no <time> inside [:470-477]  (other pages: inferred)
├─ Profile pages (/<user>/ and sub-tabs like /<user>/reels/, /<user>/tagged/)  [addProfileButton :487-515]
│   └─ "Save profile" button next to Follow / Message / Edit profile (needs `main header`); saves PROFILE only
├─ Reels viewer (pathname starts with /reels/)  [addReelButtons :600-638]
│   └─ Profile, Media, Download icons at the top of Instagram's right-hand icon column (above like/comment/share); reel found from the reel's own link, else from the address bar (/reels/<code>/); owner from the username link next to the video, else API lookup
├─ Story viewer (pathname starts with /stories/)  [addStoryButtons :810-843]
│   └─ small vertical dark pill on the story's right edge, centred; shows while the pointer is over the story card: Profile, Media ("Add this story to Media"), Download
│       reached via (code only checks the path): /stories/<user>/<id>/ ; /stories/<user>/ (no id yet: id read from picture's ig_cache_key) ; /stories/highlights/<id>/  — how the user gets there (home stories tray, profile ring, highlight circle, shared link) is Instagram's navigation (inferred)
│       Media on a highlight saves the single story on screen with type 'highlight' (+ highlightId) [currentStory :745-765]
├─ Any instagram.com page: drag a link (address bar, or a link on the page) over the page -> corner card "Drop to save to KeepKeep"; drop it on the card  [content.js:129-143; panel.js:153,176-188]
│   └─ accepts anything KeepKeep.parse understands: profile URL, post/reel/tv URL, /stories/<user>/<id>/ URL. Highlight URL or non-Instagram URL -> red card "Not an Instagram profile or post" [content.js:53]
Toolbar popup (popup.js)
├─ header icons Profile / Media / Download act on the ACTIVE TAB's URL if parse() understands it  [loadPage :393-412, renderPageActions :414-451]
│   ├─ profile page -> Profile only; post/reel page -> Profile (owner looked up via API if URL has none), Media, Download; /stories/<user>/<id>/ -> Profile, Media, Download
│   ├─ NOT available on highlight URLs and on /stories/<user>/ without id (parse null) -> icons hidden
│   └─ needs the Instagram tab to have the content script (tab opened before install/reload: icons disabled, title "Reload the Instagram tab to use this") [:424-429]
├─ per-item "profile toggle" on each media card (adds/removes the OWNER to Profiles)  [popup.js:339-347]
KeepKeep app page (app.html)
├─ Downloads view -> side panel -> "Save to Media" (from the download record, no Instagram request)  [post-panel.js:134-160]
└─ Settings -> Import a backup (adds saved items)  [see section 9]
```
Not on Instagram pages: no save button on DMs/Explore search results etc. unless they match the post-date-link or tile patterns above (inferred).

### What it does
- Two independent collections: **Profiles** (accounts) and **Media** (posts, reels, videos, albums, stories, highlight stories). "Saving media never saves its owner as a profile; the two are independent" (`extension/basket.js:14`). The owner's name + picture are cached (`u:` record) for display anyway.
- Click an icon: item is saved at once; a corner card (top-right, 340 px) shows thumbnail, "@owner · Saved to **Media**" (or "Profiles"), a **Remove** button, and a list picker sliding open under it ("Add to a list"). Card closes after 8 s (countdown bar, paused while the pointer is on it) [panel.js:5,305-346]. Already saved -> "Already in Media/Profiles" [content.js:57-66].
- Saved state: button turns green and says "Saved"; hovering turns it red "Remove"; click removes and shows card "Removed from KeepKeep" with **Undo** (5 s) [buttons.js:55-58,149-160; content.js:113-127; panel.js:550-559].
- What is stored per media item: key (post code or `story:<id>`), code, url, type, owner username, a 240 px square JPEG preview (data URL), addedAt, lists, triedAt (+expiresAt for stories) [content.js:28-45; background.js:154-177; basket.js:3-12]. Profile: username, addedAt, lists + cached `u:` {fullName, 96 px pic}. Preview is stored because CDN links expire within days [instagram.js:84-85].
- Type recorded from Instagram: reel / album / video / photo (posts) [instagram.js:44-49]; `story-video` / `story-photo` for stories [instagram.js:197]; `highlight` for highlight stories. Missing details (no owner, no preview) are retried quietly in the background, at most every 6 h, up to 10 items per run, 3 s after an Instagram page loads [content.js:6,79-94,215].
- Real Instagram requests made when saving: `/api/v1/media/<id>/info/` (fallback: the post page's og: tags), `/api/v1/users/web_profile_info/` for name+picture (fallback: profile page og: tags), CDN image for the preview [instagram.js:51-82; content.js:12-26].
- Albums: saved as one item (the post), not per photo. Highlight: each story saved separately (one per click), not the whole highlight.
- Saved items are shown in the popup and the app (sections 2, 7).

### Settings
- None for saving. (Photo size / video quality only affect downloads.)

### Limits / things to know
- **First video story:** when a story is opened and the address is `/stories/<user>/` with no id yet, a photo story gets its id from the picture's `ig_cache_key`, a **video** story (plays from `blob:`, no id) cannot be saved with Media until the next story; ROADMAP "On hold" (needs the rate-limited profile endpoints) [ROADMAP.md:145; buttons.js:658-680,758-764]. In that case clicking Media shows the red card "Not an Instagram profile or post" (target null -> `run(null)`) [buttons.js:154-155; content.js:53].
- Highlight stories: id from the picture, or for videos from the progress-bar segment index into Instagram's highlight list (only if the counts agree); owner from the story header's profile link, else from highlight data [buttons.js:696-743; CLAUDE.md "Highlights"].
- Rate limits (CLAUDE.md "Rate limits"): `web_profile_info` and `/users/<id>/info/` answered 429 for days (2026-10-04); KeepKeep falls back to page meta tags (small picture / name) [instagram.js:51-62]. A saved profile may therefore lack name or have a small picture (inferred).
- Stories expire after 24 h on Instagram. KeepKeep keeps only the preview picture + link; `expiresAt` is stored but not shown anywhere in the UI (grep: only content.js:42, instagram.js:199). "Kept story copies" is not started (CLAUDE.md, ROADMAP.md:94). The saved link of an expired story will not open the story (inferred). The app's side panel says "Stories have no preview here. Open it on Instagram to watch it." [post-panel.js:203-207].
- Dedup: saving a post that is already saved just shows the "Already in Media" card; click on a green button removes instead.
- Saved items have lists (section 2); removing a profile keeps its media and vice versa (README.md:82).
- Nothing in KeepKeep marks a story as seen when saving (uses info API, not a "seen" call) [README.md:30 claim; code: no seen mutation sent].

### Refs
`extension/basket.js:3-14,28-67,225-239,333-362`; `extension/buttons.js:207-263,304-333,469-515,600-638,640-850`; `extension/content.js:12-127,129-143,154-213`; `extension/panel.js:305-346,550-559`; `extension/instagram.js:44-93,192-203`; `extension/popup.js:339-347,393-463`; `extension/app/post-panel.js:134-160`; `ROADMAP.md:142-145`; `CLAUDE.md` (Instagram knowledge).

---

## 2. Your own lists

### Where it works
```
Two list "kinds": profile lists ('p') and media lists ('m'); the Profiles tab/view only shows profile lists, Media only media lists. An item can be in many lists. Records refer to lists by id. (basket.js:11-12)
Corner card on Instagram (right after saving anything)  [panel.js]
├─ boxes for the lists of the matching kind (name + "n items"); click = put in / take out; tick shows membership
├─ keys 1-9 toggle the first nine boxes (ignored while typing); hint "Press 1-9"  [:532-547,337]
├─ "New list" dashed box -> type name (max 40) -> Enter creates it and puts the item in  [:373-393]
├─ search field appears at >=7 lists  [:7,336]
├─ drag a box to reorder (pointer drag after 5 px; saved order used everywhere)  [:399-488]
Toolbar popup (popup.html / popup.js)
├─ Profiles tab / Media tab, each with its own chips row: All + one chip per list (with counts); lists are per tab (switching tab resets selection)  [:80-104,369-376]
├─ "+" chip -> name field (max 40) -> Create (creates a list of the current tab's kind and selects it)  [:129-149]
├─ selecting a list shows its footer: name, count, **Rename**, **Delete list** (inline confirm "Delete "X"? Its items stay saved.")  [:153-191]
├─ tag button on every profile row / media card -> small picker: checkbox per list + "New list…" input (Enter creates and adds)  [:195-248]
├─ chips row scrolls sideways (arrow buttons, mouse wheel)  [:106-127]
├─ NO drag-to-reorder in the popup (inferred: no code)
KeepKeep app (app.html), Media and Profiles views only  [app/lists.js]
├─ sidebar under the nav: "Media lists" / "Profile lists": All + rows (name, count); click filters the grid; hover shows Rename (pencil) and Delete (trash, browser confirm "Delete the list "X"? Its items stay saved.")  [:69-117, :55]
├─ "+ New list" row; inline rename; names max 40 chars; Enter saves, Esc/blur cancels  [:8,30-41,111]
├─ drag a sidebar row up/down to reorder (5 px threshold)  [:120-178]
├─ toolbar "List" dropdown (shown when window <=900 px wide, because the sidebar's lists are hidden)  [app/saved.js:136-137,159-163; app.css:122]
├─ select cards -> bulk bar: "Add to list" (picker; click toggles for all selected: tick only if all selected are in it), "Remove from list" (only while a list is selected)  [app/saved.js:264-265,312-331]
├─ drag cards (one, or the whole selection) onto a sidebar list row  [app/saved.js:393-440; lists.js:183]
└─ side panel (card opened): chips of the item's lists with × to remove, "Add to list" -> searchable menu, typing a new name offers `Create "name"`  [post-panel.js:35-77]
Downloads view and Settings/About: no lists  [lists.js:12-18]
```

### What it does
- Create, rename, delete (items stay saved: `deleteList` removes the id from every record, `extension/basket.js:273-280`), reorder, add/remove items one or many at a time. Names are trimmed; UIs cap at 40 characters; no duplicate-name check in `createList` (inferred; the backup import does match names).
- Filter by list: popup chips; app sidebar/dropdown. Search in the app also matches list names (section 7).
- One order, stored as the `lists` array; reordering one kind keeps the other kind's positions (`reorderLists`, `basket.js:260-265`).
- Old (1.0.0) lists without `kind` are migrated automatically: each old list becomes a media list (same id) plus a profile list `<id>-p` with the same name; profiles are moved to the profile copy (`splitLists`, `basket.js:88-116`, called in `load`, `getLists`, export, import).

### Settings
- None.

### Limits / things to know
- Profile lists and media lists are separate (a list "Fashion" for media does not exist for profiles).
- Deleting a list in the app asks with a browser `confirm()`; in the popup with an inline confirm; in the corner card there is no delete/rename (only create/toggle/reorder).
- Popup reorder missing; corner-card + app sidebar reorder exist (ROADMAP.md:30-33 says "reorder by drag in the card; used everywhere").
- Lists live in `chrome.storage.local` under key `lists`; included in Backup; import merges lists by kind + case-insensitive name (section 9).

### Refs
`extension/basket.js:240-305`; `extension/panel.js:7,336-397,399-547`; `extension/popup.js:80-248,369-376`; `extension/popup.html:34-47,57-66`; `extension/app/lists.js:1-188`; `extension/app/saved.js:136-163,264-331,393-440`; `extension/app/post-panel.js:35-77`.

---

## 3. Download in full quality

### Where it works
```
Instagram pages (buttons.js)
├─ Posts with an action bar (feed, post page /p/<code>/, post window): **Download** icon (3rd of the 3 purple icons)  [buttons.js:326-328]
│   ├─ click = every photo/video of the post (whole album)
│   ├─ **Shift-click** = only the item on screen  [:326]
│   └─ **D** key with the pointer over the post = only the item on screen  [:418-440]
│        on the post's own page (/p/<code>/) D works wherever the pointer is; item taken from ?img_index=n (1-based, absent = first) [:391-395,428-433]
├─ Reels viewer (/reels/…): **Download** icon in the right column -> that reel  [:630-636]   (D key is NOT wired here — D only looks at post action groups and stories; inferred from code)
├─ Story viewer (/stories/…): pill **Download** + **D** key (works anywhere on the page, not while typing) -> see section 4  [:838,853-862]
├─ NOT on: profile-grid / Explore tile overlay (Save only), the fallback text button next to the date (Save only)  [:469-484,256-261]
Toolbar popup: header **Download** icon for the tab's post/reel (all items, no Shift variant) or story URL (see 4)  [popup.js:430-434; content.js:211-212]
KeepKeep app (needs an open instagram.com tab; otherwise notice "Open Instagram in a tab to download" + link)  [app/download.js]
├─ Media view: select cards -> bulk bar **Download** (media view only, hidden on Profiles)  [saved.js:266,306]
├─ Side panel of a media card: **Download** button; large view (F) has a download icon  [post-panel.js:96,228-229]
└─ Downloads view -> card -> **Download again**  [post-panel.js:146]
```
Hidden helper pieces: content script builds the file list (`content.js:224-253`), service worker `background.js:34-83`, offscreen document fetches/joins (`extension/offscreen.js`), Chrome `downloads` saves.

### What it does
- Saves every photo and video of a post, each as **its own file** (no ZIP, no folder picker, no dialog) into `Downloads/KeepKeep/` (`filename: KeepKeep/<name>`, `saveAs:false`, `conflictAction:'uniquify'`: a same-named file becomes "name (1).ext") [background.js:72-74]. Owner's explicit rejection of ZIPs/pickers/windows/changing Chrome settings (CLAUDE.md).
- **File names:** `<username>_<YYMMDDHHmm>[_<n>].<ext>`; time = when the post was **published**, in the computer's local time (falls back to "now" if unknown); username falls back to `instagram`; albums get `_1`, `_2`…; extension from the file URL (jpg/png/webp/heic/mp4/mov), else mp4 for video / jpg for image; the name is sanitised to `[A-Za-z0-9._-]` (others -> `_`) and cut at 120 chars [content.js:224-253,334-343; background.js:85-87]. Example from README: `telma_2507271432.jpg`, `telma_2507271432_1.jpg`, `telma_2507271432_2.mp4` (README.md:40).
- **Photos:**
  - *Original* (default): the photo as uploaded, up to 3072 px wide. Found on the post's embed page `/p/<code>/embed/captioned/` — image URLs whose `stp` has no size/crop step; URLs are signed so they can't be edited [instagram.js:95-120; CLAUDE.md "Original photos"]. If the original can't be found/fetched, the standard size is used (original address first, listed size as fallback) [instagram.js:253-256; offscreen.js:58-63; README.md:44].
  - *Standard*: the largest size the API lists, ~1080 px wide (a few hundred KB). [popup.html:93-108]
  - Stories use the API's largest listed picture only (no embed-original lookup for stories) (`story()`/`filesOf`, instagram.js:192-203; inferred that this equals "standard").
- **Videos** (setting "Video quality", default Best). Instagram's single video file stops at **720p**; 1080p exists only as separate VP9 video + AAC audio (DASH) [CLAUDE.md "Videos (verified 2026-10-05)"; specs/2026-10-04-video-quality.md:11-23]:
  - **Standard**: the single file (up to 720p, H.264 MP4 with sound). Instant, opens everywhere.
  - **Original**: up to 1080p, picture+sound joined into one MP4 **without converting** (VP9). Instant, smaller; QuickTime, Photos, iMovie, iPhone Photos can't open VP9; Chrome, VLC, Android, most of Windows can (README.md:48-53; popup.html:118-123).
  - **Best** (default): up to 1080p, picture converted to H.264 so it opens on every device/app, audio copied. Takes a few seconds longer; file larger (~35 MB for 45 s of 1080p; ~10 s for a 45 s reel on a recent Mac per README.md:52; measured 13.9 s in CLAUDE.md). Bitrate = 3x the source video's, clamped 4-12 Mbps; hardware encoder first, then software (`prefer-hardware`, then `no-preference`) [video-join.js:14-42].
  - Automatic fall-backs (a download never fails because of this):
    - Best becomes Original: video longer than **600 s**, source already H.264, or no H.264 encoder at that size [video-join.js:14,26-42]
    - single ~720p file instead (progress shows "· 720p" after the size): any fetch/join error, **stall of 25 s with no progress** (`JOIN_STALL_MS = 25_000`, offscreen.js:8; CLAUDE.md says 60 s — mismatch), estimated input or output > **300 MB** (`DASH_MAX_BYTES`, offscreen.js:12-20; README.md:60), unusable audio track, DASH only used when its video is bigger (area) than the biggest single file; if the manifest has no audio but the video has sound, no join [instagram.js:137-170]
    - if the video was uploaded at 720p, all three modes give the same file (README.md:58)
  - Only files from `cdninstagram.com` / `fbcdn.net` over https are fetched; non image/video/audio responses are rejected ("an expired link is never saved under a photo name") [background.js:6,35-50; offscreen.js:130-163; instagram.js:149].
- **One item vs all (albums):** Download = all items; Shift-click / D = the one on screen. Matching: a photo by its file name (same across sizes), a video (often `blob:`) by the album's dots (the current dot has `aria-current="step"`, else the dot that looks different), a single video = the only item; post page uses `?img_index=` [buttons.js:335-415]. Its file keeps the name it would have in the full download (`_<n>`). If KeepKeep can't tell: card "Couldn't tell which one is on screen" [:414]. Reels: "Couldn't tell which reel this is" [:633].
- **Download card** (top-right, `panel.js:561-1036`, decisions in `specs/2026-10-28-download-card.md`):
  - one card for all running downloads; a second post joins it ("Downloading 2 posts", "21 files"); header "Preparing download…" / "Finding the best quality", then "Downloading photo/video/N files" + owner [panel.js:721,759-772]
  - fixed size: "✓ n of N saved" line, the file downloading in its own fixed slot, a window of 2 more rows, "+n more"; list scrolls by hand (auto-follow resumes via "Back to current" or 1.5 s after the pointer leaves) [spec :8-30; panel.js:570,804-858]
  - per file: thumbnail (or icon), file name, "Waiting…", "x MB of y MB" + %, "Converting 45%" (Best) or "Joining…" (Original), then size (+ " · 720p" if the single file stood in) [panel.js:947-978]
  - minimise chevron on every download ("Hide the files (the download goes on)"); folded header says "x of y saved · n%" [panel.js:722-724,766]
  - end: "Saved to Downloads/KeepKeep" + file name or "N files" (or "N files · k downloaded before"); card leaves after ~4 s (9 s if there is a Download again button; waits while hovered) [panel.js:863-894]
  - failure: red header text (e.g. "Couldn't download this post") + "Try again in a moment" [content.js:250; panel.js:991-1002]
  - over KeepKeep's own buttons the card fades and the click goes through, so the next download needn't wait [panel.js:1015-1036]
  - respects `prefers-reduced-motion` [panel.js:666]
- Several posts from the app are processed strictly one after another with 800 ms between posts [content.js:174-188].
- Order inside a post: all files are fetched/built first, then handed to Chrome one by one (inferred from `background.js:69-77`: `built` awaited, then the `for` loop calls `chrome.downloads.download`).

### Settings
- **Photo size** `photoSize`: `original` (default; anything but `standard` counts as original) | `standard`. Popup ⚙ and app Settings. (`popup.js:482-486`, `app/settings.js:22-23`, `content.js:229-230`)
- **Video quality** `videoQuality`: `best` (default; missing/unknown -> best) | `original` | `standard`. Popup ⚙ and app Settings. Labels in UI: "Standard (recommended)", "Original", "Best" (both Standard and Best say "recommended"; `popup.html:113,127`, `settings.js:83,85`). (`content.js:326-331`)
- **Skip files downloaded before** `skipDownloaded` (default on) — only in the Downloads view (section 8).
- No setting for the folder, file naming, or D key.

### Limits / things to know
- Downloads work only with an open, signed-in Instagram tab (the work uses the tab's session); the app page and popup send a message to that tab. App picks the active tab of the last focused window, else the most recently used (`app/download.js:19-25`).
- Chrome's "Ask where to save each file" setting overrides `saveAs:false` and "cannot be bypassed by extensions" (CLAUDE.md "Downloads"; owner has it off).
- Refused embeds: for some accounts the embed page is refused (page contains `EmbedBrokenMedia`) -> no original-size photo possible (inferred: `embedOriginals` finds nothing -> standard size; CLAUDE.md "Refused embeds" documents only the app side panel).
- 429 rate limits on rapid use (CLAUDE.md); a failed API call -> "Couldn't download this post".
- Memory: the offscreen document holds each file in memory (blob); long videos are skipped for DASH (300 MB estimate) [offscreen.js:10-20].
- Download card never claims the file is "in your folder" (see section 8).
- Videos in 720p-only uploads: nothing to improve.
- Bulk download from the app: story keys are de-duplicated per owner because one story key downloads all of that owner's current stories (section 4).
- Video quality Best uses Chrome's WebCodecs + bundled Mediabunny 1.61.1 (MPL-2.0, unmodified) [extension/lib/README.md].

### Refs
`extension/content.js:217-253,305-343`; `extension/instagram.js:95-188,245-264`; `extension/background.js:6,34-96,121-152`; `extension/offscreen.js:1-163`; `extension/video-join.js:1-122`; `extension/buttons.js:326-328,335-440,630-636,838,853-862`; `extension/panel.js:561-1036`; `extension/popup.html:90-131`; `extension/app/download.js:1-64`; `specs/2026-10-04-video-quality.md`; `specs/2026-10-28-download-card.md`; `README.md:38-63`; `CLAUDE.md` ("Downloads", "Videos (verified)", "offscreen.js", "video-join.js").

---

## 4. Download stories and highlights

### Where it works
```
Story viewer (path starts with /stories/)  [buttons.js:640-862]
├─ pill (shows when the pointer is over the story card): Download icon, title "Download all of these stories (D)"
├─ **D** key anywhere on the page (not while typing in a field; not with ⌘/Ctrl/Alt)  [:853-862]
├─ /stories/<user>/<id>/  -> downloads ALL current stories of that account [downloadStory(pk) -> InstaApi.storyReel(pk)]
├─ /stories/<user>/  (no id yet) -> id is read from the picture; if unreadable (a video) -> card "Couldn't tell which story this is"  [:845-850]
│     (ROADMAP.md:145 says "Download (D) is not affected" — code path needs an id; conflict, see end)
└─ /stories/highlights/<id>/ -> downloads the WHOLE highlight [downloadHighlight(id)]
Toolbar popup: Download icon when the tab is /stories/<user>/<id>/ (storyPk) -> same as above (all current stories). Not for highlights / id-less URLs.  [popup.js:399-401; content.js:212]
KeepKeep app (needs an Instagram tab)
├─ a saved normal story (Media): Download -> all current stories of that owner (one story key per owner in a bulk selection)  [download.js:27-40; content.js:182-185]
├─ a saved highlight story: Download -> just that story (suffix _highlight)  [content.js:183; tests/highlights.spec.js:108]
└─ Downloads view "Download again": always just that one story, ignoring the record (force)  [content.js:184; download.js:42-46]
```

### What it does
- Normal stories: asks Instagram for the story's info (gets the owner id) and then `reels_media` for the owner's whole current story reel; saves **all items, oldest first** — the code comment says "starting from the one on screen" but nothing slices the list (`storyReel`, `instagram.js:208-225`); photos and videos each as a file named `<username>_<YYMMDDHHmm of the story>_story.<ext>`; two in the same minute get `_2`, `_3` suffixes after `_story` [content.js:257,271-299]. If the owner's reel can't be read it falls back to the one story.
- Highlights: `reels_media?reel_ids=highlight:<id>` -> every story in the highlight in the viewer's order, named `<username>_<YYMMDDHHmm>_highlight[.ext]` [instagram.js:229-240; content.js:260].
- Video stories use the DASH 1080p path too when the item carries a manifest, with the same Video quality setting; photos use the largest listed size. Same download card, record and skip rules as section 3/8 (each story is recorded as a "post" with key `story:<id>`, type story/highlight) [content.js:271-299; background.js:100-115].
- Download does not mark stories as seen (info API calls only) — README.md:30 claim; no seen request in code.
- Failure texts: "Couldn't download these stories" / "Couldn't download this highlight" / "Couldn't download this story" [content.js:257,260,267].

### Settings
- Video quality (section 3); Skip downloaded before (section 8). Anonymous-story setting does not affect downloading.

### Limits / things to know
- Only stories the signed-in account can see; only stories **currently live** (24 h) for the "all stories" path; saved story links expire (inferred). Highlights persist as long as the owner keeps them.
- Highlight identification of the current story relies on picture id or progress-bar position (section 1); the pill "Download" for a highlight does not need that (it uses the highlight id from the URL) [buttons.js:745-755,845-848].
- Rate limits: `storyReel` makes two requests; many in a row can hit 429 (CLAUDE.md).
- Highlights in tests: `tests/highlights.spec.js` (demo pages only).

### Refs
`extension/content.js:177-188,255-299`; `extension/instagram.js:190-240`; `extension/buttons.js:640-862`; `extension/popup.js:399-401`; `extension/app/download.js:27-61`; `ROADMAP.md:93,145,167`; `README.md:28-30`; `CLAUDE.md` ("Stories", "Highlights").

---

## 5. Anonymous story viewing ("the veil")

### Where it works
```
Everywhere on instagram.com (setting is read by veil.js on every page, no path restriction)
├─ blocking the "story seen" request: stories-main.js wraps window.fetch and XMLHttpRequest on all pages (not only /stories/)  [stories-main.js:35-66]
├─ whole-page theme (purple tint) via CSS variables on <html>, light and dark mode  [veil.css:9-52]
├─ Stories tray (home) and any story rings: ring canvases (28-220 px, with an <img> sibling) tinted purple; tray-sized rings (60-110 px) get a mask badge  [veil.js:214-229; veil.css:57-71]
├─ capsule "Anonymous" (mask) top-right on every page EXCEPT /stories/*, /direct/*, /accounts/*; shifted left (right:140px) on /p/, /reel(s)/, /tv/ pages to clear Instagram's close button; click opens a sheet with "Turn off"  [veil.js:17-18,120-151]
Story viewer (/stories/…: /stories/<user>/<id>/, /stories/<user>/, /stories/highlights/<id>/)  [inStories() = pathname.startsWith('/stories/'), veil.js:17]
├─ status pill top-left: "Anonymous" + "@owner won't see you" (or "Hidden from viewers" if owner unknown)  [:156-168]
├─ stage behind the story turns deep purple, progress bars lilac (story itself untouched)  [veil.js:231-251; veil.css:73-80]
├─ heads-up bubbles: focusing the reply box -> "Replying shows @owner that you watched."; hovering a like/react/share button on the reply row -> "Reactions are visible to @owner."  [:170-209]
└─ "View as <you>? <owner> will be able to see that you viewed their story" gate (stories opened from a link): see What it does  [:266-387]
Browser toolbar: masked icon (icons/anon16-128.png) + tooltip "KeepKeep – watching stories anonymously" while on  [background.js:181-189]
Popup  [popup.html:9,20; popup.js:493-509]
├─ purple band at top "Watching stories anonymously" + **Turn off** button
├─ mask button in the header: toggles (tooltips "Watch stories anonymously" / "Stop watching stories anonymously")
└─ ⚙ Settings -> Stories -> "Watch stories anonymously" switch
App page: Settings -> Stories switch  [app/settings.js:86-90]; Welcome note "Anonymous stories are on."  [welcome.js:33-34]
```
Ways to reach the story viewer: home stories tray, a profile's picture ring, a highlight circle, a shared/direct link `/stories/<user>/<id>/` — these are Instagram's navigation; the code only looks at the pathname (inferred). Anonymous blocking does not depend on how the viewer was opened.

### What it does
- **Core:** when on, the one request that tells Instagram a story was seen is answered locally with a fake `{"data":{},"status":"ok"}` instead of being sent; the owner does not see you in the viewers list. Matches request URL or body against: `Stories\w*SeenMutation | StoryViewerSeen\w*Mutation | ReelSeen\w*Mutation | /stories/reel/seen | /api/v1/media/seen` (names Instagram has used) [stories-main.js:10-33]. Console line `[KeepKeep] story seen not sent: …`. Everything else passes untouched.
- Side effect (documented to the user): "Stories you watch stay unseen for you too" (the ring in your tray stays unwatched) and "Replies and likes are still visible" to the owner [popup.html:135-138; veil.js:145].
- **The veil** (visible like a private window): Instagram's blue -> KeepKeep purple (#8119B5; #AA56D5 in dark mode), white -> faint lilac; photos/videos never touched; a purple curtain sweeps down/up when switching (skipped with reduced-motion) [veil.css; veil.js:389-394,402-409].
- **Gate:** Instagram's "View as <you>? … will be able to see that you viewed their story". Detected by shape, not wording (round picture mid-page, a button under it, text naming the owner). Mode **on**: KeepKeep covers Instagram's text with "Watching anonymously — <owner> won't see that you viewed their story." in Instagram's own font sizes, adds a mask badge on the picture; Instagram's text hidden (`visibility:hidden`). Mode **off**: adds a **View anonymously** button under Instagram's button; click switches the mode on at once, stores it, and clicks Instagram's own button [veil.js:266-387; veil.css:82-84; README.md:36]. Works on highlights too (tests/highlights.spec.js:125).
- Toolbar icon swaps to the masked icon and tooltip while on; refreshed on startup/install/setting change [background.js:181-189].

### Settings
- `anonStories` (boolean). **Default: on for new installs only** — set to `true` in `onInstalled` when `details.reason === 'install'`; users who already had KeepKeep keep what they had (an unset value counts as off: every reader tests `=== true`) [background.js:191-201; CLAUDE.md]. Switches: popup header mask button, popup band "Turn off", popup ⚙ switch, app Settings switch, on-page capsule sheet "Turn off", gate button "View anonymously" (turns it on).
- Welcome tab text says "Anonymous stories are on." statically, also if reopened later from About with the mode off (inferred from static text, welcome.js:34).

### Limits / things to know
- Replies, reactions and likes are visible to the owner; KeepKeep only warns (heads-up bubbles).
- The request list is a set of known names/paths; if Instagram renames the request the blocking would stop working until updated (inferred from `stories-main.js:8-10` comment "Instagram has used these").
- Flag read at startup: `stories-main.js` reads `document.documentElement.dataset.keepkeepAnonStories` set by `veil.js` after a storage read (`veil.js:411`), so there is a short moment at page load before it is set (inferred; irrelevant unless a seen-request is sent in that moment).
- Applies only to the browser where it is turned on (Chrome, instagram.com), not the phone app.
- Veil CSS relies on Instagram's CSS variable names and class names (`__fb-light-mode`/`__fb-dark-mode`); if Instagram changes them the tint may degrade (inferred from veil.css header comment).
- Capsule hidden on /direct/ and /accounts/ pages.
- `prefers-reduced-motion`: curtain and animations off.

### Refs
`extension/stories-main.js:1-67`; `extension/veil.js:1-426`; `extension/veil.css:1-89`; `extension/background.js:179-201`; `extension/popup.js:481-509`; `extension/popup.html:9,20,132-139`; `extension/app/settings.js:86-90`; `README.md:32-36`; `ROADMAP.md:167-171`; `store/privacy-practices.md:49,119-121`.

---

## 6. Video controls

### Where it works
```
Any <video> element on instagram.com that is >=150x150 px and on screen, EXCEPT while the path starts with /stories/ (video.js:15,183-190)
├─ home feed videos, post page /p/<code>/ and /reel/<code>/, post window (modal), Reels viewer /reels/…   (README.md:67; ROADMAP.md:181)
├─ profile and Explore pages: any video big enough (inferred from the generic selector — e.g. autoplaying Explore tiles may get controls if >=150 px)
└─ Direct messages (inferred, generic selector)
NOT: story viewer (has its own progress bar/timing), tiny videos/previews (<150 px)
```
Overlay is hidden while another layer covers the video (e.g. a post window opened over a feed video) [video.js:202-216,318-321].

### What it does
- Always-visible thin **scrubber** along the bottom edge of every video: click or drag to any point; hover shows the time at that point; buffered and played parts (played part purple); thicker on hover; hidden if the duration is unknown (`no-seek`) [video.js:48-71,99-127].
- **Play/pause button** (round, 28 px by default) placed just left of Instagram's own mute button (found by position), vertically centred on it; title "Play / pause (Space or K)" [video.js:236-250,252-279].
- **Keyboard** (only for the video under the mouse; ignored with ⌘/Ctrl/Alt and while typing): **←** back 5 s, **→** forward 5 s, **Space** or **K** play/pause. Elsewhere those keys keep their Instagram meaning (arrows move between posts, Space scrolls) [video.js:14,333-352].
- Overlay is mounted inside the video's player (largest positioned ancestor about the video's size) so it scrolls with the post without lag; otherwise floats [video.js:132-159].
- Nothing else is added to Instagram's markup; Instagram's username/Follow/caption stay clickable [video.js:22-26].

### Settings
- None (no on/off switch; always on). (grep: no `videoControls` key anywhere.)

### Limits / things to know
- Mute-button lookup is by position; if Instagram changes its player the play/pause button falls back to 12 px from the video's right and bottom corner [video.js:241-242].
- Slow-motion speeds / A-B loop ("Learning mode") are only planned (ROADMAP.md:122-124).
- Floating mode: the play button hides while the video's bottom is below the viewport [video.js:245].
- Leftover overlays from a previous copy of the extension are removed on load [video.js:330].

### Refs
`extension/video.js:1-353`; `README.md:65-67`; `store/listing.md:70-72`; `ROADMAP.md:122-124,181-183`.

---

## 7. The KeepKeep app (full tab)

### Where it works
```
How to open it
├─ popup header: "Open KeepKeep" pill button -> app.html#media in a new tab  [popup.js:544-547; popup.html:19]
├─ popup ⚙ -> Backup -> Import -> app.html#settings  [popup.js:538-541]
├─ automatically: first install -> app.html#welcome ; after an update that has notes and is a minor/major step -> app.html#whats-new  (nothing else ever opens a tab)  [background.js:195-201; app/whats-new.js:29-33]
├─ About -> "Show the welcome again" / "What's new"  [settings.js:116]
└─ address chrome-extension://<id>/app.html#<view> (views: media (default), profiles, downloads, settings, about, welcome, whats-new; unknown hash -> media)  [core.js:29,80-93]
Layout  [app.html:11-17; core.js:67-78]
├─ left sidebar: logo + KeepKeep; nav order = **Media, Profiles, Downloads** (with counts); lists of the current kind (only on Media/Profiles); bottom: **Settings, About**
│   (CLAUDE.md says "Profiles and Media"; actual registration order is media, profiles, downloads — saved.js:443-444, downloads.js:127)
├─ ≤900 px wide: sidebar collapses to icons (64 px), lists hidden -> toolbar gets a "List" dropdown  [core.js:107-110; app.css:92-97,122]
└─ welcome / what's new: full-width, no sidebar  [core.js:87 `full`]
Views
├─ Media (#media)      grid of saved posts/reels/stories/highlights
├─ Profiles (#profiles) grid of saved profiles
├─ Downloads (#downloads) history of what KeepKeep downloaded
├─ Settings (#settings) Photo size, Video quality, Stories, Backup (export + import)
├─ About (#about)      version, privacy badges, links
├─ Welcome (#welcome)  first-run page
└─ What's new (#whats-new)
Side panel (slides in from the right) opens from a card in Media, Profiles or Downloads  [post-panel.js]
Light/dark follows the system (prefers-color-scheme, app.css:14,118); font Inter bundled.
```

### What it does
- **Live**: refreshes whenever storage changes (100 ms debounce), so saving on Instagram appears at once [core.js:112].
- **Media view** [saved.js]: cards with square preview, type badge (Post / Reel / Album / Video / Story / Highlight; plain `photo` type has no badge — `TYPE_LABELS` has no photo, saved.js:7), `@owner` (or "Owner not found"), relative date ("today", "3 days ago", "2 weeks ago", else "5 Oct"), list chips. Click opens the side panel; ⌘/Ctrl/Shift/Alt-click or middle click opens the Instagram link in a new tab (preview is a real `<a target=_blank>`) [saved.js:77-95,206-219]. 60 cards rendered per chunk as you scroll [saved.js:6,225-227]. Empty text "No saved media yet." / "Nothing matches these filters.".
- **Profiles view**: round picture (or initial), @username, name, "n media", date, list chips; click opens the side panel; ⌘/Ctrl/Shift-click or the link opens Instagram [saved.js:98-115].
- **Search** (live): Media - owner username, owner's full name, list names ("Search owner or list"); Profiles - username, name, list names ("Search name or list"). **No caption search yet** (planned, ROADMAP.md:110-112) [saved.js:33-38,141].
- **Filters** (shared between Media and Profiles views while the app stays open): Type (All types / Posts / Reels / Stories — "Stories" includes highlight stories; "Posts" = anything not reel/story; there is no separate Highlights option) [saved.js:39-46,143]; Owner (media only; all owners in alphabetical order) [saved.js:134]; List (sidebar, or dropdown when narrow); Date saved (Any time / Last 7 days / Last 30 days / This year); Sort (Newest first / Oldest first) [saved.js:146-147].
- **Selection:** tick box on each card (Shift-click for a range), ⌘/Ctrl-A selects everything shown, Esc clears; items leaving the filter or deleted elsewhere drop out of the selection [saved.js:195-204,241-243,368-387].
- **Bulk bar** (slides up from the bottom, "n selected"): **Add to list** (picker), **Remove from list** (only with a list selected), **Download** (Media only), **Remove** (danger; toast "Removed n · Undo", 6 s, successive removals add up), ✕ clear. Icons only on narrow windows [saved.js:263-356].
- **Drag to lists:** press and drag a card (6 px threshold; the whole selection if the card is selected; not touch) onto a sidebar list row; ghost "n items" [saved.js:393-440].
- **Download from the app:** needs an Instagram tab; sends `download-keys` to it; notice "Downloading n items in your Instagram tab" (8 s) or "Open Instagram in a tab to download" (+ link) or "Reload your Instagram tab, then try again" [app/download.js].
- **Side panel** [post-panel.js]:
  - *Media card:* owner, "Saved <date>", **View large (F)**, **Close (Esc)**, list chips (× to remove) + "Add to list" (searchable; create), buttons **Download**, **Open on Instagram**, **Remove** (with Undo). Body = Instagram's own embed of the post (`/p/<code>/embed/captioned/` in an iframe: all photos/videos + caption; spinner while loading). Posts whose owner's embed is refused (page contains `EmbedBrokenMedia`) show the saved picture + warning "Instagram doesn't allow this post to be shown here. Open it on Instagram to see it." Stories/highlights: saved picture + "Stories have no preview here. Open it on Instagram to watch it." [post-panel.js:84-99,178-216]
  - *Profile card:* picture, name, saved date, lists, **Open on Instagram**, **Remove**, grid "Saved from @user" (only media KeepKeep already has; no Instagram requests for the grid); clicking a tile opens that post with a "← @user" back button and ← / → steps through that profile's posts [post-panel.js:103-130]
  - *Downloads card:* "Downloaded <date> · n files", **Download again**, **Save to Media** / "In Media", Open on Instagram, View large (F) (not for stories) [post-panel.js:134-160]
  - Keys: **Esc** closes (or leaves large view), **F** toggles the large view (posts only), **← / →** (also ↑ / ↓) step through the grid in its order, **Backspace** goes back to the profile; clicking the open card again closes; click on the dimmed page closes; leaving the grid (Settings…) closes [post-panel.js:242-262,303-340].
  - Large view: same post over the whole page on a dark backdrop, with Download and Back (Esc) [post-panel.js:221-233].
- **Settings view** [settings.js:53-98]: Downloads note (+ link to Downloads view), Photo size, Video quality, Stories switch, Backup (Export button with status "Saved to Downloads/KeepKeep as KeepKeep-backup-YYYY-MM-DD.json"; "Import a backup": file picker or drop a file, result box).
- **About view** [settings.js:101-117]: logo, "KeepKeep" + version (from manifest), badges No password / No tracking / No ads, "Never asks for your password. Nothing leaves your computer.", links: Made by Zetasis (https://zetasis.net), ☕ Buy me a coffee (https://buymeacoffee.com/zetasis), Privacy policy (https://hakanoktay.github.io/keepkeep/privacy.html), Report a problem (https://github.com/hakanoktay/keepkeep/issues), "Show the welcome again", "What's new".
- **Welcome view** [welcome.js:24-43]: headline "Keep what you find on Instagram"; lead "Reels, Stories, Photos, Videos, Highlights and Posts: save them to your own lists, download them in full quality, and watch stories anonymously – right inside Instagram."; 3 steps (1 Open Instagram, 2 Use the purple buttons next to posts, reels, stories and profiles, 3 Find everything in KeepKeep — click its icon in the toolbar, pin it from the puzzle-piece menu); note "Anonymous stories are on…Switch it off any time in KeepKeep's popup."; buttons Open Instagram and Settings; privacy badges + line; Zetasis + coffee; "Go to KeepKeep →".
- **What's new view**: lists the version's notes; 1.1.0 notes: own page with search/filters/bulk actions; videos in up to 1080p; reorder lists by dragging; back up to one file and import on another computer; "Never asks for your password. Nothing leaves your computer." [whats-new.js:4-12,48-55]. Shown after an update only if that exact version has notes AND major or minor increased (patch-only, same, downgrade: no) [whats-new.js:21-26]. If opened by hand it shows the current version's notes or the newest entry [:40-46].
- **Downloads view**: section 8.

### Settings
In the app: Settings view (Photo size, Video quality, Stories) + the "Skip downloaded before" switch in the Downloads view. Same values as the popup; both write `chrome.storage.local`. See section 11.

### Limits / things to know
- Sidebar order/labels and the exact cards differ from the original design spec (specs/2026-10-02-keepkeep-app-page.md:46-47 says a click "opens the post on Instagram in a new tab" and hover actions; code: click opens the side panel, per-card hover actions are "later" — ROADMAP.md:106).
- Not built yet: caption search, moodboard, influencer shortlist, profile tabs/insights, per-card hover actions (ROADMAP.md:103-108,110-124).
- Side panel needs internet to show the embed (Instagram's page); the panel does a `fetch(embedUrl, {credentials:'omit'})` check per post per session [post-panel.js:178-187].
- The app page has no Instagram session of its own; all Instagram work is delegated to an Instagram tab.
- A "Highlights" filter does not exist (stories filter covers them).
- Welcome page text claims anonymous stories are on even if they were turned off (static).

### Refs
`extension/app.html`; `extension/app/core.js:28-124`; `extension/app/saved.js:1-446`; `extension/app/lists.js`; `extension/app/post-panel.js:1-341`; `extension/app/download.js`; `extension/app/downloads.js`; `extension/app/settings.js`; `extension/app/welcome.js`; `extension/app/whats-new.js`; `extension/popup.js:538-547`; `extension/background.js:191-201`; `specs/2026-10-02-keepkeep-app-page.md`; `ROADMAP.md:99-124`.

---

## 8. No duplicate downloads (the record, Skip switch, Download again, Downloads view)

### Where it works
```
Decision made in the service worker for EVERY download entry point (Instagram buttons, D key, popup icon, app bulk bar, side panel)  [background.js:34-83]
Download card (Instagram tab): skipped files shown as grey ✓ "Downloaded before · 12 Oct"; header "Already downloaded" (all skipped) or "Saved to Downloads/KeepKeep … · k downloaded before"; button **Download again** [panel.js:863-894, 950-958]
App
├─ Downloads view (#downloads): list of everything downloaded, toolbar: search owner, "Skip downloaded before" switch (+ "?" help card), "Good to know" button; title row: "n downloaded" + "Clear this list"
├─ Side panel of a Downloads card: Download again, Save to Media
└─ Sidebar nav "Downloads" with count
Settings -> Downloads note links to the Downloads view  [settings.js:77-78]
```

### What it does
- KeepKeep remembers each file it saved, by **Instagram's id of the photo/video** (pk; also each album item and story), not by file name: `{ id, top, at, dl, name }` in IndexedDB db `keepkeep` v2, store `downloaded` [downloads-db.js:1-47; spec :23-36]. Record written when Chrome reports the download **complete** [background.js:76,121-133].
- Before fetching, per file (with `skipDownloaded` not false and not `force`): no record -> download; record but lower quality than possible now -> download again; record but Chrome says the download failed/not complete or `exists:false` -> download; otherwise skip [background.js:143-152; spec table :38-45]. "Lower quality": `top:false` and (video with DASH and mode ≠ Standard, or photo that has an original-size address) — e.g. a video saved in Standard is re-downloaded when you later pick Best; the reverse is skipped [background.js:147-148; offscreen.js:65-67 for how `top` is set].
- Skipped files are not fetched, they count as done in the card; if anything was skipped the card ends with **Download again**, which saves just those files with `force` (card stays 9 s and while hovered) [panel.js:881-893; content.js:317-324].
- **Downloads view** [app/downloads.js]: each post/story with at least one file downloaded (since this version): small square picture (made at once because Instagram's addresses expire), @owner, date ("today"/"yesterday"/"5 Oct"), "N files" (stories: "Story" badge). Newest first; search by owner. IndexedDB store `posts`: `{ key, url, username, type(post/story/highlight), files, at, thumb }` written by the service worker after a download starts, then message `downloads-changed` refreshes the view [background.js:100-115].
  - **"Skip downloaded before"** switch (`skipDownloaded`, on unless `false`), "?" help: "KeepKeep remembers what it downloaded and doesn't save it again, so your folder gets no copies. "Download again" always saves it anyway." [downloads.js:97-105]
  - **"Clear this list"** -> "Clear KeepKeep's list? Your files stay." [Clear] [Cancel]: empties both stores; files stay on disk; nothing else touched [downloads.js:85-95; downloads-db.js:42-45]
  - **"Good to know"** card (opens by itself on the first visit only; remembered in the page's localStorage key `keepkeep.downloads.goodToKnow.seen`): (1) KeepKeep can't see your Downloads folder — a file you deleted/moved/renamed still counts as downloaded; use Download again; (2) only downloads from this version on are listed; (3) the list stays in this browser, not in Backup, not moved to another computer; clearing it or removing KeepKeep empties it, files stay; (4) a post removed from Instagram is gone and can't be downloaded again [downloads.js:58-64,107-112].
  - Side panel: **Download again** (through an Instagram tab, `force`, a story = just that story), **Save to Media** (from what the record knows; becomes disabled "In Media"), Open on Instagram, View large (F) [post-panel.js:134-160].

### Settings
- `skipDownloaded`: default **on** (only exactly `false` turns it off). Only place to change: Downloads view switch. Included in Backup export (but not applied on import, section 9). Not in the popup.

### Limits / things to know
- Chrome's `downloads` `exists` stays `true` after the user deletes the file (verified 2026-10-28), so a deleted file is still skipped; every skip says "Downloaded before", never "in your folder" [CLAUDE.md; spec :10-21,53-57].
- Record lives in IndexedDB of the extension (not `chrome.storage`), not in backups, not synced; losing it only means files are downloaded again [downloads-db.js:1-8].
- Earlier downloads (before this version) aren't listed; listing from Chrome's history was considered and dropped (spec :91-94).
- The record only holds files KeepKeep itself saved through its download path; backup files (`KeepKeep-backup-….json`) are not recorded.
- The "files" count on a Downloads card is the number of files of that post, counted when anything of it was downloaded in that run (`files.length` of the group, `background.js:104-111`; inferred it is not "files downloaded this time"). Re-downloading with every file skipped doesn't touch the record (`background.js:65`: returns before `recordPosts`).
- "Privacy" conflict: docs/privacy.html:69 says KeepKeep "keeps no record of what you downloaded" — no longer true (see section 10 / end).

### Refs
`extension/background.js:34-83,100-152`; `extension/downloads-db.js`; `extension/content.js:305-324`; `extension/offscreen.js:65-68`; `extension/panel.js:863-958`; `extension/app/downloads.js`; `extension/app/post-panel.js:134-160`; `specs/2026-10-28-no-duplicate-downloads.md`; `CLAUDE.md` (background.js / downloads-db.js / Chrome `exists`).

---

## 9. Backup and import

### Where it works
```
Export (button "Export")
├─ popup ⚙ -> Backup -> Export  [popup.js:526-536]
└─ app Settings -> Backup -> Export  [settings.js:55-62]
Import (file picker "Choose a backup file" or drop a file onto the box)
├─ app Settings -> "Import a backup" ONLY  [settings.js:64-70]
└─ popup ⚙ -> Backup -> Import just opens app.html#settings (a file picker in the popup could close the popup)  [popup.js:538-541, comment :524]
```

### What it does
- **Export:** one JSON file `KeepKeep-backup-YYYY-MM-DD.json` saved straight into `Downloads/KeepKeep` (no dialog; same-name -> "(1)" suffix). Status line "Saved to Downloads/KeepKeep as <name>" or "Export failed. Please try again." [basket.js:137-150].
- **Format** (`keepkeep-backup`, version 1) [basket.js:122-135]:
  `{ format: "keepkeep-backup", version: 1, app: "<extension version>", exportedAt: "<ISO time>", lists: [{id, name, kind: 'p'|'m'}…], items: { "p:<username>": {…}, "m:<key>": {…}, "u:<username>": {…} }, settings: { photoSize?, videoQuality?, anonStories?, skipDownloaded? (only those that are set) } }`.
  Contains: all saved profiles, media (incl. the preview images as data URLs, so files can be big), cached user details (name, picture), lists with their order, the four settings. Does NOT contain: the Downloads record (IndexedDB), the "Good to know" flag, the downloaded files themselves.
- **Import:** reads the file, checks `format === 'keepkeep-backup'`, a numeric `version`, an `items` object; a version newer than 1 is refused. **Only adds, never deletes or replaces** [basket.js:168-221]:
  - lists matched by **kind + name** (case-insensitive, trimmed): existing list reused, otherwise created (new id if the id is taken) -> importing twice adds nothing twice
  - a profile/post that is already here keeps its own data and gets the backup's lists added (union); counted as "already here"
  - new profiles/posts are added with their lists mapped to local list ids
  - `u:` records: local values win, missing fields filled in
  - this computer's **settings stay as they are** (the backup's settings are carried in the file but not applied)
  - old backups from before lists had a kind are split like old storage (`splitUpdate`)
- Result messages (`describeImport`, basket.js:154-166): "Added 42 profiles, 5 posts and 3 lists." + "Open KeepKeep from the toolbar to see them." or "N items were already here; their lists were combined."; "Everything in this backup was already here."; errors "This backup was made by a newer KeepKeep." / "This file isn't a KeepKeep backup." / "The import failed." each with "Nothing was changed."
- Importing needs no Instagram tab.

### Settings
- None specific. Export carries `photoSize`, `videoQuality`, `anonStories`, `skipDownloaded`; import ignores them.

### Limits / things to know
- Moves saved items and lists between computers; not the Downloads history or files. Settings are not carried over by import.
- Import is a merge, so it can't be used to restore a "clean" state or delete things.
- Backup file includes saved usernames and preview images in plain JSON on the user's disk.
- ROADMAP.md:41 says export includes "preview images" and "lists with their order": yes (data URLs inside records; order = array order). Sync between computers is not built (ROADMAP.md:43).
- `BACKUP_VERSION` must be bumped and old versions kept readable if the format changes (CLAUDE.md).
- Tests: tests/backup.spec.js, tests/app-settings.spec.js.

### Refs
`extension/basket.js:118-221`; `extension/popup.js:524-541`; `extension/app/settings.js:35-70,91-96`; `ROADMAP.md:35-43`; `CLAUDE.md` (settings.js row, "Never lose users' data").

---

## 10. Private by design

### Where it works
Everywhere (a property of the whole extension). Where the message is shown: manifest `description` (`extension/manifest.json:6`: "Save posts to your lists, download in full quality, watch stories anonymously. No password. Your data never leaves your computer."), store listing top lines and "PRIVATE BY DESIGN" block (`store/listing.md:37-49`), welcome view + About + popup About (badges "No password / No tracking / No ads" and "Never asks for your password. Nothing leaves your computer."), What's new, store images (`ROADMAP.md:19`), website, privacy policy.
Exact phrasing rules (CLAUDE.md): "Never asks for your password. Your data never leaves your computer." in summary; badge line "Never asks for your password. Nothing leaves your computer." in UI; **never claim "collects no data"** (store panel lists Website content).

### What it does (what is stored where)
```
chrome.storage.local (extension storage, in the user's Chrome profile; not sync)  [permissions: storage, unlimitedStorage]
├─ p:<username>   saved profile {username, addedAt, lists}
├─ m:<key>        saved media {key, code, url, type, username, thumb(240px JPEG data URL), addedAt, lists, triedAt, expiresAt?, highlightId?}
├─ u:<username>   cached account {username, fullName, pic(96px JPEG data URL), triedAt}
├─ lists          [{id, name, kind}]
└─ photoSize, videoQuality, anonStories, skipDownloaded   (settings)
IndexedDB `keepkeep` (extension origin): `downloaded` {id, top, at, dl, name} and `posts` {key, url, username, type, files, at, thumb}  — the download record (downloads-db.js)
localStorage of the app page: `keepkeep.downloads.goodToKnow.seen` (a "seen" flag)
Transient: blob URLs in the offscreen document while downloading (revoked after the file is written) (background.js:121-133)
Files: Downloads/KeepKeep/ (downloaded media and backup JSON files)
Legacy: basket.clear() would also remove an old key 'basket' (basket.js:361); no UI calls clear() (grep)
```
What is sent, and to whom (all from the user's own browser; user's own Instagram session):
```
instagram.com (content script on instagram pages, credentials: include)
├─ /api/v1/media/<id>/info/ (post, story), /api/v1/feed/reels_media/ (stories, highlights), /api/v1/users/web_profile_info/ (profile name+picture)
├─ the post/profile HTML page (og: tags fallback), /p/<code>/embed/captioned/ (original-size photos)
cdninstagram.com / fbcdn.net (service worker + offscreen document)
├─ preview images (thumbnails), photos/videos to download; only https hosts matching the allow-list are fetched (background.js:6,35-50,154-160)
App page -> side panel opens Instagram's embed page /p/<code>/embed/captioned/ in an iframe and runs a fetch (credentials omit) of the same URL — i.e. an extension page itself contacts instagram.com  (post-panel.js:29,178-187,211)
Nothing else: no fetch/XHR/beacon to any other host in the extension code (grep: only instagram.js, background.js, offscreen.js, post-panel.js fetch); no analytics/ads/accounts; no remote code, no eval (store/privacy-practices.md:58-64; grep shows no eval/new Function in extension JS; Mediabunny bundled, unmodified).
Links that only open when the user clicks them: zetasis.net, buymeacoffee.com/zetasis, hakanoktay.github.io/keepkeep/privacy.html, github.com/hakanoktay/keepkeep/issues.
Fonts: Inter bundled (extension/fonts/inter.woff2).
```
- Stories: the only request KeepKeep alters is Instagram's "story seen" call, only if the user turned anonymous mode on (privacy-practices.md:119-121).
- Never asks for the Instagram username/password; works in the signed-in tab (listing.md:46).
- Pointer and a few keys are watched only to show buttons/shortcuts (D, 1-9, ←/→, Space/K); nothing recorded or sent (privacy-practices.md:80-82).
- Removing: any saved item from popup/app/button; lists; uninstalling removes everything (privacy.html:86-89). Clear the Downloads list in the Downloads view.
- Permission reasons (privacy.html:78-85; privacy-practices.md:18-54): storage, unlimitedStorage (previews exceed 10 MB with a few hundred items), downloads, offscreen (fetch + progress + join), instagram.com (buttons, lookups), cdninstagram.com/fbcdn.net (media + previews).
- Privacy policy URL: https://hakanoktay.github.io/keepkeep/privacy.html (effective 30 September 2026). Contact = GitHub Issues (owner's email must never appear in public files, CLAUDE.md).
- Chrome Web Store data usage: only "Website content" ticked (local); three certifications ticked.

### Settings
None (no analytics/telemetry switches exist).

### Limits / things to know
- **Policy is out of date for 1.1.0** (docs/privacy.html "Effective 30 September 2026"): line 69 says "KeepKeep ... keeps no record of what you downloaded" — the Downloads record (IndexedDB: file ids, owner names, thumbnails, dates) now exists; line 59-60 lists settings as "photo quality and anonymous"; no mention of the app page's embed iframe to instagram.com; no mention of video conversion/offscreen join (only "prepares the files"). store/README.md:49-50 says to update privacy.html and the Privacy tab before submitting a version that handles data differently. (This is a to-do for release, not a fact about users.)
- "Nothing leaves your computer" is literally true of KeepKeep's own data; requests to Instagram/its CDN naturally go to Instagram's servers with the user's cookies, and the embed iframe is Instagram's page (inferred).
- Backup files are plain JSON on disk (section 9).
- Trademark/ownership notes: "not affiliated with Instagram or Meta"; "Instagram" only as "… for Instagram" at the end of the name; no Instagram logo (CLAUDE.md; listing.md:77).
- Contact for docs: GitHub Issues only.

### Refs
`extension/manifest.json:6,13-23`; `extension/basket.js:3-14`; `extension/downloads-db.js`; `extension/background.js:6,35-50,121-133,154-177`; `extension/instagram.js:11-23,99-120`; `extension/app/post-panel.js:29,178-187,211`; `docs/privacy.html` (text lines 49-98 after stripping markup); `store/privacy-practices.md:1-123`; `store/listing.md:37-77`; `ROADMAP.md:7-24`; `CLAUDE.md` ("privacy message", "Never put the owner's email…").

---

## 11. Settings — every setting, options and default

| Setting (storage key) | Options | Default | Where to change | Effect | Refs |
| --- | --- | --- | --- | --- | --- |
| Photo size (`photoSize`) | **Original** ("as uploaded, up to 3072 px wide. Sharpest, larger files (often 1–3 MB)") / **Standard** ("largest size Instagram shows, up to 1080 px wide. Smaller files (a few hundred KB)") | Original (anything other than `standard` = original) | Popup ⚙ -> Photo size; App -> Settings -> Photo size | `content.js:229-230` passes `originals: photoSize !== 'standard'` | `popup.html:93-108`; `popup.js:484-486,510-512`; `app/settings.js:23,79-81` |
| Video quality (`videoQuality`) | **Standard (recommended)** (up to 720p, H.264 MP4, Instagram's single file, instant) / **Original** (up to 1080p, VP9 MP4 as Instagram stores it; instant, smaller; QuickTime, Photos, iMovie, iPhone can't open it) / **Best** (up to 1080p, H.264 MP4, opens everywhere, a few seconds longer) | Best (missing or unknown value = best) | Popup ⚙ -> Video quality; App -> Settings -> Video quality | `videoMode()` content.js:329-331; join logic section 3 | `popup.html:109-131`; `popup.js:487-489,513-515`; `app/settings.js:24,82-85` |
| Watch stories anonymously (`anonStories`) | on / off | **On for new installs** (set at install); unchanged for users who already had KeepKeep (unset = off) | Popup header mask button; popup band "Turn off"; popup ⚙ -> Stories; App -> Settings -> Stories; on-page capsule sheet "Turn off"; gate "View anonymously" button (turns on) | blocks the "story seen" request + the veil (section 5) | `background.js:195-197`; `popup.js:492-509`; `app/settings.js:86-90`; `veil.js:149,372-378` |
| Skip files downloaded before (`skipDownloaded`) | on / off | On (only `false` turns it off) | App -> Downloads view only (switch in toolbar) | `background.js:55-56` | `app/downloads.js:99-100` |
| Backup (Export / Import) | actions, not settings | — | Popup ⚙ (Export; Import opens app Settings); App Settings | section 9 | |

Notes:
- Settings live in `chrome.storage.local`; popup and app both write it and each re-reads on change (`app/settings.js:119`, `popup.js:518`). Export carries all four keys; import does not apply them (`basket.js:124,177-221`).
- No settings exist for: video controls, buttons on/off, D key, download folder, file naming, theme (follows system), language (English only), notifications.
- Popup ⚙ also shows "Downloads" hint ("Photos and videos are saved to Downloads/KeepKeep, each as its own file.") and About (version, badges, links).
- Popup settings pane slides in from the right via ⚙; Esc or back arrow returns (`popup.js:467-479`).
- Upgrade rule: stored formats must stay readable; `videoQuality` missing = best so existing users get 1080p after updating (`specs/2026-10-04-video-quality.md:38-41`).

---

## Cross-checks, conflicts and open points (for the writer)

1. **Version:** manifest is 1.0.0; everything here is the 1.1.0 branch, unreleased. Documentation must either say "1.1.0" or be held back (CLAUDE.md "Release timing").
2. **Stall watchdog:** code `JOIN_STALL_MS = 25_000` (offscreen.js:8) vs CLAUDE.md "60 s no-progress watchdog". Code wins; fix CLAUDE.md or ignore the number in docs.
3. **Privacy policy stale:** docs/privacy.html:69 "keeps no record of what you downloaded" is no longer true (IndexedDB download record). Also no mention of the side-panel embed. Must be fixed before release; docs should not repeat that sentence.
4. **ROADMAP.md:145** says Download (D) is unaffected for the first video story; `currentStory()` returns `key:null` for `/stories/<user>/` without a readable picture id, and `downloadCurrentStory`/D require `key` (buttons.js:845-862) -> shows "Couldn't tell which story this is" (or D does nothing). Needs a real-site check before documenting.
5. **Story download scope:** comment says "starting from the one on screen" (content.js:255) but `storyReel` returns every current item sorted oldest-first. Docs: "all of the account's current stories".
6. **D key:** works over posts (action-bar posts only) and in the story viewer; there is no D handler for the Reels viewer's column (inferred from code, not tried).
7. **UI text oddity:** both Standard and Best are labelled "(recommended)" in the popup and app Settings; default is Best.
8. **Nav order:** app sidebar shows Media, Profiles, Downloads (CLAUDE.md lists "Profiles and Media").
9. **Type filter:** "Stories" includes highlights; plain `photo` posts get no type badge in the app (TYPE_LABELS lacks `photo`), the popup labels them "Photo".
10. **Spec drift:** specs/2026-10-02-keepkeep-app-page.md says card click opens Instagram in a new tab; code opens the side panel. README.md's "Media groups under owner / + Profile on a media group" (README.md:80) describes an older popup; the popup now shows a card grid with a per-card profile toggle.
11. **`expiresAt`** is stored for stories but nothing shows it ("Story · 18h left" is only a plan, ROADMAP.md:94).
12. **Where on real Instagram:** tests use demo pages; real-site coverage of e.g. Explore, hashtag/location pages, DMs, and `/reel/<code>/` single pages is code-derived (buttons attach by date links / tile links / `/reels/` path), not verified. Verified-on-real-site facts are only those marked "verified" in CLAUDE.md (original photos via embed, stories/highlights endpoints, album dots, 1080p DASH, refused embeds, Chrome `exists`).
13. **Welcome text** "Anonymous stories are on." is static.
14. **Rate limits:** Instagram returned 429 for `web_profile_info` and `/users/<id>/info/` (2026-10-04); profile enrichment uses `web_profile_info` first with page-meta fallback (instagram.js:51-62), so a saved profile may miss name/HD picture.
15. **Files in `documentation/`:** `01-save.md` and `README.md` already exist next to `_sources/` (not touched by this inventory).

# Private and secure by design

KeepKeep sees what you do on Instagram, so it has to deserve your trust. We
are strict about privacy and security in every part of it: what it stores,
what it sends, what it may touch, and how it is built and tested.

**Never asks for your password. Your data never leaves your computer.**

No password · No tracking · No ads

## Your password stays yours

- KeepKeep **never asks for your Instagram password** and has **no account**
  to sign up for.
- It works inside the Instagram tab you are already signed in to, the same
  way you use Instagram yourself.

## Your data stays on your computer

Everything KeepKeep keeps is stored in your own Chrome profile, on your
computer. It is not synced, not uploaded and not shared.

| What | Where |
| --- | --- |
| Profiles and posts you save: link, account, name, small preview pictures, when you saved them | Chrome's storage for KeepKeep, in your Chrome profile |
| Your lists and settings | the same |
| The list of what KeepKeep downloaded | the same browser, kept apart from your saved items |
| The photos and videos you download, and backup files | your `Downloads/KeepKeep` folder |

- **KeepKeep has no servers.** Its developer never receives your data,
  because there is nowhere for it to go.
- A backup exists only when you make one, as a file on your computer.
- **Removing KeepKeep removes everything it stored** in Chrome. Your
  downloaded files stay in your folder.

## It talks only to Instagram

KeepKeep connects only to Instagram: instagram.com and Instagram's media
servers. It does so from your browser, with your own Instagram session, and
only to do what you asked:

- to look up the post, reel, story or profile you act on;
- to make the small preview pictures of what you save;
- to fetch the photos and videos you download.

These are the same kinds of requests Instagram's own website makes. KeepKeep
sends nothing to its developer or to anyone else.

When the KeepKeep app checks whether Instagram allows a post to be shown in
the side panel, it asks **without** your Instagram sign-in.

## Nothing hidden

- **No analytics, no tracking, no cookies of its own, no ads.**
- **No code from the internet.** Everything KeepKeep runs ships inside the
  extension, including the video converter and the font.
- **Only on Instagram.** KeepKeep doesn't run on any other website.
- **Anonymous story viewing changes exactly one thing**: the message that
  tells Instagram you saw a story. It doesn't read, store or change anything
  else.
- The code is public on GitHub, so anyone can check what it does.

## The fewest permissions

KeepKeep asks Chrome only for what it needs to work:

| Permission | Why |
| --- | --- |
| Storage | Keeps your saved profiles and posts, your lists and your settings in your browser. |
| Unlimited storage | The preview pictures of a few hundred saved items need more than Chrome's standard 10 MB. |
| Downloads | Saves photos, videos and backups into `Downloads/KeepKeep`. |
| Offscreen | Fetches files in the background with progress, and joins a video's 1080p picture and sound. |
| instagram.com | Adds KeepKeep's buttons and looks up the posts you act on. |
| cdninstagram.com, fbcdn.net | Instagram's media servers: the previews and the files you download. |

KeepKeep has no access to other websites, your browsing history or your
files.

## Careful by construction

- **Downloads come only from Instagram's media servers**, over a secure
  connection. Anything that isn't a photo, video or sound file, such as an
  error page, is refused and never saved.
- **Updates never lose your data.** When KeepKeep changes how it stores
  things, it carries your existing data over; every release is tested
  against the data of the first version.
- **Every fix gets an automated test** so it stays fixed; more than 180 of
  them run before each release.

## Always your choice

- Remove any saved profile or post, any list, at any time.
- Clear KeepKeep's list of downloads whenever you like; your files stay.
- Turn anonymous story viewing on or off in one click.
- Uninstall KeepKeep and everything it stored is gone.

## More

- [Privacy policy](https://hakanoktay.github.io/keepkeep/privacy.html)
- Questions or problems: [GitHub Issues](https://github.com/hakanoktay/keepkeep/issues)

KeepKeep is not made by, or affiliated with, Instagram or Meta.

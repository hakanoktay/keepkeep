# Backup and import

Everything you saved, in one file: keep it safe, or move it to another
computer.

## Where it works

```
Backup and import
│
├── Export
│   ├── KeepKeep's toolbar icon → Settings → Backup
│   └── The KeepKeep app → Settings → Backup
└── Import
    └── The KeepKeep app → Settings → Backup
        (choose the file, or drop it on the page)
```

The toolbar icon's Import button opens this page.

## What happens

- **Export** saves one file, `KeepKeep-backup-<date>.json`, straight into
  `Downloads/KeepKeep`.
- **Import only adds, never deletes.** New profiles, posts and lists are
  added. Something you already have keeps what it has, and gains the lists
  it has in the backup. Lists with the same name are joined, so importing the
  same file twice doubles nothing.
- **Your settings are yours to choose.** If the backup's settings differ from
  this computer's, KeepKeep shows them side by side ("Video quality: Standard
  (here: Best)"): **Use the backup's** or **Keep mine**. Nothing changes until
  you pick.
- **Everything in the file is checked.** Only KeepKeep's own kinds of data are
  taken; anything else, or anything that would load something from the
  internet, is left out, and KeepKeep tells you how many items it left out.
  If the file isn't a KeepKeep backup, nothing is changed.

## What's in a backup

| In it | Not in it |
| --- | --- |
| Your saved profiles and posts, with their previews | The photos and videos you downloaded |
| Your lists, in their order | The Downloads list |
| Your settings | |

## Good to know

- The file is yours: it is saved on your computer and goes nowhere else.
- A backup made by a newer KeepKeep needs that version to import it.

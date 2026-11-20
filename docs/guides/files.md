# The Files app

Browse the box's folders, USB drives and SD cards from the controller: open pictures, videos and songs, and copy or move files between them.

## Opening Files

**Files** is a tile in the **Apps** tab. Pick it and press **A**.

To keep it handy, pick the tile and press **Y**: it goes on Home, under **Favorite Apps**. **Y** again takes it off.

## Finding your way around

Files fills the screen. Down the left are the places to start from:

- Your home folders: **Downloads**, **Desktop**, **Pictures**, **Videos**, **Music** and **Documents** (those that exist), then **Home** for everything in your home folder.
- Each USB drive or SD card plugged in, by its name.

As you move down the places, the right side shows what's in each. Press **A** (or right) to step into the list.

- **A** on a folder opens it. Folders come first, then files, in name order. Each file shows its kind, size and date.
- **B** goes back up a folder. At the top, it goes back to the places on the left, and from there closes Files.
- **L1 / R1** jump a page up or down a long list.

The top of the right side shows the folder's name, where it is, and how many items it holds. Hidden files (those whose names start with a dot) are left out.

## Open, Cut and Copy

Press **A** on a file and three buttons appear under it:

| Button | What it does |
|---|---|
| **Open** | Shows the picture, or plays the video or song, full screen |
| **Cut** | Picks it up to move somewhere else |
| **Copy** | Picks up a copy to put somewhere else |

**B** (or **A** on the file again) puts them away.

## Pasting

Once you've cut or copied a file, a **Paste here** row sits at the top of every folder you open, with the file's name beside it.

1. Go to the folder you want it in. It can be on another drive.
2. Choose **Paste here**.

It says **Copying…** or **Moving…** with how far it's got, then the file appears in the folder with the cursor on it.

- A copy can be pasted again, somewhere else. Something cut moves once, and is gone from where it was.
- Nothing is ever written over. If the folder already has a file of that name, the new one is called `Name (2)`.
- If a copy fails part way (say, the drive is pulled out), it leaves nothing half-written behind.
- **Cancel**, beside **Paste here**, puts the file down without pasting it.

What you've cut or copied is kept if you close Files and open it again.

> **Tip:** to put photos from an SD card on the box, copy them into a folder in **Pictures**. To see them in the screensaver, use `~/Pictures/Screensaver` (see [Making it yours](look-and-feel.md)).

## Pictures

**Open** on a picture shows it full screen. **Left / right** on the D-pad, or **L1 / R1**, show the folder's other files. The bar at the bottom says which one of how many you're on.

## Videos and songs

**Open** on a video or song plays it full screen.

| Button | What it does |
|---|---|
| **A** | Play / pause |
| **D-pad left / right** | 10 seconds back / on |
| **L1 / R1** | Previous / next file in the folder |
| **D-pad down** | The buttons under the bar: Previous, back 10 seconds, play/pause, on 10 seconds, Next, Controller shortcuts |
| **B** | Back to the folder |

The bar fades away while something plays; any press brings it back. **Controller shortcuts** shows this list with your own controller's buttons.

While a video or song plays, the background music waits, and the screensaver stays off. Opening a game or app pauses it. Clicking both sticks in turns its sound off, as it does the music's.

## What it can open

| Kind | Files |
|---|---|
| Pictures | JPG, PNG, WebP, GIF, AVIF |
| Videos | MP4, WebM, MKV, MOV, M4V |
| Songs | MP3, OGG, FLAC, WAV, M4A, AAC, Opus |

Other files are listed, and can be cut, copied and pasted, but not opened: **Open** shows just the file's name, kind, size and date.

## Where it can go

Files reaches your home folder (everything in it) and drives mounted under `/run/media` or `/media`, which is where USB drives and SD cards appear. It can't open the box's system folders.

## If something's wrong

- **Your USB drive or SD card isn't in the list:** make sure it's plugged in and the box has mounted it. In Game Mode, SteamOS usually does this by itself; close Files and open it again to read the list afresh.
- **"That folder is outside home and the drives":** Files only goes into your home folder and plugged-in drives.
- **A paste failed:** the drive may be full, read-only, or have been pulled out. Nothing half-copied is left behind; try again.
- **A video won't play:** Files plays what the TV's own player can. For films from a media server, use the Video tab instead (see [The Video tab](video.md)).
- **No sound:** check you haven't clicked both sticks in, which turns vaporTV's sound off. Click them again.

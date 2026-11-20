# The Music tab

Play your own music on the TV, from this box, USB drives, a computer or NAS at home, or your media server, and have it playing quietly behind the menus while you browse.

## How it works

vaporTV reads the tags in your songs (title, artist, album, year, genre and cover) and builds one library from everywhere your music is. You don't have to sort anything into folders: an album is whatever the tags say it is.

The library looks for new music when the Music tab opens, and every so often. Two albums come with vaporTV, so it's never empty: **Ambient** by Chris Zabriskie and **Retro**, a set of chiptunes.

## 1. Add your music

Choose **+ Add music** at the bottom of the Music tab's list, or open **Settings → Music & sounds**. Both are the same screen.

| Where | How |
|---|---|
| **Music on this TV** | Songs in `~/Music`. Choose **Copy songs or albums to this TV** to copy a song or a whole folder from a USB drive, SD card or folder. Copied songs stay when the drive is unplugged |
| **Send from your phone** | Scan the code with your phone's camera (on the same Wi-Fi), then pick songs. They land in `~/Music/From your phone` |
| **Drives** | Plug in a USB drive or SD card. It's played from the drive while it's plugged in |
| **Network shares** | Music on another computer or a NAS. See below |
| **Your media server** | The music libraries on your Emby or Jellyfin server, once you've signed in under **Settings → General → Connect your media library** |

Each drive, share and server has a switch, so you can leave one out of your library. Folders that belong to games and emulators (such as `roms`, `emulation`, `steamapps` or `retroarch`) are skipped, so a game drive's sound effects don't turn up as music.

**Look for new music now** reads every source again straight away.

### Adding a network share

1. In **+ Add music**, choose **Add a network share**.
2. Type the **Computer** (its name or address, like `192.168.1.12`), then the **Username** and **Password** you sign in to it with.
3. Choose **Find its shares**. The first time, vaporTV downloads its share helper (rclone, about 20 MB).
4. Pick the share with your music in it.

The sign-in is kept on the TV, readable only by vaporTV. The share is connected again each time vaporTV starts. To take it away, choose **Remove** *share* **on** *computer* under Network shares (press twice).

## The Music tab

The list down the left (**L2** hides it) has:

| List | What's in it |
|---|---|
| **Recently played** | Albums you've played on this TV, newest first |
| **Favorites** | **Liked songs**, then your favourite albums |
| **Playlists** | Your playlists, and playlist files found in your music |
| **Albums** | Every album in your library |
| **Artists** | Each artist, opening on their albums |
| **Folders** | Your music places as folders, to browse as they are on disk |
| **+ Add music** | Where your music comes from (see above) |

- **Sort** orders albums by **Recently played**, **Recently added**, **Alphabetical**, **Artist** or **Release year**.
- **Genre** narrows albums and artists to one genre, read from the songs' tags.

## An album's page

**A** on an album opens its page: the cover, the songs, and these buttons:

- **Play all** and **Shuffle**.
- **Favorite** stars the album.
- **+ Playlist** puts the whole album in a playlist.
- **Set as background music** plays it quietly behind the menus (see **Background music**).

**A** on a song plays the album from there. **Start** on a song opens its menu: **Add to Liked songs**, **Add to playlist…**, **Thumbs down** and, with Claude, **Start radio**.

## Now playing

Playing anything opens **Now playing**: the album cover floating over the backdrop, glowing in its own colours and moving with the beat.

| Button | What it does |
|---|---|
| **A** | Play / pause |
| **D-pad left / right** | 10 seconds back / on |
| **D-pad down** | The buttons: Stop, Previous, back 10 seconds, play/pause, on 10 seconds, Next, Shuffle, Repeat, the heart, thumbs down, radio and Controller shortcuts |
| **L1 / R1** | The song before / after |
| **L2 / R2** | 10 seconds back / on |
| **Y** | Like the song (or unlike it) |
| **B** | Back to browsing. The music carries on |

## Favourites

- **Y** on an album makes it a favourite (a star shows). **Y** on a song, or in Now playing, likes it (a heart shows).
- Liked songs gather in **Liked songs**, at the top of **Favorites**.
- Once you've liked something, a **Music** row appears on **Home** with Liked songs, your favourite albums and any playlists you've put there. **A** plays one straight away.

## Playlists

Ways to make one:

- **Add to playlist…** from a song's menu, or **+ Playlist** on an album. Choose **New playlist** or one you have.
- **Save as playlist** from a radio station's list.
- Ask Claude out loud: "make me a playlist of late-night city pop". Claude picks the songs, names it and plays it.

On a playlist's page you'll find **Rename** (say the new name or type it), **Show on Home**, **Set as background music**, **Save as a playlist file** (it goes in `~/Music/Playlists`, for other music players) and **Delete** (press twice). On a song, **Start** offers **Move in this playlist** (up and down to move it, **A** to put it down) and **Remove from this playlist**.

Playlists Claude made, and saved stations, also have **Keep it fresh**: Claude makes them again once a day.

`.m3u` playlist files already in your music show up too, even ones made on another computer. They can't be changed from vaporTV, but **Make a copy** gives you one that can.

## Radio and asking for music

These need **Claude Code** set up on the box, and some music of your own (the included albums aren't enough). See [Claude on vaporTV](claude.md).

- **Radio:** choose **Start radio** from a song's menu, or the radio button in Now playing. Claude picks songs from your library that sound like it. Press the radio button again to see the station's songs.
- **Thumbs down** skips a song and keeps it off stations for good. New stations also take into account what you've liked.
- **Ask for music:** on the Music tab, press **R3** (or **Menu** on a TV remote) and say what you want, like "play all my vintage Japanese music". Claude plays, shuffles or shows the albums it picks. Without Claude, vaporTV just searches the names.

## Background music

**Settings → Music & sounds → Background music** chooses what plays quietly while you browse:

- **None**
- **Shuffle my library**: every song, in random order
- **Liked songs**, shuffled
- **A station from your likes**: Claude picks songs like one you liked, new each day
- Any playlist, including **Ambient** and **Retro**

Any album or playlist on the Music tab can also be **Set as background music**.

It pauses during games, and steps aside when you play something on the Music tab, coming back when that ends. Songs are evened out in loudness, so a loud one doesn't jump out. Under the music, **Ambience** adds sounds of a place, like rain or ocean waves. **Music volume** and **Ambience volume** are set further down.

## The now-playing bar

As each song starts, a row drops down under the top bar for a few seconds with what's playing and how far in it is. Press **Down** from the top bar to bring it back. Its buttons sit in a small pill:

- **Previous** and **Next**
- **Stop** (or **Play**), only for music you're playing from the Music tab. Background music can go back and on, but not stop.

**Settings → Music & sounds → Now playing bar** chooses **Shows as each song starts**, **Always open** or **Never**.

## Controller shortcuts

| Button | What it does |
|---|---|
| **L3** (click the left stick) | Next song, for whatever you're hearing |
| **Both sticks** | vaporTV's sound off, then on again |
| **R3** on the Music tab | Ask for music |

Change them in **Settings → Controller**.

## If something's wrong

- **Songs are missing:** check the drive or share is switched on in **+ Add music**, then choose **Look for new music now**. Songs inside folders named after games or emulators are skipped on purpose.
- **An album is split in two, or has the wrong name:** the songs' tags differ. Fix the tags on a computer, then look for new music.
- **A share won't connect:** check the computer is on and its name or address is right. Use the account you sign in to it with. If a share says it **can't reach it now**, the computer may be asleep.
- **Your phone can't open the code's page:** the phone must be on the same Wi-Fi as the TV.
- **No radio button, or nothing happens when you ask for music:** that needs Claude Code on the box. See [Claude on vaporTV](claude.md).
- **No sound at all:** you may have clicked both sticks. Do it again.

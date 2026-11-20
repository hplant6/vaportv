# Privacy

What vaporTV sends over the internet, what it keeps on the box, and how to clear it. In short: vaporTV has no account, no analytics and no tracking. It only goes online for something you'd see on screen, or something you switched on.

## What goes where

| What | Where it goes | What it sends |
| --- | --- | --- |
| Weather, sunrise and sunset | Open-Meteo | The place the weather is for, as map coordinates |
| Your location, if you haven't chosen one | ipwho.is | Your internet address, which it turns into a rough location (usually your town) |
| Choosing a place in Settings | Open-Meteo | The name you type |
| Game art | SteamGridDB, the libretro thumbnail library, and Brave or DuckDuckGo image search when you search for art | The game's name, plus your API key for SteamGridDB or Brave if you added one |
| Updates | GitHub | A check for a newer release; GitHub sees your internet address, as any website does |
| Voice search | Hugging Face, once | The speech model downloads the first time. What you say is turned into words on the box. Without Claude Code, those words go nowhere |
| Voice search, with Claude Code | Anthropic, through Claude Code | The words voice search heard, and the names of your games and apps (with their console, or "app") |
| The Claude app | Anthropic, through Claude Code | What you say, as words, and whatever Claude reads or runs on the box to answer: files, logs, the output of commands. Its web searches go through Anthropic too |
| The Claude app's voice | GitHub, once | The Kokoro voice downloads the first time Claude speaks. Replies are spoken on the box |
| Music with Claude: asking for music, radio, playlists Claude makes, **Keep it fresh**, **A station from your likes** | Anthropic, through Claude Code | The albums in your music library (artist, album, year and genre, up to 5,000). For a playlist, also the songs on the albums it chose. For radio, also your 30 newest liked songs and thumbs down (artist and title) |
| Signing in to Claude | Anthropic | Your sign-in, on your phone. The code you paste goes from your phone to a page on the box, over your home network |
| Your Emby or Jellyfin server | Your own server | Your user name and password when you sign in (once), then what you watch and where you stopped, favourites and watched marks. Finding servers asks your home network, not the internet |
| Rotten Tomatoes scores | Your own server | Nothing extra: your server fetches them from OMDb, and vaporTV gets them from your server |
| Network shares | The computer or NAS you add | The user name and password you sign in with |
| Network shares' helper (rclone) | rclone.org, once | A download of rclone (a fixed version, checked against its published fingerprint before it's used) |
| Send from your phone | Nowhere: your home network only | Songs go straight from your phone to the box |
| Setting up apps | Flathub and the Chrome Web Store | Downloads of the apps, the mpv video player and the Netflix extension |
| Streaming apps | Netflix, YouTube and the rest | Whatever those services collect; they open in Chrome, under their own privacy policies |

To keep your location to yourself, choose a place in **Settings → General → Location**: ipwho.is is then never asked. A nearby city works as well as your street.

## Claude Code

Claude is optional. Nothing goes to Anthropic until Claude Code is installed on the box and signed in (see [Claude on vaporTV](claude.md)). Once it is, it's used under your own Claude account and Anthropic's privacy policy, as Claude Code is on any computer.

Most of it happens when you ask: you talk to the Claude app, use voice search, or ask for music. Two music choices ask by themselves once you've switched them on: **A station from your likes** (as background music) and a playlist's **Keep it fresh** each ask Claude again about once a day.

The pages your phone opens to sign Claude in or send music are on your home network only. Each has a fresh secret in its address, and closes on its own: the sign-in page after 15 minutes, the music page when its screen closes or after 20 minutes with nothing sent.

## Report a problem

**Settings → Help → Report a problem** puts together a bug report for GitHub. Nothing is sent from the TV: the QR code opens the report on your phone, and it goes only if you press **Submit** there.

GitHub reports are **public**. A report holds:

- vaporTV's version, the SteamOS version, your graphics card, screen size and controllers.
- The end of vaporTV's log: which buttons were pressed and errors. Before it goes in, vaporTV takes out what's personal: the names on the buttons you pressed (files, folders, Wi-Fi networks, Bluetooth devices, playlists), what voice search heard, what the Claude app asked to run or change (only the kind of thing, such as a command or an edit, is kept), the names of network shares, and the box's address on your network. What you type on the on-screen keyboard is never logged at all.

The second code, **Full details**, opens a page on your phone, over your home network only, with more: what each part of vaporTV was doing when you opened Report a problem (states and counts, such as whether the music is playing, not what it is), a summary of your settings (choices only: no place, keys, names or sign-ins) and the log of recent days, scrubbed the same way. It's made when you open Report a problem, and the page closes with it. It goes on GitHub only if you download it and attach it yourself.

Read the report over on your phone before you submit, and delete anything you'd rather not share.

## What vaporTV keeps on the box

All of it is in your home folder. Only your account can read the settings, the network share sign-ins and the log.

- `~/.config/steamtv/config.json`: your settings, including your chosen place, any API keys you added, and your media server sign-ins (the server's address, your user name and the sign-in the server gave back, never your password).
- `~/.config/steamtv/rclone.conf`: network share sign-ins (the computer, the share, your user name and password). The password is scrambled, not encrypted, so treat the file like the password itself.
- `~/.config/steamtv`: your music's liked songs, favourite albums and thumbs down (`music-favorites.json`), your music playlists (`music-playlists.json`), and which drives and shares are in your library (`music-sources.json`).
- `~/.local/share/steamtv`: play history (`history.json`), playtime (`playtime.json`), favourites (`favorites.json`), game playlists (`playlists.json`), the speech model and Claude's voice (`voice`), the network share helper (`rclone`), and photos the screensaver downloaded.
- `~/.cache/steamtv`: downloaded game art, the weather, the music library's index of every song (`music-index.json`) and its covers (`music-covers`), the background station (`background-station.json`), the last lists sent to Claude (`claude-search.txt`, `claude-music.txt` and `claude-music-songs.txt`), and the log (`input.log`), which starts over each time vaporTV opens.
- `~/Music`: songs sent from your phone (`From your phone`) and playlists saved as files (`Playlists`). Network shares appear under `~/Network` while they're mounted: those are the other computer's files, read-only.
- Claude Code keeps its own files in `~/.claude`: its sign-in, and a record of each Claude app conversation (`~/.claude/projects`).
- Streaming apps keep your sign-ins in Chrome, as a website would. Sign out inside each app to remove them.

The same folders hold files vaporTV needs to run (its Steam shortcut, the Netflix extension's setup), so don't delete the folders whole.

## Clearing it

Some things are removed from inside vaporTV:

- **A media server:** open **Settings → General → Connect your media library** and press **A** on the server to sign out. vaporTV forgets its sign-in and tells the server to forget it too.
- **A network share:** open **+ Add music** on the Music tab (or **Settings → Music & sounds**), and under **Network shares** choose **Remove** *share* **on** *computer*, then again when it says **Press again to remove**. vaporTV disconnects it and deletes its sign-in.

To sign Claude Code out, and delete its conversations (all of Claude Code's, not only vaporTV's), switch to Desktop Mode, open **Konsole**, and run:

```
claude auth logout
rm -rf ~/.claude/projects
```

To remove what vaporTV has saved about you, sign out of your media servers and remove your shares first (as above), then in **Konsole** run:

```
rm -f ~/.config/steamtv/{config,music-favorites,music-playlists,music-sources}.json ~/.config/steamtv/rclone.conf
rm -f ~/.local/share/steamtv/{history,playtime,favorites,playlists}.json
rm -f ~/.cache/steamtv/{input.log,music-index.json,background-station.json,weather.json,claude-search.txt,claude-music.txt,claude-music-songs.txt}
rm -rf ~/.local/share/steamtv/screensaver ~/.cache/steamtv/art ~/.cache/steamtv/music-covers
```

vaporTV starts fresh the next time it opens, with the welcome tour, and downloads game art again. Your games, emulators, Steam library and music files aren't touched. Songs sent from your phone stay in `~/Music/From your phone` until you delete them.

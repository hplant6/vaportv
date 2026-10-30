# Privacy

What vaporTV sends over the internet, what it keeps on the box, and how to clear it. In short: there's no account, no analytics and no tracking. vaporTV only goes online for something you'd see on screen.

## What goes where

| What | Where it goes | What it sends |
| --- | --- | --- |
| Weather, sunrise and sunset | Open-Meteo | The place the weather is for, as map coordinates |
| Your location, if you haven't chosen one | ipwho.is | Your internet address, which it turns into a rough location (usually your town) |
| Choosing a place in Settings | Open-Meteo | The name you type |
| Game art | SteamGridDB, the libretro thumbnail library, and Brave or DuckDuckGo image search when you search for art | The game's name, plus your API key for SteamGridDB or Brave if you added one |
| Updates | GitHub | A check for a newer release; GitHub sees your internet address, as any website does |
| Voice search | Hugging Face, once | The speech model downloads the first time. What you say is understood on the box and never sent anywhere |
| Setting up apps | Flathub and the Chrome Web Store | Downloads of the apps and the Netflix extension |
| Streaming apps | Netflix, YouTube and the rest | Whatever those services collect; they open in Chrome, under their own privacy policies |

To keep your location to yourself, choose a place in **Settings → General → Location**: ipwho.is is then never asked. A nearby city works as well as your street.

## Report a problem

**Settings → Help → Report a problem** puts together a bug report for GitHub. Nothing is sent from the TV: the QR code opens the report on your phone, and it goes only if you press **Submit** there.

GitHub reports are **public**. A report holds:

- vaporTV's version, the SteamOS version, your graphics card, screen size and controllers.
- The end of vaporTV's log: which buttons were pressed and errors. Before it goes in, vaporTV takes out what's personal: the names on the buttons you pressed (files, folders, Wi-Fi networks, Bluetooth devices, playlists) and what voice search heard. What you type on the on-screen keyboard is never logged at all.

Read it over on your phone before you submit, and delete anything you'd rather not share.

## What vaporTV keeps on the box

All of it is in your home folder. Only your account can read the settings and the log.

- `~/.config/steamtv/config.json`: your settings, including your chosen place and any API keys you added.
- `~/.local/share/steamtv`: play history (`history.json`), playtime (`playtime.json`), favourites (`favorites.json`), the speech model, and photos the screensaver downloaded.
- `~/.cache/steamtv`: downloaded game art, and the log (`input.log`), which starts over each time vaporTV opens.
- Streaming apps keep your sign-ins in Chrome, as a website would. Sign out inside each app to remove them.

The same folders hold files vaporTV needs to run (its Steam shortcut, the Netflix extension's setup), so don't delete the folders whole.

## Clearing it

To remove what vaporTV has saved about you, switch to Desktop Mode, open **Konsole**, and run:

```
rm -f ~/.config/steamtv/config.json ~/.local/share/steamtv/{history,playtime,favorites}.json ~/.cache/steamtv/input.log
rm -rf ~/.local/share/steamtv/screensaver ~/.cache/steamtv/art
```

vaporTV starts fresh the next time it opens, with the welcome tour, and downloads game art again. Your games, emulators and Steam library aren't touched.

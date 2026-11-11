# GOG, Epic and other PC games

Play games from GOG, the Epic Games Store and Amazon Prime Gaming in vaporTV, using the free Heroic Games Launcher.

## How it works

vaporTV doesn't install or run these games itself. **Heroic** downloads them, keeps them updated, and adds each one to Steam as a non-Steam game. vaporTV lists every non-Steam game in Steam on the **Steam** tab, and opens it through Steam when you press A, the same way it opens a Steam game.

Opening through Steam means each game gets your controller set-up, the Steam overlay, and playtime counted the same as a Steam game.

The same works for anything else you add to Steam yourself, such as a game from Lutris or a Windows program.

## 1. Install Heroic

1. Switch to **Desktop Mode** (Steam button → Power → Switch to Desktop).
2. Open **Discover**, search for **Heroic Games Launcher**, and choose **Install**.
3. Open Heroic and sign in to your stores: **GOG**, **Epic Games** or **Amazon**, from the **Log in** page.

No mouse? In Desktop Mode, Steam makes your controller a mouse: the **right stick** moves the pointer, **R2** clicks, and **Steam + X** opens the on-screen keyboard.

## 2. Set Heroic up once

In Heroic's **Settings → General**:

- Turn on **Add games to Steam automatically**. This is the step that matters: without it, each game has to be added to Steam by hand (on its page in Heroic, **⋯ → Add to Steam**).
- **Default Installation Path:** where games go. Pick a drive with room (an SD card or second drive works). You can also change it for each game when you install it.

Then in **Wine Manager**, install the newest **GE-Proton** and choose it in **Settings → Game Defaults**. Most Windows games run better with it than with Heroic's default.

## 3. Install games

Pick a game in Heroic's **Library** and choose **Install**. When it finishes, Heroic adds it to Steam. Switch back to Gaming Mode (**Return to Gaming Mode** on the desktop), and it's in vaporTV.

## Finding them in vaporTV

On the **Steam** tab:

- **Non-Steam games** lists them A–Z.
- **All games** lists them along with your Steam games.
- Once you've played one, it's in **Recently played** too, and on Home.

Press **Y** on a game to favourite it, and **Start** for its playtime, playlists, and **Open in Steam**.

## Covers

Heroic usually gives a game its cover when it adds it to Steam. For a game without one, vaporTV finds a cover on [SteamGridDB](https://www.steamgriddb.com/) once you've added a free SteamGridDB key in **Settings → Artwork**. To change a cover, set it in Steam's library (Desktop Mode: right-click the game → **Manage → Set custom artwork**).

## If something's wrong

- **A game isn't on the Steam tab:** check it's in Steam's library under **Non-Steam**. If it isn't, turn on **Add games to Steam automatically** in Heroic, or add it from the game's page in Heroic (**⋯ → Add to Steam**).
- **A game is listed but doesn't open:** Steam only reads new non-Steam games as it starts. Restart the box (or Steam) once after adding games.
- **A game opens to a black screen or crashes:** try a different version of Proton for it in Heroic (the game's **Settings → Wine**), or check [ProtonDB](https://www.protondb.com/) for what works. Games with anti-cheat often don't run on Linux at all; Heroic shows a warning for these.
- **Your saves:** Heroic syncs GOG cloud saves if you turn on **Cloud Save Sync** in the game's settings.

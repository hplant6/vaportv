# Streaming apps

Set up Netflix, Disney+, YouTube, Plex, Kodi and the other apps so they open from vaporTV's Apps tab.

## Two kinds of app

vaporTV opens apps in two ways, and that changes how they're set up:

- **Streaming websites** (Netflix, Disney+, Prime Video, Max, Hulu, Paramount+, Peacock and Tubi) open in Google Chrome, full screen. Each one is a Steam shortcut, so that Steam can turn your controller into a mouse and keyboard for the site.
- **Apps of their own** (YouTube, Emby, Jellyfin, Plex and Kodi) are real programs made for a TV. vaporTV installs them from Flathub and opens them directly, with no Steam shortcut. YouTube opens in VacuumTube, a YouTube app made for TVs.

## The quickest way: at install

When you first run vaporTV's setup in Desktop Mode, tick the apps you want under **Apps**. Setup installs what they need and adds the Steam shortcuts in one go. If you've done this already, skip to **Signing in**.

## From the Apps tab

Anything not set up yet is dimmed in the **Apps** tab, with a **Set up** label.

1. Open the **Apps** tab (L1 / R1 to switch tabs) and pick the app.
2. Press **A**. vaporTV says what it needs.
3. For an app of its own, choose **Install**. It downloads from Flathub (you'll see its progress) and opens from then on. There's nothing else to do.
4. For a streaming website, choose **Set up**. vaporTV installs Google Chrome if it isn't there yet, then asks to add the app to Steam.
5. Choose **Add**, or **Add all streaming apps** to set up every website at once. Steam only reads new shortcuts as it starts, so it closes and opens again: this takes about a minute, and vaporTV comes back by itself.

> **Tip:** add every streaming site you might use in one go. Each time you add one, Steam has to restart.

## The controller in a streaming website

Streaming websites are made for a mouse and keyboard, so Steam turns the controller into one. The first time you open each site:

1. Press the **Steam** button (the Xbox button on an Xbox controller) and open the **Controller** settings.
2. Choose **Browse layouts**, then **Templates**, then **Web Browser**, and apply it.

Steam remembers the layout for that app from then on. Netflix works differently: see [The Netflix extension](netflix-extension.md).

The apps of their own (YouTube, Jellyfin, Plex, Kodi) work with the controller as it is. Emby is driven by Steam's keyboard keys (arrows, Enter and Escape), so give it a layout that sends those if the controller does nothing in it.

## Signing in

Each app asks you to sign in the first time. To type in Gaming Mode, press **Steam + X** (Xbox + X on an Xbox controller) to bring up Steam's keyboard. A USB or Bluetooth keyboard also works.

Many apps also let you sign in from your phone with a code: that's usually quicker.

## Closing an app

- **Hold Select and Start** for a second to close the app and come back to vaporTV.
- On a TV remote, **Home** does the same.

## Putting an app on Home

Home shows your favourite apps. In the **Apps** tab, pick an app and press **Y** to put it on Home or take it off.

Press **Start** on an app to see what it opens in, when you last used it and how much space it takes. For the apps from Flathub there's also **Update**.

## Tiles without pictures

vaporTV doesn't ship logos for the apps. Their tiles show the app's name until you add a free SteamGridDB key in **Settings → Artwork**. vaporTV then downloads tile art for them.

## If an app won't open

- **It's still dimmed after setup:** for a website, Steam may not have restarted. Restart the box, or switch to Desktop Mode and back.
- **A website opens but the controller does nothing:** it has no controller layout yet. See **The controller in a streaming website** above.
- **An app opens to a black screen or keeps loading:** close it (hold Select and Start) and open it again. If it keeps happening, use **Settings → Help → Report a problem**.

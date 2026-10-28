# TV remotes

Use a TV remote instead of a controller: which remotes work, what the buttons do, and how to wake the box with one.

## Which remotes work

vaporTV works with any remote that acts as a keyboard: arrow keys to move, Enter to choose, Escape or Backspace to go back. That covers:

- **Universal remotes with a hub**, such as Sofabaton's, which pair with the box over Bluetooth as a keyboard.
- **USB TV remotes** that come with their own little receiver (often sold as "air mouse" or "RC" remotes).
- **A Bluetooth or USB keyboard.**

vaporTV recognises a remote by the name its receiver gives (one with "Sofabaton", "Remote" or "RC" in it). That turns on the remote-only buttons below, which a real keyboard doesn't get because games and text boxes use those keys.

## Pairing

A USB remote works as soon as its receiver is plugged in.

For Bluetooth, put the remote (or its hub) in pairing mode, then in vaporTV open **Settings → Bluetooth**, pick it from the list and press A.

## What the buttons do

| Button | Does |
|---|---|
| Arrows | Move |
| OK / Enter | Open what's highlighted |
| Back | Back |
| Page up / down | Previous or next tab |
| Home | Close the app in front and come back to vaporTV. For a game, press it twice (so a stray press doesn't lose your progress) |
| Menu | Tap: voice search. Hold: Settings |
| Power | Put the box to sleep |
| F11 | Steam's menu, as a controller's Steam button |

On a keyboard, a few letter keys also work: **F** adds to Favorites, **X** fixes a game's art, **G** opens Game options and **H** shows what each button does.

Back also works in YouTube, which on its own only goes back on Escape.

## Sofabaton remotes

A Sofabaton hub can switch the TV on and set its input as well as drive the box. A setup that works well for an **Activity**:

- **On:** TV power, the TV's HDMI input, then the box's **Home** key (it wakes the box, and vaporTV ignores it for a few seconds after waking).
- **Off:** the box's **Power** key, then TV off.
- **Volume:** to the TV (or your speakers), not the box.

In the Sofabaton app, use the key called **Home** for the box, not **Home1** (that one is the keypad's 7, which vaporTV also accepts as Home but other apps don't). Avoid **F12**: it opens Chrome's developer tools in streaming apps. To open Steam's menu, map a button to **F11**.

## Waking the box with the remote

The box can sleep and wake like a TV box: **Power** on the remote sleeps it, and any button wakes it.

Waking over Bluetooth needs a system setting that vaporTV's setup writes (with the admin password) when you tick **Let my controller wake the box from sleep**. It covers the Bluetooth adapter as well as controller receivers. If the remote doesn't wake the box, run setup again in Desktop Mode with that ticked.

> **Tip:** if the box falls asleep and wakes straight back up, that's the hub reconnecting. vaporTV notices and puts it back to sleep once by itself.

## If it doesn't work

- **The remote moves around vaporTV but Home, Menu or Power do nothing:** vaporTV doesn't see it as a remote. Check its name in **Settings → Bluetooth**; one without "remote" or "RC" in it is treated as a keyboard.
- **The remote stopped waking the box after a SteamOS update:** see [When an update breaks something](updates.md).
- **Nothing works at all:** check it's still connected in **Settings → Bluetooth** (use a controller for that). Remove it and pair again if it shows as not connected.

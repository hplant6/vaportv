# The Netflix extension

vaporTV for Netflix is a small Chrome extension that lets you move around Netflix with a remote's arrows or a controller's D-pad, like a TV app.

## Why it's needed

vaporTV opens Netflix as its website, in Google Chrome. The website is made for a mouse: with arrow keys alone you can't get from one title to the next. The extension fixes that:

- **Left and right** move along a row, sliding the row on at its ends.
- **Up and down** go to the nearest title in the row above or below, with the big banner's buttons and the top menu above the first row.
- **Enter (A)** opens a title's info panel. While it's open the arrows stay inside it, and closing it brings you back to the title you were on.
- **"Who's watching?"** works too: the arrows move between profiles.
- **The video player** works like vaporTV's own:
  - **OK (A)** plays and pauses.
  - **Left and right** skip 10 seconds back and on (so do a controller's **triggers**).
  - **Down or up** brings up Netflix's buttons with a gold ring on one. The arrows move the ring and OK presses the button: Audio & Subtitles, Next Episode, Episodes, Skip Intro, Back to Browse.
  - In **Audio & Subtitles** the arrows move between tracks and OK picks one. A controller's **Y** opens it straight away.
  - **Back (B)** closes a panel, then the buttons, then the player.

It only runs on netflix.com. It reads nothing and sends nothing anywhere.

## Setting it up

Chrome only installs an extension from outside its web store when a system setting (a *policy*) says to, and writing that needs your **admin password**.

> **Tip:** SteamOS has no admin password until you set one. In Desktop Mode, open **Konsole**, type `passwd` and press Enter, then choose one. You'll need it again, so keep it somewhere safe.

**At install.** In vaporTV's setup (Desktop Mode), tick **Netflix** under Apps. Setup asks for the admin password once, and installs the extension with everything else.

**Later, from Gaming Mode.** If you set Netflix up afterwards from the Apps tab, vaporTV notices the extension is missing the next time it starts and offers to set it up. Choose **Repair** and type the admin password on vaporTV's keyboard.

Then close Netflix if it's open, and open it again. Chrome installs the extension as it starts.

## The controller in Netflix

A remote sends arrow keys, so it works straight away. A controller works too: the extension reads it itself (the **D-pad** or left stick moves, **A** chooses, **B** goes back), as long as Steam's layout for the Netflix shortcut passes it through as a controller, which is Steam's default. A layout that sends the arrow keys, Enter and Escape instead works as well.

## Updates

The extension comes inside vaporTV. When vaporTV updates, it hands Chrome the new version, and Chrome picks it up the next time it starts. There's nothing to do.

## If it stops working

- **The arrows do nothing in Netflix:** a SteamOS update may have removed the policy (SteamOS 3.9.5 did). Restart vaporTV: it checks, and offers **Repair** if so (if you chose **Later** last time, run setup again in Desktop Mode instead). See [When an update breaks something](updates.md).
- **The D-pad moves a mouse pointer instead:** the Netflix shortcut's controller layout turns the controller into a mouse. In Netflix, press the **Steam** button, open the **Controller** settings and choose the default gamepad layout. See **The controller in Netflix** above.
- **It worked, then Netflix changed:** Netflix sometimes redesigns its pages, which can confuse the extension. Use **Settings → Help → Report a problem**, saying which page it was on.

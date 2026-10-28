# When an update breaks something

What to do when a SteamOS or vaporTV update leaves something not working, and how to keep vaporTV up to date.

## SteamOS updates

SteamOS replaces the whole system when it updates, and throws away system settings it doesn't know about. Two parts of vaporTV's setup live there:

- **Wake from sleep:** the setting that lets a controller or remote wake the box.
- **Netflix remote control:** the setting that installs the Netflix extension.

vaporTV adds both to the list of settings SteamOS keeps, so they normally survive. If an update does take them (SteamOS 3.9.5 removed them before vaporTV added that), vaporTV notices as it starts:

1. A **Repair vaporTV** window says what went missing.
2. Choose **Repair** and type your admin password on vaporTV's keyboard.
3. For Netflix, close and reopen it afterwards.

Choose **Later** to skip it. vaporTV then stops asking about that problem, so to repair it afterwards, run the vaporTV AppImage again in Desktop Mode: setup puts back whatever is missing.

> **Tip:** if the window says no admin password is set, switch to Desktop Mode, open **Konsole**, type `passwd`, press Enter and choose one. Then come back to Gaming Mode and restart vaporTV.

## vaporTV doesn't open after an update

If Gaming Mode starts in Steam instead of vaporTV:

1. Open **vaporTV** from your Steam library (it's under Non-Steam).
2. If that doesn't work, switch to Desktop Mode and run the vaporTV AppImage again. Setup puts back anything that's missing, including opening vaporTV when Gaming Mode starts.

## Apps and emulators after an update

- **A streaming website shows as not set up:** Steam may have lost its shortcut. Pick it in the Apps tab and press A to set it up again.
- **An app from Flathub won't open:** press **Start** on it and choose **Update**. Flathub apps sometimes need an update to run on a new SteamOS.
- **An emulator's tab disappeared:** EmuDeck may need updating too. Open EmuDeck in Desktop Mode and let it update the emulators.

## Updating vaporTV

vaporTV checks GitHub for new versions. When there is one, **Settings → General → Updates** shows it with what's new. Choose it, and vaporTV downloads the new version, swaps it in and restarts on its own.

You can also update by hand: download the new **vaporTV.AppImage** from the [releases page](https://github.com/hplant6/vaportv/releases/latest) in Desktop Mode and run it.

## Still stuck?

Use **Settings → Help → Report a problem**. It makes a QR code that opens a bug report on your phone, with vaporTV's version, your system and recent log lines filled in. Say what you were doing and what happened.

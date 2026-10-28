# Emulators

Play your console games from vaporTV's tabs: how vaporTV finds the games and the emulators, and what each tab needs.

## How it works

vaporTV doesn't emulate anything itself. It finds the emulators and games that [EmuDeck](https://www.emudeck.com/) sets up, shows each console as a tab, and opens a game in the right emulator when you press A.

A console's tab appears once two things are there:

1. **Its emulator**, installed where EmuDeck puts it.
2. **Its games**, in that console's folder.

If either is missing, the tab stays hidden. Nothing breaks.

## 1. Install EmuDeck

1. Switch to **Desktop Mode** (Steam button → Power → Switch to Desktop).
2. Download EmuDeck from [emudeck.com](https://www.emudeck.com/) and run it.
3. Choose where your games go (the box itself, or an SD card or drive), and pick the emulators you want. **Easy Mode** installs everything vaporTV uses.

EmuDeck creates an **Emulation/roms** folder with a folder for each console inside. vaporTV reads EmuDeck's settings to find it, wherever you put it. Without EmuDeck's settings it looks for an Emulation/roms folder in your home folder, then on each drive.

You don't need EmuDeck's Steam ROM Manager or ES-DE for vaporTV, though they don't get in the way.

## 2. Add your games

Copy each game into its console's folder under **Emulation/roms**. You can copy from another computer over the network, or from a USB drive with the **Files** app in vaporTV's Apps tab (A on a file, then **Copy**, then **Paste** in the folder).

New games show up the next time you open their tab, or when you come back to vaporTV from a game.

| Tab | Folder | Emulator | Files |
|---|---|---|---|
| Switch | switch | Ryujinx | .nsp, .nsz, .xci, .xcz |
| PS3 | (in RPCS3) | RPCS3 | installed games and disc folders |
| Xbox | xbox | xemu | .iso |
| Xbox 360 | xbox360/roms | Xenia | .iso, .xex, .zar |
| PS2 | ps2 | PCSX2 | .iso, .chd, .cso, .zso, .gz, .cue, .bin |
| PSX | psx | DuckStation | .cue, .ccd, .chd, .pbp, .ecm |
| PSP | psp | PPSSPP | .iso, .cso, .chd, .pbp |
| GameCube | gc | Dolphin | .rvz, .iso, .gcm, .gcz, .ciso, .wia |
| Wii | wii | Dolphin | .rvz, .wbfs, .iso, .wia, .gcz, .ciso |
| Wii U | wiiu | Cemu | game folders (with a .rpx inside) |
| Dreamcast | dreamcast | RetroArch (Flycast) | .gdi, .cue, .chd, .cdi |
| Saturn | saturn | RetroArch (Kronos) | .cue, .chd, .ccd, .zip |
| N64 | n64 | RetroArch (Mupen64Plus-Next) | .z64, .n64, .v64, .zip, .7z |
| NES | nes | RetroArch (Mesen) | .nes, .fds, .unf, .zip, .7z |
| SNES | snes | RetroArch (Snes9x) | .sfc, .smc, .fig, .swc, .bs, .zip, .7z |
| Genesis | genesis | RetroArch (Genesis Plus GX) | .md, .gen, .smd, .bin, .zip, .7z |
| 32X | sega32x | RetroArch (PicoDrive) | .32x, .bin, .zip, .7z |
| Amiga | amiga | RetroArch (PUAE) | .adf, .ipf, .lha, .hdf, .zip, .7z |
| Arcade | atomiswave, naomi, naomi2, cps1–3, neogeo, arcade, mame, fbneo | RetroArch (Flycast, FinalBurn Neo, MAME) | .zip, .7z |

On a TV, this table is easier to read on your phone: scan the QR code beside this guide.

## Console notes

**Switch.** Ryujinx needs your own console's keys and firmware before games start. Put them in through Ryujinx in Desktop Mode (EmuDeck's guide explains where they go). A game can be a single file, or a folder holding the game with its updates and DLC.

**PS3.** vaporTV lists the games RPCS3 already knows about: games installed into RPCS3 (from .pkg files), and disc games in RPCS3's games folder. Install and add them in RPCS3 in Desktop Mode, along with the PS3 firmware.

**Xbox.** xemu needs the Xbox BIOS and hard-drive image; EmuDeck sets these up once you add the files it asks for. Keep each game in a folder of its own: vaporTV names games after their folders.

**Xbox 360.** Xenia is a Windows program, so vaporTV runs it through Proton. Install **Proton Experimental** from Steam's library (Tools) if the tab doesn't appear.

**PS2, PSX and Saturn.** PS2 and PSX games need their console's BIOS files in EmuDeck's bios folder. For Saturn, Kronos needs the Saturn BIOS too.

**Games on several discs.** Keep all of a game's discs in one folder named after the game. vaporTV shows it once and hands the emulator the whole set, so you can change discs from the emulator's menu.

**Arcade.** vaporTV names arcade games from MAME's list, so keep the original set names (sf2.zip, not Street Fighter II.zip). Each board family opens in the RetroArch core that suits it; press **Start** on a game to choose a different one.

## Playing

- **A** starts the game.
- **Hold Select and Start** for a second to close the emulator and come back to vaporTV.
- Your progress saves the way the emulator saves it: in-game saves always work, and most emulators also have save states in their own menus.

## Game options

Press **Start** on a console game for its options:

- **Name:** rename it, if the file name reads badly.
- **Emulator:** pick a different RetroArch core for it, where there's more than one.
- **Artwork:** pick its cover from SteamGridDB, RetroArch's box art, or a web image search. **X** on a game does this too.
- **Delete:** remove it from the drive. Press A twice; it can't be undone.

## Covers

vaporTV finds covers on its own: from RetroArch's thumbnail collection, and from [SteamGridDB](https://www.steamgriddb.com/) once you add a free SteamGridDB key in **Settings → Artwork**. A game without a cover shows its name on a black band until it has one.

## Arranging the tabs

With many consoles, the top bar fills up: past ten names, the rest go under **More**. In **Settings → Tabs** you can choose which tabs sit in the bar and which go under More, put them in any order, or switch off the ones you don't use. **Settings → Consoles** sets how each console's tab shows its games.

## If something's wrong

- **A tab doesn't appear:** check that the emulator is installed (open it once in Desktop Mode) and that its folder has at least one game in a format from the table above.
- **A game is missing:** check its file type against the table. Files in an unusual format, or still compressed in a way the emulator can't open, are skipped.
- **A game opens to a black screen or an error:** open the same game in the emulator in Desktop Mode. If it fails there too, the emulator needs setting up (BIOS, firmware or keys). If it only fails from vaporTV, use **Settings → Help → Report a problem**.

# Changelog

What changed in each release of vaporTV. `scripts/release.sh` publishes a version's
section as its GitHub release notes, which is what the update window in vaporTV shows,
so write for the people using it: what's new, what's fixed. Start a version's section
as `## <version>` (as in package.json), then `### Added`, `### Fixed` or `### Changed`
groups of `- ` points. Collect changes under `## Unreleased` until then.

## Unreleased

### Added
- Claude app: talk to it in Japanese. It hears English or Japanese by itself (a second speech model, about 490 MB, downloads the first time), answers Japanese in a Japanese voice, and can translate back and forth between two people at the TV.

## 0.18.0

### Added
- **Settings → General → Updates → Apps and system** updates the box's other software from the TV, no Desktop Mode needed: the apps and runtimes Discover would offer (Chrome, Kodi, the emulators and the rest). It shows what has an update waiting; press A to update them all. Apps that are open get the new version next time you open them. SteamOS itself is still updated in Steam's Settings → System.
- **Now playing** has a visualizer beside the album cover: a neon **Orb** or a glowing **Wave** of the music, or **None**. Choose in Settings → Music.
- **Recently added** in the Music tab's bar: the albums you added most recently.
- **Twitch** in the Apps tab: the website, opened full screen in Chrome like Netflix and the other streaming sites (Set up adds it to Steam). vaporTV's extension (it was vaporTV for Netflix) now works on Twitch too: a gold ring moves between streams, channels and categories with the D-pad, A opens, B goes back, and a channel's stream fills the screen (A pauses, Y mutes, Down shows chat and Follow). No Web Browser layout needed.
- The two-button presses can be moved in **Settings → Controller**, like the other buttons: **Close a game or app** (Select + Start), **Sound off or on** (both sticks) and **Report a problem** (R3 + RT). Choose one and hold the two buttons you want. A button that's part of one now acts as you let go of it, so pressing a pair never also does what each button does alone.
- Hold **R3 + RT** (right stick in, right trigger) for a second to open **Report a problem** from any screen, so its details catch the screen the problem is on. It's in R2's button guide and Settings → Controller.
- **Add details** also offers a screenshot of the screen as it was when you opened Report a problem, to attach if it shows the problem.
- **Report a problem** is two steps: the report's code, then (optional, but the most help) **Add details**, whose code opens a page on your phone (on the same Wi-Fi) to download or copy what vaporTV was doing when you opened the report, and its recent log, to attach to the report on GitHub, with the last few minutes of activity (screens, cursor, music, and vaporTV's own requests and how long each took). The activity is kept in memory only; the rest is gathered only when you open Report a problem, the page closes with it, and what's personal is taken out, as in the report.
- Seven new guides in **Settings → Help → Guides**: The Video tab, The Music tab, Finding and organising your games, The controller, Claude on vaporTV, Making it yours (backdrops, screensavers, Home) and The Files app. The Privacy guide now covers Claude, media servers and network shares, and the Emulators, Streaming apps and TV remotes guides are up to date.

### Fixed
- If vaporTV's screen crashes, it comes back by itself instead of leaving the TV blank (up to three times in a few minutes). Crashes, freezes and the graphics process failing are now written to the log, and the log of the run before is kept, so **Add details** can show what led up to a crash.
- **Report a problem** leaves out more of what's personal: what the Claude app asked to run or change, the names of network shares, and the box's address on your network.
- The backdrop went black after the box woke from sleep, until vaporTV was restarted. It now starts again by itself (the turning consoles too).
- Moving quickly across the tiles on **More** could raise an error behind the scenes.
- Background music stayed stopped after the box woke from sleep, and sometimes after coming back from an app. vaporTV now asks the screen what's showing rather than waiting to be told, and starts the music again by itself.
- An album played from **Music** that ended, or was paused by opening an app, left the background music silent until you pressed Stop. It comes back when the album ends, and the album carries on when you come back from an app.

### Changed
- The music row under the top bar has Previous, Stop and Next as icons in a pill sitting between the bar's lines, beside the time, in place of the Stop and Skip words. Previous is new.
- **Apps** has its own backdrop: a TV on a walnut stand showing the vaporTV logo, with a figure holding a controller beside it. It turns on its tile in More too. **Video** keeps the pile of VHS tapes.

## 0.17.0

### Added
- **More**: the top bar holds Home and up to nine tabs, and the rest go on the **More** screen, its last tab, with room for as many as you have. Each is a tile with the console's logo over a picture of the console, which turns when you rest on it. B from a console you opened there brings you back to it. **Settings → Tabs** chooses which tabs sit in the bar and which go in More.
- **Now playing** under the top bar: as each song starts, a row drops down for a few seconds with what's playing and how far in it is. Down from the bar brings it back, with **Stop** and **Skip**. **Settings → Music & sounds → Now playing bar** keeps it open while music plays, or switches it off.
- Films and shows play in **mpv** (installed the first time), which plays your server's file as it is with the GPU decoding it, so your server no longer has to convert it. vaporTV draws its own controls on it, as before: the seek bar, Audio & subtitles, and a panel of controller shortcuts showing your controller's buttons. If mpv can't start, the old player takes over.
- The **Video** tab shows just the art: rest on a poster or a Continue watching still and its name, length and score slide up over it, while the gold part-watched line stays in sight. Where your server has the **Rotten Tomatoes** score (Emby and Jellyfin get it from OMDb), it shows there and in a film's details (Start).
- **vaporTV for Netflix** works from a remote or controller in Netflix's player: OK plays and pauses, left and right skip 10 seconds, up or down reach its buttons (Audio & Subtitles, Next Episode, Skip Intro), and Back closes them. Netflix and the other streaming apps now start with sound.

### Changed
- The **Claude** app speaks with a new, much more natural voice (Kokoro). It downloads the first time it's used.
- The song playing has moved from the top corners to the bar's new row: the corners' **Song playing** layout and **Now playing** setting are gone, and a corner that showed the song goes back to the date or the time.
- The Music tab no longer shows background music's song above its rows (the bar does), and the Apps tab's Music tile is gone (the Music tab plays your music directly).

### Fixed
- Films that stalled on a slower server: H.265 films are passed to the TV as they are instead of being converted, and the player keeps two minutes ahead.

## 0.16.0

### Added
- A **Music** tab, after Video: your whole library as **Albums**, **Artists**, **Favorites**, **Playlists** and **Recently played**, read from songs' tags across `~/Music` ("Music on this TV"), drives, network shares and your Emby or Jellyfin server's music libraries. A turntable turns in its bar; **Sort** orders albums like a streaming app (Recently played, Recently added, Alphabetical, Artist, Release year) and **Genre** narrows them. A on an album opens its page (Play all, Shuffle, Favorite, + Playlist, Set as background music); its songs play straight away. **Now playing** floats the cover over the backdrop with a visualizer in its colours. Games' and emulators' folders on a drive are skipped, so their sound effects stay out.
- Two albums come with vaporTV: **Ambient** (Chris Zabriskie) and **Retro** (chiptunes), credited as their licences ask, so the Music tab is never empty.
- **Favorites**: **Y** on an album stars it, on a song (or in Now playing, or its new heart) likes it. **Liked songs** and your favorite albums lead the Favorites list, and a **Music** row on Home plays them with one press.
- **Radio**, with Claude Code on the box: from a song's menu (the game-options button on its row) or Now playing's radio button, Claude picks albums in your library that sound like it and plays a station from that song. Press the radio button again to see the station's songs. **Thumbs down** skips a song and keeps it off stations for good, and each new station hears what you've liked and turned down.
- **Playlists** of your own: **Save as playlist** from a station's list, **Add to playlist** from a song's menu or an album, or ask out loud, "make me a playlist of late-night city pop", and Claude chooses the songs and names it. Rename (say it or type it), reorder, remove songs, **Keep it fresh** (a station's or Claude's made again daily), **Show on Home**, and **Save as a playlist file** (`~/Music/Playlists`, for other players). Playlist files (`.m3u`) already in your music show up too, even ones made on another computer.
- **Search and voice** in Music: R3 or a remote's Menu on the Music tab asks Claude for music ("play all my vintage Japanese music") and plays, shuffles or shows what it picks.
- **+ Add music** (also in **Settings → Music & sounds**): copy songs or whole albums to the TV from a drive, **send them from your phone** by scanning a code, choose which drives and shares are in your library, and **add a network share** by signing in to a computer or NAS from the TV, no terminal needed (vaporTV fetches its share helper, rclone, the first time).
- Background music comes from your library now: **Settings → Music & sounds** offers None, Shuffle my library, Liked songs, a Claude station from your likes, and any playlist; any album or playlist can be **Set as background music** from the Music tab. Songs are evened out in loudness so a loud master doesn't jump out, the **Next song** button skips whatever you're hearing, and the Music tab's **Turn it up** carries the background song on at full volume.
- Two more choices for the top corners (Settings → Home): **Song playing** (the artist, title and cover of what you hear) and the **vaporTV logo**, its colours drifting.
- Voice search asks Claude Code (when it's on the box) which game or app you meant: a half-heard title, a game described ("the blue hedgehog one"), or a kind of thing ("something co-op").
- A **Claude** app in Apps: talk to Claude Code through the TV and hear the answer. A (or a remote's Menu) talks, or talks over a reply; it listens again after each answer until nothing is said. It can search the web, look into problems on this machine and change vaporTV's own code, kept at `~/Projects/vaportv` and brought up to date from GitHub each time a conversation starts. While it works, the launch spinner turns with a line saying what it's doing, and anything that would change or run something waits for **Allow** on the TV (B says no). Needs Claude Code installed on the box; sign in by scanning a code with your phone.
- A **Video** tab (it was called Media while being built), after Apps, once you've signed in to an Emby or Jellyfin server: the console tabs' left bar (with Apps' pile of VHS tapes turning in it) and grid, filled from every server you're signed in to. **Continue watching** and **Next up** as wide stills, **Recently added** and **Favorites** as posters, a tick on what you've watched and a count of a show's unwatched episodes. Under **Libraries**, each of your servers' libraries of films and shows (with several servers, each says which it's on), loading as you scroll so a library of thousands stays quick. A plays a film or episode from where you stopped. Sort orders Favorites and the libraries by name, date added, release date, last played or rating, and **Show unwatched only** leaves out what you've finished. A on a show opens its page: its backdrop, years and summary, its seasons along the top (L1 and R1 step through them) and that season's episodes, opening on the next one to watch with the cursor on it; back from an episode you stopped part way, the cursor's still on it. **Start** on any film, show or episode (on the Video tab, a show's page, or Home's Continue watching) opens its details: year, length, rating, genres and summary, then Resume, Play from the start, Mark as watched (a show: every episode) and Add to favorites. **Y** favourites one straight away. Both are saved on your server, and a star marks your favourites. **X** on one puts it in a playlist, as with games: a Home playlist (which can mix films and episodes with games) or a Video one, which gets its own list in the Video tab's bar under **Playlists**. Films and episodes in a Home playlist's row play straight from Home.
- **Continue watching** on Home, from your Emby and Jellyfin servers (as many as you like, merged into one row): the films and episodes you're part way through, newest first, with how far in you are and how long is left. Pick one and it plays full screen in vaporTV from where you stopped: A pauses, left and right on the D-pad scrub along the bar (faster the longer you hold, jumping there when you let go), the triggers skip back or on 10 seconds, B stops, and the launch spinner turns while it loads or catches up. **Y** opens **Audio & subtitles**: pick another language or turn subtitles on (text ones are drawn large for across the room; picture ones, from Blu-rays and DVDs, Emby burns into the video). Changing either carries on from the same moment. The server converts anything the TV can't play as it is, and hears where you got to, so the row (and its own apps) pick up there next time. Sign in under **Settings → General → Connect your media library**: vaporTV finds Emby and Jellyfin servers on your network, or takes an address, and keeps only the sign-in each gives it, never your password.

### Changed
- **Settings → Music** is **Music & sounds**, and background music's playlists moved to the Music tab with the rest of your playlists; the Apps tab's Music tile opens the Music tab.
- A new, shorter intro (4.5 seconds, sound from the first frame).
- A selected card in a grid grows from its centre wherever it is.
- Voice search hears better (a larger speech model, downloaded once), and the Claude app can speak its replies or only write them.

### Fixed
- Up from the top of a scrolled list in a tab's left bar went to Sort instead of the list above it.
- Non-Steam games in Recently played get their SteamGridDB poster when Steam has none.
- The box goes back to sleep after waking on its own a few times in a row.
- The on-screen keyboard keeps the cursor on Show, Shift and ?123.

## 0.15.0

### Added
- Grid layouts: the selected game slides up a bar over the bottom of its art with its icon, title, when you last played it and how long you've played, as on the carousel cards.
- A list down the left of every console's tab: the console's logo, then All games, Recents, Favorites and that console's playlists, each with how many games it has. The games of the list you're on fill the rest of the screen as one grid, so a big library is a few presses away. Press **L2** to hide the list and give the games the whole screen; each tab remembers whether it's shown and which list you were on.
- The Arcade tab has the list down the left too, with its systems under **Systems**: Atomiswave, NAOMI, NAOMI 2, CPS1, CPS2, CPS3 and MAME. Capcom's games are now split by the board they ran on, worked out from MAME's own records whatever folder they're in. The logo at the top follows the system you're on (Capcom Play System II on CPS2's list), under a turning Taito Egret 29 cabinet, the Taito logo on its screen. **Settings → Consoles → Arcade tab systems** hides a system from the list; if you'd switched off the old CPS row, all three CPS lists start off hidden.
- The Steam tab has the list down the left too: a Steam Deck turning under the Steam logo, Sort by, All games, Recents, Favorites, then under Playlists your own, the Steam collections you chose in Settings and your non-Steam games.
- **Sort by** in each console's list, under its console: press A to open it and pick Name, Last played, Most played or Date added (Recents keeps the order you played them). Each tab remembers its choice.
- Each console's tab shows the console itself turning slowly under its logo, in the same neon as before. The handhelds (Switch, PSP, Steam Deck) stand up so their screens face you, lit with their own home screens. On a slower machine, **Settings → Backdrop → Spinning consoles** turns them off and leaves just the logo.
- Playlists can show on Home, on a console's tab, or both: pick where in Settings → Home → the playlist → Show on. One made from a console's tab or the Steam tab (X → New playlist) shows on that tab; one made anywhere else shows on Home, and the ones you already have stay on Home.

### Changed
- The Rain backdrop is gone: City Rain replaced it, and is lighter on the GPU. If you had Rain chosen, you get City Rain.
- Consoles' tabs (and Steam's and Arcade's) no longer fill the screen with their console: it's in the list on the left now, and the tab shows Home's backdrop behind it. Apps keeps its VHS tapes, and the Consoles screensaver still shows every console full screen.
- **X** on a game now opens its playlists, each with an **Add** button (it says **Added** once the game's in; press it again to take it out); B closes them. Below them, **New Home playlist** makes one for Home, which can mix games from any system, and **New <console> playlist** one for the game's own tab, for that console's games only. A tab's playlists aren't offered for another console's games. Changing a game's artwork moved to its Game options (Start → Change artwork). If you had moved Artwork to another button, Playlist is on that button now.
- New button layout: **L2** shows or hides a tab's list of games (the left bar), **R2** shows what each button does, and **Select** opens Settings. The triggers no longer change the volume (a remote's or keyboard's volume keys still do). If you'd moved buttons in Settings → Controller, yours are kept, and the new actions take free buttons.
- Click both sticks in to turn vaporTV's sound off: the music and ambience, and anything playing in Files. Do it again to bring the music back. Clicking one stick still skips the song (left) or starts voice search (right), as you let go.
- R2's button guide sits lower, near the bottom of the screen, and shows every button now, in two lines, Select + Start and both sticks included; so does Settings → Controller, at the end of its list.

### Fixed
- Holding Select + Start closes non-Steam games again (GOG and other games added to Steam). Newer Steam launches vaporTV through a helper that the shortcut mistook for something vaporTV had opened: it closed that instead, and Steam took vaporTV down with it, leaving the game running.
- vaporTV couldn't be opened again from Steam after it closed or crashed in Desktop Mode: a background helper stayed running, so Steam thought vaporTV still was.

## 0.14.0

### Added
- GOG, Epic and other PC games on the Steam tab: every game added to Steam from outside Steam (by the Heroic Games Launcher, Lutris, or by hand) is listed in a new Non-Steam games row, and in All games, Recently played, Favorites (Y) and your playlists. They open through Steam, so your controller set-up, the overlay and playtime work as for any Steam game. Streaming apps and your own app tiles stay on the Apps tab.
- Covers for those games come from Steam, or from SteamGridDB when Steam has none (with a SteamGridDB key in Settings → Artwork).
- Press Start on one of them for its playtime, last played, playlists and Open in Steam.
- New guide, Settings → Help → Guides → GOG, Epic and other PC games: setting up Heroic so its games show up in vaporTV by themselves.

## 0.13.0

### Added
- Settings → Help → Guides → Support vaporTV: a QR code for tipping on Ko-fi, and what's coming next (a theming engine).
- Game playlists: your own lists of games from any mix of consoles and Steam, each a row on Home under Favorite Apps (like custom collections in ES-DE). Press Start on a game and choose Playlists to put it in one, take it out, or start a new one with it. Settings → Home → Game playlists renames them, changes their order on Home, takes games out and deletes them.
- Favourite Steam games right in vaporTV: press Y on any Steam game, as on the console tabs. Your favourites lead the Steam tab, and an All games row at the bottom lists every installed game so you can find the ones to add. Games already in Steam's Favorites collection are brought over the first time you open the tab.

### Changed
- Steam's own Favorites collection is called Steam favorites in Settings and no longer shows on the Steam tab by default (vaporTV's Favorites row replaces it). Turn it back on in Settings → Steam tab collections.

## 0.12.0

### Added
- Press the left stick (L3) to skip to the next song; a note at the bottom says which. It's Next song in Settings → Controller, so it can go on another button.

### Fixed
- Apps open on the first press. Steam sometimes ignores a launch, most of all just after it has closed another app (YouTube took three presses after Netflix): vaporTV now checks the app started and asks again if it didn't.
- The YouTube tile and its loading screen say YouTube, not YouTube Premium.
- The weather corner no longer goes blank when the weather service is briefly down: it tries again at once, then shows the last temperature it had for your place (up to a day old), and always your town's name. With nothing to show it asks again after a minute, not a quarter of an hour.
- Typing a weather location, a picture search (Artwork) or an API key uses vaporTV's own keyboard. Before, Steam's keyboard came up over a text box and every controller press landed twice, so a place like Long Beach couldn't be picked from the results.
- Netflix works with a controller: the D-pad or left stick moves between titles, A opens, B goes back (and in the player, A plays and pauses). Before, only a TV remote moved around it.
- Netflix's pop-up notifications ("New Arrival") no longer appear: nothing on screen could close them. Websites in vaporTV's Chrome can't send notifications any more (vaporTV asks for the admin password once to set this).
- Netflix shows no scrollbars at all, the video player's included.
- A new version of vaporTV's Netflix extension reaches Chrome the next time Netflix opens, rather than whenever Chrome next looks (up to a day, and before, never at all: 0.1.0 stayed).
- After an update, vaporTV comes back on screen even when Steam is slow to show its own: it used to give up after two minutes, leaving the old picture frozen on the TV.
- The Repair window says when it's this version of vaporTV changing part of its setup, instead of blaming a SteamOS update.

## 0.11.0

### Changed
- Neo Geo has a tab of its own, next to Arcade, instead of a carousel on the Arcade tab. Its games keep their history, favourites and chosen cores. Settings → Consoles → Neo Geo tab layout sets how it shows them.
- The Amiga tab is gone.
- Settings → Backdrop: Home backdrop comes first, then Tabs backdrop (was just Backdrop), whose first choice is now Consoles: each console tab shows its console in 3D, as before. Pick any other backdrop there to show it on every tab instead, consoles included.
- The top bar: More is gone. Press down from the bar, or up from the top of a page, to open the second row, on the tab nearest; the bar holds one more tab in its place. The tab you're on is underlined again, and the one the cursor is on is a paler yellow. Picking a tab from the bar (or L1/R1 there) keeps the cursor in the bar, on the new tab.
- Games and apps with no art yet show their name on a dark fade instead of on a black band over static.
- The built-in Chris Zabriskie playlist is now called Ambient.
- Songs show who made them on a second line, under the title, in Settings → Music and the playlist window.
- The on-screen keyboard's controller buttons are drawn as boldly as everywhere else.
- Settings says when your location is guessed from your internet address, and which service guesses it.
- Updates are signed: vaporTV installs only an update it can tell came from vaporTV.

### Added
- A Retro playlist in Settings → Music: 13 chiptunes by Juhani Junkala, Aron Ben Elal, Shiru and Oblidivm, from OpenGameArt. It's added alongside any playlists you've already made.
- The built-in music is volume-matched, so no track jumps out louder or quieter than the rest.
- Settings → Music → Now playing: the song that's on, with buttons to go back a song or skip to the next.
- Your songs and the ones that come with vaporTV are listed apart, yours first, and yours show their artist, album and length under the title (read from files named "Artist - Title" and the folders they're in).
- Preview a song from the playlist window too, with the play button beside it.
- A Consoles screensaver: each of your consoles' backdrops in turn, five seconds apiece (Settings → Screensaver).
- The screensaver's clock can stay in the bottom left corner (Settings → Screensaver → Clock position).
- Home can have a backdrop of its own: Settings → Backdrop → Home backdrop, at the top. The other screens keep the Tabs backdrop chosen below it.
- Console backdrops: the Steam tab shows a Steam Deck, Apps a pile of VHS tapes, Arcade an arcade stick, and the PlayStation, PS2, PS3, PSP, Switch, Wii, Wii U, N64, NES, SNES, Genesis, 32X, Neo Geo, Xbox, Xbox 360, GameCube, Saturn and Dreamcast tabs show their console, black and lit in neon magenta and cyan on a mirror floor, the camera slowly swinging round it like a product shot. At High and Medium their brightest light glows. Settings → Backdrop → Console backdrops sets how sharp they're drawn (High draws at the screen's full resolution, sharp on a 4K TV; Medium and Low do less work). The models come with the release (they aren't in the source code on GitHub).
- A Privacy guide in Settings → Help: what vaporTV sends where, what it keeps on the box, and how to clear it.
- Guides in Settings → Help: how to get things working: streaming apps, emulators, the Netflix extension, TV remotes, and what to do when an update breaks something. Read one full screen (up and down to scroll, L1 and R1 for the others), or scan its QR code to read it on your phone. The same guides are on GitHub, in docs/guides.

### Fixed
- PlayStation cards show DuckStation's icon (they had none). vaporTV now takes it from your DuckStation install (it can't ship with vaporTV), and a game you've moved to a RetroArch core shows RetroArch's icon.
- What you type on the on-screen keyboard (a Wi-Fi or admin password) no longer goes into vaporTV's log, so it can't end up in a Report a problem.
- vaporTV's settings file, which holds your Google sign-in and API keys, and its log can now be read only by your account.
- An update that can't be saved (the disk full, say) now says so, instead of the update window sticking at its last percent with Later and Back not working.
- Settings changed in quick succession (tabs, layouts, music, playlists, weather) and plays, playtime and favourites recorded at the same moment no longer overwrite one another.
- Search and voice search find games numbered past 10 or with V in their names: "Grand Theft Auto five" finds Grand Theft Auto V, and "Final Fantasy 15" finds Final Fantasy XV.
- Home no longer fails to load when Steam's list of non-Steam games can't be read, and it loads faster, reading that list once instead of once per app.
- Report a problem leaves out what's personal: the names on the buttons you pressed (files, Wi-Fi networks, Bluetooth devices) and what voice search heard. It also now says the report will be public.
- Signing out of Google takes its photos off the screensaver, signs the sign-in window's Chrome out of Google too, and tells you if Google couldn't be reached to take back vaporTV's access.

## 0.10.0

### Added
- Game options (Start on a game) is redesigned: the game's cover beside its name, how long and when you last played it, its size, and its settings. B or Start closes it.
- Start on an app (its tile, or its card in Recents): what it opens in, when you last opened it, how long it's been open, and an installed program's size, with Show on Home and Update (for programs from Flathub, such as VacuumTube, Kodi and Plex).
- Start works on Steam games too: their playtime, last played, achievements unlocked and size, from Steam's own records, with Open in Steam (the game's page in your library) and Verify files.
- Every window that opens over the screen (Game options, Artwork, the welcome tour, Report a problem, Wi-Fi and Bluetooth, updates, playlists and the rest) now shares one look: warm frosted glass lifted over the dimmed screen, rising in as it opens and sinking away as it closes, with its choices in a lighter box and taller rows.
- Text comes in six sizes throughout, and nothing is smaller than 16px: the dates and names under game cards are easier to read from the couch.
- Settings → Help, with the welcome tour (moved from General) and Report a problem: a QR code that opens a bug report on your phone, on GitHub, with vaporTV's version, the system, your controllers and recent log lines filled in. Describe what went wrong and submit it there (it needs a GitHub account).
- Voice search: tap a remote's Menu button and say a game or app ("Metroid Prime", or "play Halo 2" to start it straight away). It searches every tab and app, and understands speech on this machine, with nothing sent anywhere (the speech model downloads the first time). Hold Menu for Settings. On a controller, press the right stick (R3; change it in Settings → Controller). The background music and ambience pause while search is open, so it can hear you. The search screen also has a mic button and Type.
- City Rain backdrop: a wet street at night, the city's lights reflected in the puddles and rain falling through them. Lighter on the GPU than Rain.
- Grids bend when you scroll fast: hold a direction and the middle of the screen sinks away (or swells toward you going back up) with the cards curving along it, flattening when you let go (after Codrops' infinite WebGL gallery). Stepping one card at a time leaves them flat and easy to read.
- Cards lean with the scroll: a row's cards tilt sideways as it slides, easing flat when it stops (after the carousel in Codrops' WebGPU page-transitions demo).
- The selected card tips the way you moved and settles, then sways gently while you stay on it; its shadow moves with it.
- Time played on the game cards, after the date: Steam's own count for Steam games and shortcuts, and vaporTV's for the console games it starts (counted from now on; time asleep isn't counted).
- Files: a new app in the Apps tab (Y puts it on Home) for browsing your home folders and any USB drive or SD card from the controller, full screen. A on a file shows Open, Cut and Copy under it; something cut or copied pastes from a row at the top of any folder (between drives too, with its progress). Open shows a picture (left and right for the folder's others), a video or a song (A pauses, left and right skip 10 seconds, L1 and R1 the previous or next file); the background music waits while one plays.
- Preview a song before choosing it: Settings → Music → Songs has a play button on each (Right from the song). It plays up to 30 seconds while the background music and ambience pause.
- Music playlists: Settings → Music → Playlists makes and edits them (name, shuffle or in order, which tracks); choose one like a track. A Chris Zabriskie playlist comes built in.
- Seven built-in music tracks by Chris Zabriskie (CC BY 4.0), credited beside each one in Settings → Music.
- Game options: press Start on a console game to rename it, pick which emulator opens it (any installed RetroArch core for that console), replace its art, or delete it from the drive (press A twice; can't be undone). G on a keyboard.
- NES, SNES, Genesis, 32X and Amiga tabs: games from EmuDeck's roms/nes, snes, genesis, sega32x and amiga open in RetroArch (Mesen, Snes9x, Genesis Plus GX, PicoDrive and PUAE).
- A Saturn tab: Sega Saturn games (from EmuDeck's roms/saturn, zipped or not) open in RetroArch's Kronos core, multi-disc games as a disc list.
- An N64 tab: Nintendo 64 games (from EmuDeck's roms/n64) open in RetroArch's Mupen64Plus-Next core.
- A Wii U tab: Wii U games (title folders in EmuDeck's roms/wiiu) open in Cemu, named as the games name themselves.
- PSX and PSP tabs: PlayStation games (roms/psx) open in DuckStation, multi-disc games as a disc list so it can change discs; PSP games (roms/psp) open in PPSSPP.
- Background sound in two layers: music, with ambience under it, each with its own track (or Shuffle, for all of them in random order) and volume.
- Three more built-in ambiences, alongside Rain: Crickets, Ocean waves and Birdsong (CC0, from freesound.org).
- Settings → Music → Add your own: pick an audio file from a USB drive, SD card or this machine, say whether it's music or ambience, and vaporTV copies it in.
- Settings → Backdrop → Your videos: add your own videos (or pictures) from a USB drive, SD card or this machine, then loop one or shuffle them all, fading from one to the next. Leave any out of the shuffle, or remove them.
- Settings → Tabs: put each tab in the top bar or under More, in any order, or switch it off (Home always comes first).
- An Xbox tab: original Xbox games (from EmuDeck's roms/xbox) open in xemu.
- A Wii tab: Wii games (from EmuDeck's roms/wii) open in Dolphin.
- The top bar shows up to ten tabs; past that, a More tab opens a second row with the rest.

### Changed
- vaporTV's own lettering is kept for the top bar and titles; names, menus, buttons and labels are now in a plainer bold type, in their own case, so they're easier to read.
- Select now shows what each button does, in a line along the bottom of the screen (H on a keyboard; press again to hide), and Game options moves to Start. An arcade game's core is picked in Game options instead, so the separate core picker is gone.
- Thicker controller button icons.
- The on-screen keyboard is now a tray along the bottom of the screen that slides up, laid out like Steam's, with its controller shortcuts: X deletes, Y types a space, L2 is Shift, R2 switches to symbols and Start is Enter (each shown on its key). Searching shows what you type, and its results, as you type.
- In grids the selected card's row stays near the middle of the screen as you move up and down, instead of near the bottom (it stops at the top and the end of the page).
- More's row: up from one of its tabs goes to the tab above it in the top bar, and down from a top-bar tab (while the row is open) to the one below it, instead of always back to More.
- The settings and power icons are the height of the tab names, and sit a little further out.
- Settings has a new look: the categories in a panel on the left, each group of settings in its own panel on the right, and the backdrop dimmed behind them.
- The tab you're on is gold and glowing, without an underline.
- Games without art show their name on a black band across the card.

### Fixed
- Kodi (and Plex) close once you're back in vaporTV, however you got there; Kodi could be left running unseen behind it.
- Controller and remote wake, and Netflix remote control, now survive SteamOS updates, which had been quietly removing them (3.9.5 did). If a SteamOS update does take them, vaporTV notices as it starts and offers to repair them, with your admin password typed on vaporTV's keyboard.
- Your videos no longer freeze on their last frame: videos (and music) are served so they can seek, which MP4s with their index at the end need to loop.
- Titles with the article moved to the end before a subtitle read properly: "The Legend of Zelda - The Wind Waker", not "Legend of Zelda, The - …".
- When a game is there both released and as a beta or demo, its tab opens the released one.

## 0.9.0

The first public release (a beta): an Android TV-style home screen for SteamOS's Gaming Mode, for your Steam library, emulated consoles and streaming apps, all from the couch.

### Added
- An intro video as vaporTV opens; any button skips it. Choose it, turn it off, or use your own (any video in `~/Videos/vaporTV Intros`) in Settings → General → Intro.
- Setup can make the vaporTV intro Steam's startup movie, so the box boots into it (vaporTV then skips its own copy straight after).
- The screensaver shows the vaporTV logo in its top-right corner (it shifts a few pixels every minute, so it can't burn into the screen).
- The top bar stays in place while the page scrolls; what's below it fades out as it passes under.
- A remote's Back (Backspace) works in YouTube, which only goes back on Escape.
- A PS2 tab: your PS2 games (from EmuDeck's roms/ps2) open in PCSX2, with covers, favourites and Recently played.
- Steam Deck in your hands: vaporTV fills its taller screen, shows the battery under the clock, slows the live backdrops to save power on battery, and rows and pages scroll with a swipe.
- Settings and power sit at either end of the top bar, with the tabs centred between them.
- Updates: vaporTV checks for new versions, shows what changed in each one since yours, and installs it from the couch (Settings → General → Updates).
- Netflix's arrow-key controls install with the rest of setup (it asks for the admin password once, along with controller wake).
- A Sofabaton (or other remote) can open Steam's menu with F11, and its Home button closes apps.
- Kodi can be set up from the apps list, for watching an Emby library.
- Games and apps without artwork get a proper background behind their name instead of a blank card.

### Changed
- App tiles and their small card icons now come from SteamGridDB (with your key in Settings → Artwork) instead of being built in; without a key, a tile shows the app's name.

### Fixed
- Console tabs show what you just played under Recently played as soon as you're back from the game.
- Home no longer mistakes vaporTV's own background helpers for a game, which could leave YouTube open.
- Netflix: the arrows move between profiles on "Who's watching?".
- Kodi (and other apps vaporTV opens itself) no longer keep running unseen after you go back to vaporTV through Steam's menu.

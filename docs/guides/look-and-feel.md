# Making it yours

Change what's behind vaporTV, what the screensaver shows, what sits in Home's corners, and the sounds under it all.

## Backdrops

The moving picture behind vaporTV is its **backdrop**. Choose it in **Settings → Backdrop**. There are two:

- **Home backdrop** is what Home shows. **Same as the tabs** gives Home the same as everywhere else.
- **Tabs backdrop** is what every other screen shows: the tabs, More and Settings.

So Home can be a quiet sea while the tabs show something busier, or the other way round.

| Backdrop | What it is |
|---|---|
| **Sea** | The sea, following the time of day |
| **City Rain** | A wet street at night, the city in a puddle |
| **Forest** | A walk through a pine forest, following the time of day |
| **Northern Lights** | A snowy valley under the aurora, always at night |
| **Gradient Drift** | Colours drifting behind ribbed glass |
| **Chromatic Waves** | Colour-split lines rolling on navy |
| **Star Tunnel** | Drifting down a tube of stars |
| **Your videos** | Your own videos and pictures (see below). Shown once you've added one |

Some backdrops have their own settings, which appear under the lists while that backdrop is chosen:

- **Backdrop time of day** (Sea and Forest): **Auto** follows the clock, or pin it to **Dawn**, **Day**, **Sunset** or **Night**.
- **Gradient Drift colours**: Molten, Deep sea, Neon, Aurora, Sunset, Forest, Twilight, or **Random** for a different one each start. **Gradient Drift ribs** runs the glass **Vertical** or **Horizontal**.
- **Star Tunnel colours**: Nebula, Starlight, Ice or Ember.

### Consoles

**Consoles** is the first choice under **Tabs backdrop**. With it on:

- **Apps** shows a plasma TV on a walnut stand, the vaporTV logo on its screen and a figure holding a controller beside it, in 3D.
- The console tabs (and Steam, Arcade, Video and Music), More and Settings show Home's backdrop.

Choose any other Tabs backdrop to show that on every tab instead.

**Console backdrops** sets how sharp the 3D consoles are drawn (the Apps TV, and the Consoles screensaver):

| Choice | What it means |
|---|---|
| **High** | Sharp, at the full resolution of your screen |
| **Medium** | Drawn at 1080p and scaled up: less work on a 4K TV |
| **Low** | Softer, and at most 30 frames a second: least work |

### Spinning consoles

Each tab with a list down its left shows its own console turning slowly at the top of the list: a Steam Deck on Steam, a Taito Egret 29 cabinet on Arcade, a pile of VHS tapes on Video, and each console on its own tab. On the **More** screen, the tile you rest on turns too.

On a slower machine, switch off **Settings → Backdrop → Spinning consoles**. The lists then show just the console's logo.

## Your own videos and pictures

You can use your own videos or pictures as the backdrop.

1. Go to **Settings → Backdrop → Add your own** and choose **Add a picture or video**.
2. Pick the file from a USB drive, an SD card or the box itself.
3. vaporTV copies it into `~/Pictures/vaporTV Backdrops` and shows it straight away. Videos play muted, on a loop.

Pictures can be JPG, PNG, WebP, GIF or AVIF; videos MP4, WebM, MKV, MOV or M4V.

Once you've added one, **Your videos** is a choice under **Home backdrop** and **Tabs backdrop**. While it's chosen, more settings appear:

- **Your videos**: pick one to loop (a video fades back into its start), or **Shuffle** to play them all in random order, fading from one to the next.
- **In the shuffle**: switch off any you'd rather not see in the shuffle. They stay in the list to loop on their own.
- **Remove a video**: pick one and choose **Remove**. It's deleted from `~/Pictures/vaporTV Backdrops`, and can't be undone.

> **Tip:** a short, slow video that starts and ends on a similar picture loops best.

## Screensaver

The screensaver starts when nothing has been pressed for a while, only while vaporTV is on screen. Any button wakes it. Set it up in **Settings → Screensaver**.

- **Test the screensaver**, at the top, starts it now as you've set it up.
- **Screensaver** sets when it starts: **Off**, or after **5**, **10**, **15** or **30 minutes**.
- **Style** sets what it shows:

| Style | What it shows |
|---|---|
| **Slideshow** | Game art and your photos |
| **Living backdrop** | The backdrop, with a big clock |
| **Consoles** | Each of your consoles in turn, 5 seconds apiece |
| **Clock & weather** | The clock and temperature, on black |

For every style but Slideshow, **Clock position** puts the clock in the **Top left**, **Bottom left** or **Center**, or **Moving**, a new spot every minute. Moving is safest for OLED TVs.

### The slideshow

**Slideshow pictures** chooses what's mixed in:

- **Game art**: banners from your Steam and console games.
- **Steam screenshots**: ones you take in games.
- **Your photos**: pictures in your screensaver folder, `~/Pictures/Screensaver`. Each folder inside it is shown as an album.

Switch on **Photo details** to show when each of your photos was taken, and its album. While the slideshow runs, the D-pad steps back and forward through the pictures without ending it.

With nothing switched on, or nothing to show, you get the clock instead.

## Home

**Settings → Home** sets out the Home screen.

### The top corners

**Top left corner** and **Top right corner** each show one of these, or **Nothing**. Each choice shows how it will look.

- **Temperature & date**
- **Time**
- **Date**
- **Weather**
- **vaporTV logo**, its colours drifting
- **Battery** (on a device with one, such as a Steam Deck)
- **CPU use**, **CPU temperature**, **GPU use** and **GPU temperature**

**CPU & GPU temperature** chooses **Celsius** or **Fahrenheit** for those two.

The weather's place and unit are in **Settings → General → Weather**. **Location** is guessed from your internet address; choose it to type a town or city instead, or go back to **Automatic**. **Temperature** is **Automatic** (by country), **Fahrenheit** or **Celsius**.

### Home's rows

- **Home recents layout**: **Rows** (poster art, scroll sideways) or **Grid** (wide art, scroll down).
- **Favorite apps layout**: **Carousel** (one row, scroll sideways) or **Grid** (two rows, scroll down). To choose which apps are there, open the **Apps** tab, pick an app and press **Y** to put it on Home or take it off.
- **Game playlists**: your own lists of games, each a row on Home, a list on a console's tab, or both. Pick one to choose where it shows (**Show on**) and to take games out; **New playlist** makes one. Press **X** on a game to put it in one.

Two more rows turn up on their own:

- **Continue watching**: films and episodes you're part way through, once you've connected a media server (see [The Video tab](video.md)).
- **Music**: your liked songs, favourite albums and any playlist you've set to **Show on Home** (see [The Music tab](music.md)).

## Tabs

**Settings → Tabs** chooses which tabs are in the **Top bar** (up to nine, with Home always first), which go on the **More** screen, and which are **Off**. A picks a tab up; up and down move it.

## Sound

Background sound plays in two layers: music, with **ambience** under it. Both are in **Settings → Music & sounds**.

- **Ambience**: the sounds of a place under the music. Four come with vaporTV: **Rain**, **Crickets**, **Ocean waves** and **Birdsong**. Choose one, **Shuffle** for all of them, or **None**.
- **Add a sound** copies an audio file from a USB drive, SD card or the box into the `Ambience` folder of your music (`~/Music/Ambience`), to choose under Ambience.
- **Music volume** and **Ambience volume** are each **Low**, **Medium** or **High**.
- **Now playing bar**: the row under the top bar with the song playing. **Shows as each song starts**, **Always open**, or **Never**.

For background music itself, see [The Music tab](music.md).

## The intro

**Settings → General → Intro** chooses the short video that plays as vaporTV starts: **vaporTV**, **Off**, or one of your own. Put a video in `~/Videos/vaporTV Intros` and it's listed there too. **Play now** shows it.

## If something's wrong

- **A setting described here isn't there:** some only show while they apply. A backdrop's own settings appear only while it's chosen, **Clock position** only for styles other than Slideshow, and **Your videos** only once you've added one.
- **The backdrop or consoles are slow or stutter:** set **Console backdrops** to **Medium** or **Low**, switch off **Spinning consoles**, or pick a lighter backdrop such as City Rain.
- **A backdrop doesn't show and the sea is there instead:** that backdrop couldn't run on this machine, so vaporTV put the sea in its place.
- **The weather is for the wrong town:** choose your town in **Settings → General → Weather → Location**.
- **Your photos aren't in the slideshow:** check they're in `~/Pictures/Screensaver` and **Your photos** is on under **Slideshow pictures**.

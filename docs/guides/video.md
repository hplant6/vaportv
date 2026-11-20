# The Video tab

Watch the films and shows on your own Emby or Jellyfin server from vaporTV: what you're part way through, what's new, and every library, played full screen with the controller.

## How it works

vaporTV doesn't keep a film library of its own. Your **media server** (Emby or Jellyfin, on a computer or NAS at home) does that: it holds the video files, works out what each one is, and fetches its poster, summary, cast and ratings. vaporTV signs in to the server, shows what it has, and plays it.

So everything about *what's in* your library (adding films, fixing a wrong poster, a show's episodes in the wrong order) is done on the server. Everything about *watching* is done in vaporTV.

## 1. Connect your server

1. Open **Settings → General → Connect your media library**.
2. vaporTV looks for Emby and Jellyfin servers on your network and lists them. Pick yours. If it isn't there (it's somewhere else, or your network hides it), choose **Add a server by its address** and type its address, such as `192.168.1.38` (port 8096 unless you add another).
3. Type your user name, then your password, on vaporTV's keyboard.

vaporTV keeps only the sign-in the server gives back, never your password. You can sign in to several servers: they're shown together. **Sign out** is beside each one in the same place.

Once you're signed in, the **Video** tab appears in the top bar, after Apps. (Move it, or put it under More, in **Settings → Tabs**.)

## 2. Adding your own videos

You add films and shows to the **server**, and they turn up in vaporTV by themselves.

1. Copy the video files into a folder your server's library points at (set up in the server's dashboard, under **Libraries**).
2. Name them the way the server expects, so it can tell what they are:
   - **Films:** a folder per film, named with its year: `Movies/Blade Runner (1982)/Blade Runner (1982).mkv`
   - **Shows:** a folder per show, then one per season, and the episode number in each file's name: `Shows/Twin Peaks/Season 01/Twin Peaks S01E01.mkv`
3. The server scans its folders now and then. To see them straight away, use **Scan Library Files** (Emby) or **Scan All Libraries** (Jellyfin) in its dashboard.

The server then matches each file to the film or show it is, online, and downloads its art and details. That's what you see in vaporTV.

> **Tip:** if a film comes up with the wrong poster or name, fix it in the server's web app: open the film and choose **Identify** to pick the right one. vaporTV shows the change the next time the tab loads.

**Rotten Tomatoes scores** come from your server too, where it has them: Emby and Jellyfin fetch them from OMDb along with the rest of a film's details.

## The Video tab

The list down the left (**L2** hides it, for a bigger grid) has:

| List | What's in it |
|---|---|
| **Continue watching** | Films and episodes you're part way through, newest first |
| **Next up** | The next episode of each show you're watching |
| **Recently added** | The newest on your server |
| **Favorites** | What you've starred |
| **Libraries** | Each of your server's libraries of films and shows. With several servers, each says which it's on |
| **Playlists** | Your Video playlists, if you've made any |

Big libraries load a page at a time as you scroll, so thousands of films stay quick.

- **Sort** orders Favorites and the libraries by **Name**, **Date added**, **Release date**, **Last played** or **Rating**.
- **Show unwatched only** leaves out what you've finished.
- Rest on a poster and its name, length and score slide up over it. A gold line shows how far into it you are, a tick that you've watched it, and a number how many episodes of a show are left.

**Continue watching** is on Home too, so you can carry on with one press.

## Shows

**A** on a show opens its page: its backdrop, years and summary, its seasons along the top, and that season's episodes. It opens on the next episode to watch, with the cursor on it.

- **L1 / R1** step through the seasons.
- **A** plays an episode from where you stopped.
- **B** goes back to the tab.

## Details, favourites and playlists

- **Start** on any film, show or episode (on the Video tab, a show's page, or Home) opens its details: year, length, rating, genres and summary, then **Resume**, **Play from the start**, **Mark as watched** (for a show, every episode) and **Add to favorites**.
- **Y** stars or unstars it straight away.
- **X** puts it in a playlist: a **Home** playlist (which can mix films and episodes with games) or a **Video** playlist, which gets its own list on the Video tab.

Favourites and what you've watched are saved on your server, so its own apps see them too.

## Playing

**A** plays a film or episode from where you stopped. vaporTV plays it in **mpv**, a video player it installs from Flathub the first time (you'll see it download). mpv plays the server's file as it is, with the box's graphics chip doing the work, so your server doesn't have to convert anything, even 4K and H.265 films.

vaporTV draws its own controls over the picture:

| Button | What it does |
|---|---|
| **A** | Play / pause |
| **D-pad left / right** | Scrub along the seek bar (faster the longer you hold); it jumps there when you let go |
| **D-pad down** | The buttons under the bar: Stop, back 10 seconds, play/pause, on 10 seconds, Audio & subtitles, Controller shortcuts |
| **L2 / R2** | 10 seconds back / on |
| **Y** | Audio & subtitles |
| **B** | Stop (or close Audio & subtitles) |
| **Hold Select + Start** | Stop, and back to vaporTV |

**Audio & subtitles** picks another language or turns subtitles on, carrying on from the same moment. **Controller shortcuts** shows this list with your own controller's buttons.

A TV remote works too: OK plays and pauses, left and right scrub, Back stops, and a remote's play, pause, stop, rewind and fast-forward keys do what they say.

When you stop, vaporTV tells the server where you got to, so Continue watching (and the server's own apps) pick up from there.

## If something's wrong

- **The Video tab isn't in the top bar:** you're not signed in to a server yet (see **Connect your server**), or it's under **More** or switched off in **Settings → Tabs**.
- **Your server isn't found:** add it by its address. On the server's computer, its dashboard shows the address; check the box and the server are on the same network.
- **A film is missing:** check it's in a folder one of the server's libraries points at, then scan the library on the server.
- **Wrong poster, name or year:** fix it on the server with **Identify** (see **Adding your own videos**).
- **A film won't play:** if mpv can't start, vaporTV plays it in its own player instead, with the server converting what the TV can't play. If nothing plays at all, use **Settings → Help → Report a problem**.

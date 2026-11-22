# Claude on vaporTV

Talk to Claude through your TV, and let it make voice search and your music smarter: it needs Claude Code on the box, signed in with your phone.

## What you need

- **Claude Code**, Anthropic's Claude app for the command line, installed on the box.
- A **Claude account** whose plan includes Claude Code. Everything below uses that plan's usage.

Without Claude Code, vaporTV works as it always has: the **Claude** app says it isn't installed, and voice search and music search go by names alone.

## 1. Install Claude Code

1. Switch to Desktop Mode and open **Konsole**.
2. Run Anthropic's installer:

   ```
   curl -fsSL https://claude.ai/install.sh | bash
   ```

3. Go back to Gaming Mode.

It installs to `~/.local/bin/claude`, where vaporTV looks for it. Over SSH works just as well.

## 2. Sign in with your phone

1. Open the **Apps** tab and pick **Claude**.
2. If Claude Code isn't signed in yet, a QR code comes up under **Sign in to Claude**. Scan it with your phone (on the same Wi-Fi as the TV).
3. On your phone, tap **Sign in to Claude**, sign in with your Claude account, and copy the code it shows.
4. Go back to the first page, paste the code and tap **Finish**.

The TV says **Signed in.** and starts listening. The page is only on your home network, and stops after 15 minutes.

## The Claude app

**Apps → Claude** opens a conversation. It starts listening straight away: wait for **Listening · talk now**, then talk. Pause, or press the button, to send. Claude answers in a sentence or two, out loud and in large type.

When it's done, it listens again, so you can carry on talking. If you say nothing for a while, it stops and shows **Press to talk**.

| Button | What it does |
|---|---|
| **A** on the big button, **R3**, or a remote's **Menu** | Talk. While it's listening, send. While it answers, talk over it |
| **X** | Stop speaking this reply (it's still written out) |
| **D-pad up / down** | Scroll the conversation |
| **D-pad left / right** | Move between the speaker button, the stop button, the talk button and **New chat** |
| **B** | Close (or **Deny**, when Claude is asking) |

- The **speaker button** turns speaking on and off. Off, replies are only written. vaporTV remembers your choice.
- **New chat** starts a fresh conversation. Otherwise the conversation is kept while vaporTV runs, even if you close the app.
- Background music pauses while the app is open, and the screensaver stays away.

### The voice

Claude speaks with **Kokoro**, a natural-sounding voice that runs on the box itself. It downloads the first time something is spoken (about 350 MB), so the first reply takes a little longer. Speaking Japanese works too: it hears English or Japanese by itself, and answers Japanese in a Japanese voice (in kana; ask it to translate and it will pass your words to someone else and theirs back). Speech recognition downloads the first time too: you'll see **Getting speech recognition ready (first time only)…**.

## What it can do

- **Answer questions.** It searches the web when the answer depends on current or specific facts.
- **Look into problems on the box.** It can read vaporTV's log and settings, check what's running, and fix things in your home folder.
- **Change vaporTV itself.** See **Changing vaporTV** below.

While it works, the launch spinner turns with a line saying what it's doing, such as **Searching the web…** or **Reading input.log…**.

### When it asks first

Reading files and searching the web always go ahead. Ordinary commands and edits go ahead too: Claude Code's own safety check stops anything risky.

Anything Claude Code still wants your OK for comes up on the TV under **Claude wants to**, with what it would do and the command or file underneath. It also asks out loud: "Can I go ahead?"

- **Allow** lets it carry on.
- **Deny** (or **B**) says no. Claude doesn't try another way: it asks what you'd like instead.

### Changing vaporTV

Claude can fix and change vaporTV's own code. This is for tinkerers: it needs a copy of vaporTV's code at `~/Projects/vaportv` (from GitHub, with `git`), and the tools to build it. Without that copy, Claude tells you it can't change code.

- At the start of each conversation, the copy is brought up to date from GitHub, so a change is made to the latest code. If it has unfinished changes from an earlier conversation, it isn't updated, and Claude asks whether to keep them.
- Claude builds and installs the new version itself. This takes several minutes.
- The new version starts the next time vaporTV starts, so restart vaporTV when Claude says it's done.
- Claude saves its changes in the copy on the box (git commits), but never sends them to GitHub.

## Claude elsewhere in vaporTV

Once Claude Code is installed and signed in, it helps in other places too:

- **Voice search** (**R3**, or a remote's **Menu**) asks Claude which game or app you meant: a half-heard title, a game described ("the blue hedgehog one"), or a kind of thing ("something co-op"). If Claude doesn't answer within a few seconds, you get the usual results by name.
- **Music** voice search, on the Music tab: ask for music by kind as well as by name ("play all my vintage Japanese music").
- **Radio:** **Start radio (Claude picks songs like it)** in a song's menu, or Now playing's radio button, plays a station of songs like it from your library. **Thumbs down** keeps a song off stations for good, and each new station hears what you've liked and turned down.
- **Playlists** made from a spoken request: "make me a playlist of late-night city pop". Claude chooses the songs and names it.
- **Background music** can be **A station from your likes**, in **Settings → Music & sounds**.

The music guide, [The Music tab](music.md), has the details.

## What Claude sees

What you say, and what Claude reads on the box to answer, goes to Anthropic through Claude Code, under your Claude account. For voice search and music, that includes the names of your games and apps and the albums in your music library. [Privacy](privacy.md) lists exactly what goes where.

## If something's wrong

- **"Claude Code isn't installed on this box":** install it (see **Install Claude Code**), then open the app again. vaporTV looks in `~/.local/bin`.
- **The phone can't open the sign-in page:** the phone has to be on the same Wi-Fi as the TV. **This box isn't on a network** means the box itself isn't connected.
- **"That code didn't work":** each code works once. Tap **Sign in to Claude** again on your phone for a new code, and paste that one.
- **"Sign-in timed out":** the page stops after 15 minutes. Choose **Try again** for a new QR code.
- **"Claude Code isn't signed in on this box":** the sign-in has expired. The QR code comes up again: sign in as before.
- **"Claude is busy or the usage limit was reached":** try again in a little while.
- **It doesn't hear you:** wait for **Listening · talk now** before you speak. **Starting the mic… wait a moment** means it isn't recording yet.
- **Replies aren't spoken:** check the speaker button isn't struck through.
- **No Start radio in a song's menu:** radio needs Claude Code on the box and some music of your own.
- **A change Claude made isn't showing:** restart vaporTV.
- **Anything else:** use **Settings → Help → Report a problem**.

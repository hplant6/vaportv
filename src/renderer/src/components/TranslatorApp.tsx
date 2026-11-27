import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TranslatorSettings, TranslatorStatus, VoiceState } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { CLAUDE_QUIET_EVENT, CLAUDE_TALK_EVENT, focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { ButtonIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { MUSIC_HOLD_EVENT } from './MusicPreview'
import { useSoundHold } from '../soundHold'

// The translator (an extra, not in the public build): an English ⇄ Japanese conversation
// between two people on the sofa. Choose who starts; it calls them by name and listens; what
// they say is translated and spoken in the other language; then it's the other one's turn.
// A (or R3, or a remote's Menu) talks, sends, or cuts the speaking short; X stops speaking;
// the buttons beside it switch whose turn it is, say the last line again, and open the
// settings (the Japanese voice, what the English speaker's words call the other, how politely). B closes.
// It's the Claude app's screen underneath (claude-app), so R3 and X reach it the same way.

/** AppTile fires this for the Translate tile (detail: the tile, to come back to). */
export const TRANSLATOR_EVENT = 'steamtv:translator'

const SCROLL_PX = 240

type Lang = 'en' | 'ja'

interface Line {
  from: Lang
  said: string
  translation: string
}

type Phase = 'checking' | 'setup' | 'installing' | 'pick' | 'idle' | 'listening' | 'hearing' | 'translating' | 'speaking'

/** Kept while the screen is closed, as the conversation is (until New conversation). */
let saved: Line[] = []

const other = (lang: Lang): Lang => (lang === 'en' ? 'ja' : 'en')

const ADDRESS: TranslatorSettings['address'][] = ['okaasan', 'mother', 'name']
const addressLabel = (s: TranslatorSettings, a: TranslatorSettings['address']): string => (a === 'okaasan' ? 'お義母さん' : a === 'mother' ? 'お母さん' : s.themJa)

export function TranslatorApp() {
  const [from, setFrom] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => setFrom((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener(TRANSLATOR_EVENT, onOpen)
    return () => window.removeEventListener(TRANSLATOR_EVENT, onOpen)
  }, [])
  const close = useCallback(() => {
    setFrom((tile) => {
      if (tile?.isConnected) requestAnimationFrame(() => focus(tile))
      return null
    })
  }, [])
  return from ? <Translator onClose={close} /> : null
}

function Translator({ onClose }: { onClose: () => void }) {
  // Music well down, a film paused, while it's open.
  useSoundHold()
  const root = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const talkButton = useRef<HTMLButtonElement>(null)
  const [lines, setLinesState] = useState<Line[]>(saved)
  const [phase, setPhaseState] = useState<Phase>('checking')
  const phaseRef = useRef<Phase>('checking')
  const [turn, setTurnState] = useState<Lang>('en')
  const turnRef = useRef<Lang>('en')
  const [status, setStatus] = useState<TranslatorStatus | null>(null)
  const settingsRef = useRef<TranslatorSettings | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  const [micReady, setMicReady] = useState(false)
  const micReadyRef = useRef(false)
  const [heardSpeech, setHeardSpeech] = useState(false)
  const heardSpeechRef = useRef(false)
  /** Counts what's been cut short (closing, switching turns): work started before it is dropped when it comes back. */
  const generation = useRef(0)
  const family = useControllerFamily()

  const setPhase = (next: Phase): void => {
    phaseRef.current = next
    setPhaseState(next)
  }
  const setTurn = (next: Lang): void => {
    turnRef.current = next
    setTurnState(next)
  }
  const setLines = (update: (l: Line[]) => Line[]): void =>
    setLinesState((l) => {
      saved = update(l)
      return saved
    })
  const settings = status?.settings
  const nameOf = (lang: Lang, s = settings): string => (!s ? '' : lang === 'en' ? s.you : s.themJa)

  const listen = useCallback((): void => {
    const s = settingsRef.current
    if (!s) return
    setNote(null)
    micReadyRef.current = false
    setMicReady(false)
    heardSpeechRef.current = false
    setHeardSpeech(false)
    talkButton.current?.style.setProperty('--level', '0')
    setPhase('listening')
    const lang = turnRef.current
    window.steamtv.startVoice('translation', { language: lang, prompt: lang === 'en' ? `${s.you}, ${s.them}.` : `${s.themJa}、${s.youJa}。` })
  }, [])

  /** Says something, then (unless cut short meanwhile) carries on with `then`. */
  const sayThen = useCallback(async (text: string, lang: Lang, then: () => void): Promise<void> => {
    const at = generation.current
    setPhase('speaking')
    try {
      await window.steamtv.translator.say(text, lang)
    } catch (err) {
      if (at === generation.current) setNote(errorText(err))
    }
    if (at === generation.current) then()
  }, [])

  /** Someone's turn: say their name (when it's asked for) and listen to them. */
  const startTurn = useCallback(
    (lang: Lang, callOut: boolean): void => {
      const s = settingsRef.current
      if (!s) return
      generation.current++
      window.steamtv.stopVoice()
      window.steamtv.translator.quiet()
      setTurn(lang)
      if (callOut) void sayThen(lang === 'en' ? `${s.you}, go ahead.` : `${s.themJa}、どうぞ。`, lang, listen)
      else listen()
    },
    [listen, sayThen]
  )

  /** What was heard: translated, shown, said in the other language; then it's the other one's turn. */
  const translateHeard = useCallback(
    async (text: string): Promise<void> => {
      const at = generation.current
      const lang = turnRef.current
      setPhase('translating')
      let translation: string
      try {
        translation = await window.steamtv.translator.translate(text, lang)
      } catch (err) {
        if (at !== generation.current) return
        setNote(errorText(err))
        return setPhase('idle')
      }
      if (at !== generation.current) return
      if (!translation || translation === '???') {
        // Not understood: ask the same person again, in their own language.
        return void sayThen(lang === 'en' ? 'Sorry, could you say that again?' : 'すみません、もう一度お願いします。', lang, listen)
      }
      setLines((l) => [...l, { from: lang, said: text, translation }])
      void sayThen(translation, other(lang), () => {
        setTurn(other(lang))
        listen()
      })
    },
    [listen, sayThen]
  )

  /** The big button, R3 and a remote's Menu: talk, send what's been said, or cut the speaking short. */
  const talk = useCallback((): void => {
    const now = phaseRef.current
    if (now === 'checking' || now === 'setup' || now === 'installing' || now === 'pick' || now === 'translating' || now === 'hearing') return
    play('talk')
    if (now === 'listening') {
      if (!micReadyRef.current) return
      window.steamtv.finishVoice()
      if (heardSpeechRef.current) setPhase('hearing')
      return
    }
    if (now === 'speaking') {
      // Cut short: whoever's turn comes next starts now (as if it had finished).
      window.steamtv.translator.quiet()
      return
    }
    listen()
  }, [listen])

  const quiet = useCallback((): void => {
    if (phaseRef.current === 'speaking') window.steamtv.translator.quiet()
  }, [])

  /** Say the last line again (in the language it was said in to the listener), then carry on listening to whoever's turn it is. */
  const repeat = (): void => {
    const last = saved[saved.length - 1]
    if (!last || phaseRef.current === 'translating') return
    generation.current++
    window.steamtv.stopVoice()
    window.steamtv.translator.quiet()
    void sayThen(last.translation, other(last.from), listen)
  }

  const newConversation = (): void => {
    generation.current++
    window.steamtv.stopVoice()
    window.steamtv.translator.quiet()
    window.steamtv.translator.reset()
    setLines(() => [])
    setShowSettings(false)
    setNote(null)
    setPhase('pick')
  }

  const change = async (changes: Partial<TranslatorSettings>, sample?: boolean): Promise<void> => {
    play('move')
    const next = await window.steamtv.translator.saveSettings(changes)
    settingsRef.current = next
    setStatus((s) => (s ? { ...s, settings: next } : s))
    if (sample) {
      generation.current++
      window.steamtv.stopVoice()
      void sayThen(`${next.themJa}、こんにちは。この声で話します。`, 'ja', () => setPhase('idle'))
    }
  }

  const installVoice = (): void => {
    setPhase('installing')
    setProgress('Starting the download…')
    window.steamtv.translator
      .installVoice()
      .then(() => {
        setProgress(null)
        setStatus((s) => (s ? { ...s, voiceInstalled: true } : s))
        window.steamtv.translator.setOpen(true)
        setPhase(saved.length ? 'idle' : 'pick')
      })
      .catch((err: unknown) => {
        setProgress(null)
        setNote(errorText(err))
        setPhase('setup')
      })
  }

  // Open: hold the music and the screensaver, start the Japanese voice, then choose who starts (or carry on).
  useEffect(() => {
    window.steamtv.translator.setOpen(true)
    window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
    const holder = {}
    keepAwake(holder, true)
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    window.steamtv.translator
      .status()
      .then((st) => {
        setStatus(st)
        settingsRef.current = st.settings
        if (!st.claudeInstalled || !st.signedIn || !st.voiceInstalled) return setPhase('setup')
        if (saved.length) {
          setTurn(other(saved[saved.length - 1].from))
          setPhase('idle')
        } else setPhase('pick')
      })
      .catch((err: unknown) => {
        setNote(errorText(err))
        setPhase('setup')
      })
    const gen = generation
    return () => {
      gen.current++
      window.steamtv.stopVoice()
      window.steamtv.translator.setOpen(false)
      window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
      keepAwake(holder, false)
    }
  }, [])

  // The cursor goes to the first button of whatever's showing (when that changes, not on every phase of a turn).
  const view = showSettings ? 'settings' : phase === 'pick' || phase === 'setup' || phase === 'checking' || phase === 'installing' ? phase : 'talk'
  useEffect(() => {
    const first = root.current?.querySelector<HTMLElement>(
      view === 'settings' ? '.translator-settings [data-focusable]' : view === 'talk' ? '.claude-talk' : '.translator-pick [data-focusable]'
    )
    if (first) focus(first)
  }, [view])

  useEffect(() => {
    const offVoice = window.steamtv.onVoice((state: VoiceState, purpose) => {
      if (purpose !== 'translation') return
      if (state.phase === 'preparing') setNote('Getting speech recognition ready (first time only)…')
      else if (state.phase === 'listening') {
        micReadyRef.current = true
        setMicReady(true)
      } else if (state.phase === 'thinking') setPhase('hearing')
      else if (state.phase === 'heard') {
        setNote(null)
        void translateHeard(state.text)
      } else if (state.phase === 'error') {
        if (phaseRef.current === 'listening' || phaseRef.current === 'hearing') setPhase('idle')
        if (!/didn['’]t hear anything|didn['’]t catch that/i.test(state.message)) setNote(state.message)
      }
    })
    const offLevel = window.steamtv.onVoiceLevel((level, speech) => {
      if (phaseRef.current !== 'listening') return
      talkButton.current?.style.setProperty('--level', level.toFixed(3))
      heardSpeechRef.current = speech
      setHeardSpeech(speech)
    })
    const offEvent = window.steamtv.translator.onEvent((event) => {
      if (event.type === 'installing')
        setProgress(event.unpacking ? 'Unpacking…' : `Downloading the Japanese voice: ${Math.round(event.done / 1e6)} of ${Math.round(event.total / 1e6)} MB`)
    })
    const offTalk = window.steamtv.translator.onTalk(talk)
    window.addEventListener(CLAUDE_TALK_EVENT, talk)
    window.addEventListener(CLAUDE_QUIET_EVENT, quiet)
    return () => {
      offVoice()
      offLevel()
      offEvent()
      offTalk()
      window.removeEventListener(CLAUDE_TALK_EVENT, talk)
      window.removeEventListener(CLAUDE_QUIET_EVENT, quiet)
    }
  }, [talk, quiet, translateHeard])

  // B closes (or closes the settings); up and down scroll (or move through the settings), left and right move between buttons.
  useEffect(() => {
    const onBack = (): void => (showSettings ? setShowSettings(false) : onClose())
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      const vertical = direction === 'up' || direction === 'down'
      if (vertical && !showSettings) {
        log.current?.scrollBy({ top: direction === 'up' ? -SCROLL_PX : SCROLL_PX, behavior: 'smooth' })
        return
      }
      const scope = showSettings ? '.translator-settings' : phaseRef.current === 'pick' || phaseRef.current === 'setup' ? '.translator-pick' : '.claude-controls'
      const buttons = [...(root.current?.querySelectorAll<HTMLElement>(`${scope} [data-focusable]`) ?? [])]
      const at = buttons.indexOf(document.activeElement as HTMLElement)
      const next = buttons[at + (direction === 'right' || direction === 'down' ? 1 : -1)]
      if (next) {
        play('move')
        focus(next)
      }
    }
    window.addEventListener(TRAP_CLOSE_EVENT, onBack)
    window.addEventListener(OWN_DIRECTION_EVENT, onDirection)
    return () => {
      window.removeEventListener(TRAP_CLOSE_EVENT, onBack)
      window.removeEventListener(OWN_DIRECTION_EVENT, onDirection)
    }
  }, [onClose, showSettings])

  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines])

  const turnName = nameOf(turn)
  const statusLine: Record<Phase, string> = {
    checking: 'Starting…',
    setup: 'Not set up',
    installing: 'Getting the Japanese voice…',
    pick: 'Who’s speaking first?',
    idle: turn === 'en' ? `${turnName} · press to talk` : `${turnName} · ボタンを押して話してください`,
    listening: !micReady ? 'Starting the mic… wait a moment' : heardSpeech ? 'Hearing you · pause or press to send' : turn === 'en' ? `${turnName}, go ahead` : `${turnName}、どうぞ`,
    hearing: 'Got it…',
    translating: 'Translating…',
    speaking: 'Speaking · press to skip'
  }

  const setupText = !status
    ? note ?? ''
    : !status.claudeInstalled
      ? 'Claude Code isn’t installed on this box. The translator uses it to translate.'
      : !status.signedIn
        ? 'Claude Code isn’t signed in on this box. Sign in from the Claude app first, then open this again.'
        : !status.voiceInstalled
          ? 'The Japanese voice (VOICEVOX) isn’t here yet. It’s about 2 GB and only downloads once.'
          : ''

  return (
    <div className="claude-app translator-app" ref={root} data-focus-trap="" data-own-directions="">
      <div className="settings-scrim" aria-hidden="true" />
      <h2 className="claude-title display">Translate</h2>

      <div className="claude-log" ref={log}>
        {phase === 'setup' || phase === 'installing' ? (
          <div className="translator-pick">
            <p className="claude-empty">{phase === 'installing' ? progress : setupText}</p>
            {phase === 'setup' && status?.claudeInstalled && status.signedIn && !status.voiceInstalled && (
              <button className="claude-new display" tabIndex={-1} data-focusable="" onClick={installVoice}>
                Download the Japanese voice
              </button>
            )}
          </div>
        ) : showSettings && settings ? (
          <div className="translator-settings">
            <SettingRow label="Japanese voice" value={status?.voices.find((v) => v.id === settings.voice)?.name ?? String(settings.voice)} onClick={() => {
              const voices = status?.voices ?? []
              const at = voices.findIndex((v) => v.id === settings.voice)
              void change({ voice: voices[(at + 1) % voices.length].id }, true)
            }} />
            <SettingRow label={`${settings.you}’s words call ${settings.them}`} value={addressLabel(settings, settings.address)} onClick={() => void change({ address: ADDRESS[(ADDRESS.indexOf(settings.address) + 1) % ADDRESS.length] })} />
            <SettingRow label={`${settings.you}’s Japanese is`} value={settings.tone === 'polite' ? 'Polite (です・ます)' : 'Casual (family)'} onClick={() => void change({ tone: settings.tone === 'polite' ? 'casual' : 'polite' })} />
            <SettingRow label="Start again" value="New conversation" onClick={newConversation} />
            <p className="translator-credit">Japanese voices: VOICEVOX:No.7, VOICEVOX:東北イタコ</p>
          </div>
        ) : phase === 'pick' && settings ? (
          <div className="translator-pick">
            <p className="claude-empty">Who’s speaking first? · どちらから話しますか？</p>
            <div className="translator-people">
              {(['en', 'ja'] as Lang[]).map((lang) => (
                <button key={lang} className="translator-person display" tabIndex={-1} data-focusable="" onClick={() => startTurn(lang, true)}>
                  <span className="translator-person-name">{nameOf(lang)}</span>
                  <span className="translator-person-lang">{lang === 'en' ? 'English' : '日本語'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={`translator-line from-${l.from}`}>
              <p className="translator-said">
                <span className="translator-who">{nameOf(l.from)}</span> {l.said}
              </p>
              <p className="claude-reply" lang={other(l.from)}>
                {l.translation}
              </p>
            </div>
          ))
        )}
        {phase === 'translating' && <p className="claude-reply"><span className="claude-dots" aria-label="Translating" /></p>}
      </div>

      <div className="claude-controls">
        {phase !== 'setup' && phase !== 'installing' && phase !== 'pick' && phase !== 'checking' && !showSettings && (
          <>
            <p className={`translator-turn display turn-${turn}`} lang={turn}>
              {turn === 'en' ? `${turnName}’s turn` : `${turnName}の番です`}
            </p>
            <div className="claude-options">
              <button className="claude-stop translator-switch" tabIndex={-1} data-focusable="" data-select-sound="move" aria-label="Switch speaker" title="Switch speaker" onClick={() => startTurn(other(turnRef.current), true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
                </svg>
              </button>
              <button className={`claude-stop${lines.length ? '' : ' idle'}`} tabIndex={-1} data-focusable="" data-select-sound="move" aria-label="Say it again" title="Say it again" onClick={repeat}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" />
                </svg>
              </button>
              <button className="claude-stop" tabIndex={-1} data-focusable="" data-select-sound="move" aria-label="Settings" title="Settings" onClick={() => {
                generation.current++
                window.steamtv.stopVoice()
                window.steamtv.translator.quiet()
                setPhase('idle')
                setShowSettings(true)
              }}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
              </button>
            </div>
            <button
              ref={talkButton}
              className={`claude-talk phase-${phase === 'translating' ? 'thinking' : phase}${phase === 'listening' && !micReady ? ' mic-starting' : ''}${phase === 'listening' && heardSpeech ? ' heard-speech' : ''}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="none"
              aria-label={statusLine[phase]}
              onClick={talk}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {phase === 'listening' && heardSpeech ? (
                  <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                ) : (
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
                )}
              </svg>
            </button>
          </>
        )}
        {phase !== 'pick' && (
          <p className="claude-status display" aria-live="polite">
            {showSettings ? 'Settings' : statusLine[phase]}
          </p>
        )}
        {note && <p className="claude-note">{note}</p>}
      </div>

      <div className="claude-hints">
        {!showSettings && phase !== 'setup' && phase !== 'pick' && phase !== 'installing' && (
          <span className="files-hint">
            <ButtonIcon button={controls.select} family={family} /> {phase === 'speaking' ? 'Skip' : phase === 'listening' && heardSpeech ? 'Send' : 'Talk'}
          </span>
        )}
        {phase === 'speaking' && (
          <span className="files-hint">
            <ButtonIcon button={controls.playlist} family={family} /> Stop speaking
          </span>
        )}
        <span className="files-hint">
          <ButtonIcon button={controls.back} family={family} /> {showSettings ? 'Done' : 'Close'}
        </span>
      </div>
    </div>
  )
}

function SettingRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button className="translator-setting" tabIndex={-1} data-focusable="" data-select-sound="none" onClick={onClick}>
      <span className="translator-setting-label">{label}</span>
      <span className="translator-setting-value display">{value}</span>
    </button>
  )
}

import QRCode from 'qrcode'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClaudeEvent, ClaudeLoginState, VoiceState } from '../../../shared/types'
import { DEFAULT_CONTROLS, type Controls } from '../../../shared/controls'
import { CLAUDE_TALK_EVENT, focus, OWN_DIRECTION_EVENT, TRAP_CLOSE_EVENT, type Direction } from '../input/focus'
import { keepAwake } from '../input/idle'
import { play } from '../input/sounds'
import { ButtonIcon, useControllerFamily } from './ButtonIcon'
import { errorText } from './GooglePhotos'
import { Spinner } from './LaunchOverlay'
import { MUSIC_HOLD_EVENT } from './MusicPreview'

// The Claude app (its tile is in Apps): a spoken conversation with Claude Code. It listens,
// Claude answers aloud and in large type, then it listens again, until nothing is said. A
// on the big button (or R3, or a remote's Menu) talks, or talks over a reply; B closes.
// The conversation is kept while vaporTV runs; New chat starts another. While Claude works
// (reading files, running commands) the spinner and a line say what it's doing; anything that
// changes or runs something waits for Allow or Deny here (B denies).

/** AppTile fires this for the Claude tile (detail: the tile, to come back to). */
export const CLAUDE_EVENT = 'steamtv:claude'

/** Up and down scroll the conversation by this much. */
const SCROLL_PX = 240

interface Message {
  role: 'user' | 'claude'
  text: string
  error?: boolean
}

/** What the conversation is doing: the button and the line under it follow this. */
type Phase = 'checking' | 'setup' | 'idle' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'approving'

/** A request to approve: what it would do, in words, and the command or file underneath. */
interface Request {
  id: string
  description: string
  detail: string
}

/** Kept while the screen is closed, as the conversation is. */
let saved: Message[] = []

const SOFT_MISSES = /didn['’]t hear anything|didn['’]t catch that/i

export function ClaudeApp() {
  const [from, setFrom] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const onOpen = (event: Event): void => setFrom((event as CustomEvent<HTMLElement>).detail)
    window.addEventListener(CLAUDE_EVENT, onOpen)
    return () => window.removeEventListener(CLAUDE_EVENT, onOpen)
  }, [])
  const close = useCallback(() => {
    setFrom((tile) => {
      if (tile?.isConnected) requestAnimationFrame(() => focus(tile))
      return null
    })
  }, [])
  return from ? <Conversation onClose={close} /> : null
}

function Conversation({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const talkButton = useRef<HTMLButtonElement>(null)
  const [messages, setMessagesState] = useState<Message[]>(saved)
  const [phase, setPhaseState] = useState<Phase>('checking')
  const [note, setNote] = useState<string | null>(null)
  const [setupText, setSetupText] = useState('')
  /** Signing in from a phone: where it's at, and the QR code for its page. */
  const [login, setLogin] = useState<ClaudeLoginState | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS)
  /** What Claude is doing between words (a tool in use), and a request waiting for Allow or Deny. */
  const [working, setWorking] = useState<string | null>(null)
  const [request, setRequestState] = useState<Request | null>(null)
  const requestRef = useRef<Request | null>(null)
  const allowButton = useRef<HTMLButtonElement>(null)
  const family = useControllerFamily()
  // Read by the IPC listeners, which are set up once.
  const phaseRef = useRef<Phase>('checking')
  const replyDone = useRef(true)
  const speaking = useRef(false)

  const setPhase = (next: Phase): void => {
    phaseRef.current = next
    setPhaseState(next)
  }
  const setRequest = (next: Request | null): void => {
    requestRef.current = next
    setRequestState(next)
  }
  const setMessages = (update: (m: Message[]) => Message[]): void =>
    setMessagesState((m) => {
      saved = update(m)
      return saved
    })

  const listen = useCallback((): void => {
    setNote(null)
    setPhase('listening')
    window.steamtv.startVoice('conversation')
  }, [])

  /** A reply ends once it's all written and all said: then it's the user's turn again. */
  const afterReply = useCallback((): void => {
    if (!replyDone.current || speaking.current) return
    if (phaseRef.current === 'thinking' || phaseRef.current === 'speaking') listen()
  }, [listen])

  /** The big button, R3 and a remote's Menu: talk, stop listening, or talk over the reply. */
  const talk = useCallback((): void => {
    const now = phaseRef.current
    if (now === 'checking' || now === 'setup' || now === 'hearing' || now === 'approving') return
    if (now === 'listening') {
      window.steamtv.stopVoice()
      setPhase('idle')
      return
    }
    if (now === 'thinking' || now === 'speaking') {
      window.steamtv.claude.interrupt()
      setWorking(null)
      replyDone.current = true
      speaking.current = false
      setMessages((m) => (m.length && m[m.length - 1].role === 'claude' && !m[m.length - 1].text ? m.slice(0, -1) : m))
    }
    listen()
  }, [listen])

  /** Not signed in: show the QR code to sign in from a phone. */
  const signIn = useCallback((): void => {
    window.steamtv.stopVoice()
    setSetupText('')
    setPhase('setup')
    setLogin(null)
    setQr(null)
    window.steamtv.claude.signIn()
  }, [])

  /** Allow or Deny: Claude carries on (or hears no), and the cursor goes back to the talk button. */
  const answer = useCallback((allow: boolean): void => {
    const asked = requestRef.current
    if (!asked) return
    play('move')
    window.steamtv.claude.answer(asked.id, allow)
    setRequest(null)
    setWorking(allow ? asked.description : null)
    setPhase('thinking')
    requestAnimationFrame(() => talkButton.current && focus(talkButton.current))
  }, [])

  const newChat = (): void => {
    window.steamtv.stopVoice()
    window.steamtv.claude.reset()
    setWorking(null)
    setRequest(null)
    replyDone.current = true
    speaking.current = false
    setMessages(() => [])
    setNote(null)
    setPhase('idle')
    if (talkButton.current) focus(talkButton.current)
  }

  // Open: speak replies, hold the music and the screensaver, then start listening.
  useEffect(() => {
    window.steamtv.claude.setOpen(true)
    window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: true }))
    const holder = {}
    keepAwake(holder, true)
    window.steamtv.getSettings().then((s) => setControls(s.controls))
    window.steamtv.claude.status().then((status) => {
      if (!status.installed) {
        setSetupText('Claude Code isn’t installed on this box. Install it from Desktop Mode or over SSH, sign in once, then open this again.')
        return setPhase('setup')
      }
      if (!status.signedIn) return signIn()
      if (!status.speech) setNote('Speech isn’t in this build: replies are shown, not spoken.')
      replyDone.current = !status.busy
      if (status.busy) setPhase('thinking')
      else listen()
    })
    return () => {
      window.steamtv.stopVoice()
      window.steamtv.claude.cancelSignIn()
      window.steamtv.claude.setOpen(false)
      window.dispatchEvent(new CustomEvent(MUSIC_HOLD_EVENT, { detail: false }))
      keepAwake(holder, false)
    }
  }, [listen, signIn])

  useEffect(() => {
    if (talkButton.current) focus(talkButton.current)
  }, [])

  useEffect(() => {
    const offVoice = window.steamtv.onVoice((state: VoiceState, purpose) => {
      if (purpose !== 'conversation') return
      if (state.phase === 'preparing') setNote('Getting speech recognition ready (first time only)…')
      else if (state.phase === 'thinking') setPhase('hearing')
      else if (state.phase === 'heard') {
        setNote(null)
        replyDone.current = false
        setMessages((m) => [...m, { role: 'user', text: state.text }, { role: 'claude', text: '' }])
        setPhase('thinking')
        window.steamtv.claude.send(state.text).catch((err: unknown) => {
          replyDone.current = true
          setMessages((m) => [...m.slice(0, -1), { role: 'claude', text: errorText(err), error: true }])
          setPhase('idle')
        })
      } else if (state.phase === 'error') {
        setPhase('idle')
        if (!SOFT_MISSES.test(state.message)) setNote(state.message)
      }
    })
    const offEvent = window.steamtv.claude.onEvent((event: ClaudeEvent) => {
      if (event.type === 'delta') {
        setNote(null)
        setWorking(null)
        setMessages((m) => {
          const last = m[m.length - 1]
          return last?.role === 'claude' ? [...m.slice(0, -1), { ...last, text: last.text + event.text }] : [...m, { role: 'claude', text: event.text }]
        })
      } else if (event.type === 'tool') {
        setWorking((now) => event.detail ?? now ?? 'Working')
      } else if (event.type === 'permission') {
        // Nothing changes until it's answered: stop listening, put the cursor on Allow.
        window.steamtv.stopVoice()
        setWorking(null)
        setRequest({ id: event.id, description: event.description, detail: event.detail })
        setPhase('approving')
        requestAnimationFrame(() => allowButton.current && focus(allowButton.current))
      } else if (event.type === 'permissionDone') {
        if (requestRef.current?.id === event.id) {
          setRequest(null)
          if (phaseRef.current === 'approving') setPhase('thinking')
        }
      } else if (event.type === 'done') {
        setNote(null)
        setWorking(null)
        replyDone.current = true
        afterReply()
      } else if (event.type === 'error') {
        replyDone.current = true
        setNote(null)
        setWorking(null)
        setRequest(null)
        setMessages((m) => {
          const last = m[m.length - 1]
          const rest = last?.role === 'claude' && !last.text ? m.slice(0, -1) : m
          return event.signIn ? rest : [...rest, { role: 'claude', text: event.message, error: true }]
        })
        if (event.signIn) signIn()
        else setPhase('idle')
      } else if (event.type === 'speechError') {
        setNote(event.message)
      }
    })
    const offSpeaking = window.steamtv.claude.onSpeaking((on) => {
      speaking.current = on
      if (on && phaseRef.current === 'thinking' && !requestRef.current) setPhase('speaking')
      if (!on) afterReply()
    })
    const offLogin = window.steamtv.claude.onLogin((state) => {
      setLogin(state)
      if (state.phase === 'waiting')
        QRCode.toDataURL(state.url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
          .then(setQr)
          .catch(() => setQr(null))
      if (state.phase === 'done') {
        setLogin(null)
        setQr(null)
        setNote('Signed in.')
        listen()
      }
    })
    const offTalk = window.steamtv.claude.onTalk(talk)
    window.addEventListener(CLAUDE_TALK_EVENT, talk)
    return () => {
      offVoice()
      offEvent()
      offSpeaking()
      offTalk()
      offLogin()
      window.removeEventListener(CLAUDE_TALK_EVENT, talk)
    }
  }, [afterReply, talk, signIn, listen])

  // B closes; up and down scroll the conversation, left and right move between the buttons.
  useEffect(() => {
    const onBack = (): void => (requestRef.current ? answer(false) : onClose())
    const onDirection = (event: Event): void => {
      const direction = (event as CustomEvent<Direction>).detail
      if (direction === 'up' || direction === 'down') {
        log.current?.scrollBy({ top: direction === 'up' ? -SCROLL_PX : SCROLL_PX, behavior: 'smooth' })
        return
      }
      const buttons = [...(root.current?.querySelectorAll<HTMLElement>('.claude-controls [data-focusable], .claude-approve [data-focusable]') ?? [])]
      const at = buttons.indexOf(document.activeElement as HTMLElement)
      const next = buttons[at + (direction === 'right' ? 1 : -1)]
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
  }, [onClose, answer])

  // A failed sign-in: the cursor on Try again.
  useEffect(() => {
    const retry = login?.phase === 'failed' && root.current?.querySelector<HTMLElement>('.claude-new')
    if (retry) focus(retry)
  }, [login])

  // The newest words stay in view as they arrive.
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, working, request])

  const status: Record<Phase, string> = {
    checking: 'Starting…',
    setup: 'Not set up',
    idle: 'Press to talk',
    listening: 'Listening…',
    hearing: 'Got it…',
    thinking: 'Thinking…',
    speaking: 'Speaking · press to interrupt',
    approving: 'Needs your OK'
  }

  return (
    <div className={`claude-app${phase === 'setup' ? ' signing-in' : ''}`} ref={root} data-focus-trap="" data-own-directions="">
      <div className="settings-scrim" aria-hidden="true" />
      <h2 className="claude-title display">Claude</h2>

      <div className="claude-log" ref={log}>
        {phase === 'setup' && setupText ? (
          <p className="claude-empty">{setupText}</p>
        ) : phase === 'setup' ? (
          <div className="claude-signin">
            <div className="claude-qr">{qr && login?.phase !== 'failed' ? <img src={qr} alt="" /> : <span className="claude-dots" />}</div>
            <div className="claude-signin-text">
              <h3 className="display">Sign in to Claude</h3>
              {login?.phase === 'failed' ? (
                <p>{login.message}</p>
              ) : login?.phase === 'checking' ? (
                <p>Checking the code…</p>
              ) : (
                <>
                  {login?.phase === 'waiting' && login.message && <p className="claude-signin-warn">{login.message}</p>}
                  <ol>
                    <li>Scan the code with your phone (on the same Wi-Fi as this TV).</li>
                    <li>Sign in with your Claude account and copy the code it shows.</li>
                    <li>Paste it on your phone and tap Finish.</li>
                  </ol>
                  {login?.phase === 'waiting' && <p className="claude-signin-url">{login.url}</p>}
                </>
              )}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <p className="claude-empty">Ask anything. Answers are short and spoken aloud.</p>
        ) : (
          messages.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className="claude-user">
                {m.text}
              </p>
            ) : (
              (m.text || (!working && !request)) && (
                <p key={i} className={`claude-reply${m.error ? ' error' : ''}`}>
                  {m.text || <span className="claude-dots" aria-label="Thinking" />}
                </p>
              )
            )
          )
        )}
        {working && !request && phase !== 'setup' && (
          <div className="claude-working" aria-live="polite">
            <span className="claude-working-spin" aria-hidden="true">
              <Spinner />
            </span>
            <span className="claude-working-text">{working}…</span>
          </div>
        )}
        {request && (
          <div className="claude-approve">
            <p className="claude-approve-label">Claude wants to</p>
            <p className="claude-approve-what display">{request.description}</p>
            {request.detail && <p className="claude-approve-detail">{request.detail}</p>}
            <div className="claude-approve-buttons">
              <button ref={allowButton} className="claude-approve-btn allow display" tabIndex={-1} data-focusable="" onClick={() => answer(true)}>
                Allow
              </button>
              <button className="claude-approve-btn display" tabIndex={-1} data-focusable="" onClick={() => answer(false)}>
                Deny
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="claude-controls">
        <button
          ref={talkButton}
          className={`claude-talk phase-${phase}`}
          tabIndex={-1}
          data-focusable={request ? undefined : ''}
          aria-label={status[phase]}
          onClick={talk}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {phase === 'thinking' || phase === 'speaking' || phase === 'approving' ? (
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            ) : (
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
            )}
          </svg>
        </button>
        <p className="claude-status display" aria-live="polite">
          {phase === 'setup' && !setupText ? 'Waiting for your phone' : status[phase]}
        </p>
        {note && <p className="claude-note">{note}</p>}
        {login?.phase === 'failed' ? (
          <button className="claude-new display" tabIndex={-1} data-focusable="" onClick={signIn}>
            Try again
          </button>
        ) : (
          phase !== 'setup' &&
          !request && (
            <button className="claude-new display" tabIndex={-1} data-focusable="" onClick={newChat}>
              New chat
            </button>
          )
        )}
      </div>

      <div className="claude-hints">
        {phase !== 'setup' && (
          <span className="files-hint">
            <ButtonIcon button={controls.select} family={family} /> {request ? 'Choose' : 'Talk'}
          </span>
        )}
        <span className="files-hint">
          <ButtonIcon button={controls.back} family={family} /> {request ? 'Deny' : 'Close'}
        </span>
      </div>
    </div>
  )
}

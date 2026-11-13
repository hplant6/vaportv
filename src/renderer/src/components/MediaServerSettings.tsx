import { useEffect, useState } from 'react'
import type { MediaAccountInfo, MediaKind, MediaServer } from '../../../shared/types'
import { refreshTabs } from '../availableTabs'
import { focus } from '../input/focus'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'

// Settings → General → Connect your media library: the media servers signed in to (each with Sign out),
// then Add a server: the Emby and Jellyfin servers found on the network (or an address typed
// in); choosing one asks for the user's name, then password, on vaporTV's keyboard. Only the
// access token the server gives back is kept. Continue watching merges them all.

type Step = { kind: 'idle' } | { kind: 'address' } | { kind: 'user'; server: MediaServer } | { kind: 'password'; server: MediaServer; user: string }

const KIND_NAMES: Record<MediaKind, string> = { emby: 'Emby', jellyfin: 'Jellyfin' }
const ROW = 'media-server-row'

export function MediaServerSettings() {
  const [accounts, setAccounts] = useState<MediaAccountInfo[] | null>(null)
  const [servers, setServers] = useState<MediaServer[] | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.steamtv.media.accounts().then(setAccounts)
    window.steamtv.media
      .discover()
      .then(setServers)
      .catch(() => setServers([]))
  }, [])

  // Back to a row once the keyboard's gone.
  const refocus = (): void => {
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`.${ROW}`)
      if (row) focus(row)
    })
  }
  const changed = (next: MediaAccountInfo[]): void => {
    setAccounts(next)
    window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
    // The Media tab comes with the first server and goes with the last.
    refreshTabs()
  }

  const signIn = (server: MediaServer, user: string, password: string): void => {
    setStep({ kind: 'idle' })
    setBusy(true)
    window.steamtv.media
      .signIn(server, user, password)
      .then((next) => {
        changed(next)
        toast(`Signed in to ${server.name} as ${user}`)
      })
      .catch((err) => toast(/401|signed out/i.test(String(err)) ? `${server.name} didn’t accept that name and password` : `Couldn’t sign in to ${server.name}`))
      .finally(() => {
        setBusy(false)
        refocus()
      })
  }
  const cancel = (): void => {
    setStep({ kind: 'idle' })
    refocus()
  }

  if (step.kind === 'address')
    return (
      // Each step its own keyboard (key): one reused would keep the last one's text and closing state.
      <OnScreenKeyboard
        key="address"
        title="Add a server"
        prompt="Its address, e.g. 192.168.1.38 (port 8096 unless you say otherwise)"
        onDone={(text) => {
          if (!text.trim()) return cancel()
          window.steamtv.media
            .check(text)
            .then((server) => setStep({ kind: 'user', server }))
            .catch(() => {
              toast(`No Emby or Jellyfin server answered at ${text.trim()}`)
              cancel()
            })
        }}
        onCancel={cancel}
      />
    )
  if (step.kind === 'user')
    return (
      <OnScreenKeyboard
        key="user"
        title={`Sign in to ${step.server.name}`}
        prompt={`Your ${KIND_NAMES[step.server.kind]} user name`}
        onDone={(user) => (user.trim() ? setStep({ kind: 'password', server: step.server, user: user.trim() }) : cancel())}
        onCancel={cancel}
      />
    )
  if (step.kind === 'password')
    return (
      <OnScreenKeyboard
        key="password"
        title={`Sign in to ${step.server.name}`}
        prompt={`${step.user}’s password (leave it empty if there isn’t one)`}
        secret
        onDone={(password) => signIn(step.server, step.user, password)}
        onCancel={cancel}
      />
    )

  // Found servers not signed in to yet (one is, by its address, if any account's on it).
  const signedInUrls = new Set((accounts ?? []).map((a) => a.url))
  const toAdd = (servers ?? []).filter((s) => !signedInUrls.has(s.url))

  return (
    <div className="settings-group">
      <h3 className="settings-heading display">Connect your media library</h3>
      <p className="settings-help">
        Sign in to your Emby or Jellyfin server to watch your films and shows in vaporTV. They get their own Media tab, and what you’re
        part way through shows on Home under Continue watching, ready to pick up where you left off.
      </p>
      <div className="setting-list" data-focus-memory="settings-media-servers">
        {accounts?.map((account) => (
          <button
            key={account.key}
            className={`setting-row ${ROW}`}
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            aria-label={`Sign out of ${account.serverName}`}
            onClick={() =>
              window.steamtv.media.signOut(account.key).then((next) => {
                changed(next)
                toast(`Signed out of ${account.serverName}`)
                refocus()
              })
            }
          >
            <span className="setting-name display">{account.serverName}</span>
            <span className="setting-detail">
              {KIND_NAMES[account.kind]} · {account.userName} · A to sign out
            </span>
          </button>
        ))}
        {servers === null && <p className="settings-help">Looking for Emby and Jellyfin servers…</p>}
        {toAdd.map((server) => (
          <button
            key={server.id}
            className={`setting-row ${ROW}`}
            tabIndex={-1}
            data-focusable=""
            data-select-sound="move"
            disabled={busy}
            onClick={() => setStep({ kind: 'user', server })}
          >
            <span className="setting-name display">Sign in to {server.name}</span>
            <span className="setting-detail">
              {KIND_NAMES[server.kind]} · {server.url.replace(/^https?:\/\//, '')}
            </span>
          </button>
        ))}
        <button className={`setting-row ${ROW}`} tabIndex={-1} data-focusable="" data-select-sound="move" disabled={busy} onClick={() => setStep({ kind: 'address' })}>
          <span className="setting-name display">Add a server by its address</span>
          <span className="setting-detail">For one somewhere else, or not found</span>
        </button>
      </div>
    </div>
  )
}

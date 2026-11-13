import { useEffect, useState } from 'react'
import type { EmbyServer, EmbyStatus } from '../../../shared/types'
import { focus } from '../input/focus'
import { HOME_CHANGED_EVENT } from '../screens/Settings'
import { OnScreenKeyboard } from './Keyboard'
import { toast } from './Toast'

// Settings → Home → Continue watching: signing in to Emby. Servers on the network are listed
// (or an address typed in); choosing one asks for the Emby user's name, then password, on
// vaporTV's keyboard. Only the access token Emby gives back is kept. Signed in, it says as
// whom, with Sign out.

type Step = { kind: 'idle' } | { kind: 'address' } | { kind: 'user'; server: EmbyServer } | { kind: 'password'; server: EmbyServer; user: string }

const ROW = 'emby-row'

export function EmbySettings() {
  const [status, setStatus] = useState<EmbyStatus | null>(null)
  const [servers, setServers] = useState<EmbyServer[] | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.steamtv.emby.status().then(setStatus)
  }, [])
  // Signed out: look for servers as the section opens.
  const signedIn = status?.signedIn
  useEffect(() => {
    if (signedIn !== false) return
    setServers(null)
    window.steamtv.emby
      .discover()
      .then(setServers)
      .catch(() => setServers([]))
  }, [signedIn])

  // Back to a row once the keyboard's gone.
  const refocus = (): void => {
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`.${ROW}`)
      if (row) focus(row)
    })
  }

  const signIn = (server: EmbyServer, user: string, password: string): void => {
    setStep({ kind: 'idle' })
    setBusy(true)
    window.steamtv.emby
      .signIn(server, user, password)
      .then((next) => {
        setStatus(next)
        toast(`Signed in to ${server.name} as ${user}`)
        window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
      })
      .catch((err) => toast(/401|signed out/i.test(String(err)) ? 'Emby didn’t accept that name and password' : `Couldn’t sign in to ${server.name}`))
      .finally(() => {
        setBusy(false)
        refocus()
      })
  }

  if (step.kind === 'address')
    return (
      <OnScreenKeyboard
        title="Emby server"
        prompt="Its address, e.g. 192.168.1.38 (port 8096 unless you say otherwise)"
        onDone={(text) => {
          if (!text.trim()) return setStep({ kind: 'idle' })
          window.steamtv.emby
            .check(text)
            .then((server) => setStep({ kind: 'user', server }))
            .catch(() => {
              toast(`No Emby server answered at ${text.trim()}`)
              setStep({ kind: 'idle' })
              refocus()
            })
        }}
        onCancel={() => {
          setStep({ kind: 'idle' })
          refocus()
        }}
      />
    )
  if (step.kind === 'user')
    return (
      <OnScreenKeyboard
        title={`Sign in to ${step.server.name}`}
        prompt="Your Emby user name"
        onDone={(user) => (user.trim() ? setStep({ kind: 'password', server: step.server, user: user.trim() }) : setStep({ kind: 'idle' }))}
        onCancel={() => {
          setStep({ kind: 'idle' })
          refocus()
        }}
      />
    )
  if (step.kind === 'password')
    return (
      <OnScreenKeyboard
        title={`Sign in to ${step.server.name}`}
        prompt={`${step.user}’s password (leave it empty if there isn’t one)`}
        secret
        onDone={(password) => signIn(step.server, step.user, password)}
        onCancel={() => {
          setStep({ kind: 'idle' })
          refocus()
        }}
      />
    )

  return (
    <div className="settings-group">
      <h3 className="settings-heading display">Continue watching</h3>
      <p className="settings-help">
        Films and episodes you’re part way through on your Emby server, in a row on Home. Pick one and it plays here, from where you left
        off.
      </p>
      <div className="setting-list" data-focus-memory="settings-emby">
        {status?.signedIn ? (
          <>
            <div className="setting-row">
              <span className="setting-name display">Signed in</span>
              <span className="setting-detail">
                {status.userName} on {status.serverName ?? status.url}
              </span>
            </div>
            <button
              className={`setting-row ${ROW}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              onClick={() =>
                window.steamtv.emby.signOut().then(() => {
                  setStatus({ signedIn: false })
                  toast('Signed out of Emby')
                  window.dispatchEvent(new Event(HOME_CHANGED_EVENT))
                  refocus()
                })
              }
            >
              <span className="setting-name display">Sign out</span>
              <span className="setting-detail">Continue watching leaves Home</span>
            </button>
          </>
        ) : (
          <>
            {servers === null && <p className="settings-help">Looking for Emby servers…</p>}
            {servers?.map((server) => (
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
                <span className="setting-detail">{server.url.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
            {servers?.length === 0 && <p className="settings-help">No Emby servers answered on this network.</p>}
            <button
              className={`setting-row ${ROW}`}
              tabIndex={-1}
              data-focusable=""
              data-select-sound="move"
              disabled={busy}
              onClick={() => setStep({ kind: 'address' })}
            >
              <span className="setting-name display">Enter a server address</span>
              <span className="setting-detail">For one somewhere else, or not found</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

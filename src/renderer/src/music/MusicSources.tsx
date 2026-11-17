import { useCallback, useEffect, useState } from 'react'
import type { MusicIndexStatus, MusicSource } from '../../../shared/types'
import { FilePicker } from '../components/FilePicker'
import { ActionRow, OverStage } from '../components/GooglePhotos'
import { toast } from '../components/Toast'
import { ToggleRow } from '../components/ToggleRow'
import { PhoneUpload } from './PhoneUpload'
import { AddShare } from './AddShare'

// Music sources: where the library's music comes from, and how to add more. One screen with
// two doors (the Music tab's + Add music, and Settings → Music), so there's never a question
// of which is the real one. This TV's own folder (~/Music: copy songs or albums in from a
// drive), drives (each with Include in library: a games-only drive can be left out), network
// shares, and media servers signed in to for the Media tab (their music libraries).

/** Counts and the scan's progress, for each source's line. */
function useSources(): { sources: MusicSource[] | null; status: MusicIndexStatus | null; reload: () => void } {
  const [sources, setSources] = useState<MusicSource[] | null>(null)
  const [status, setStatus] = useState<MusicIndexStatus | null>(null)
  const reload = useCallback(() => {
    window.steamtv.music
      .sources()
      .then(setSources)
      .catch(() => setSources([]))
  }, [])
  useEffect(() => {
    reload()
    window.steamtv.music.indexStatus().then(setStatus)
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = window.steamtv.music.onIndex((s) => {
      setStatus(s)
      // Counts again as the scan goes (not more than every few seconds), and when it ends.
      if (!timer) timer = setTimeout(() => ((timer = null), reload()), s.scanning ? 3000 : 0)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [reload])
  return { sources, status, reload }
}

const counts = (s: MusicSource): string => (s.songs ? `${s.albums.toLocaleString()} ${s.albums === 1 ? 'album' : 'albums'} · ${s.songs.toLocaleString()} songs` : 'No music found yet')

export function MusicSources() {
  const { sources, status, reload } = useSources()
  const [copying, setCopying] = useState(false)
  const [phone, setPhone] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<{ name: string; host: string; share: string; mounted: boolean }[]>([])
  const reloadShares = useCallback(() => void window.steamtv.music.shares.list().then(setSignedIn).catch(() => setSignedIn([])), [])
  useEffect(() => reloadShares(), [reloadShares])
  const here = sources?.find((s) => s.kind === 'folder')
  const drives = sources?.filter((s) => s.kind === 'drive') ?? []
  const shares = sources?.filter((s) => s.kind === 'network') ?? []
  const servers = sources?.filter((s) => s.kind === 'server') ?? []
  const reading = status?.scanning ? (status.toRead ? `Reading new music: ${status.read.toLocaleString()} of ${status.toRead.toLocaleString()} songs…` : 'Looking for new music…') : ''

  const include = (s: MusicSource): void => {
    void window.steamtv.music.includePlace(s.path, !s.included).then(() => {
      toast(s.included ? `${s.name} left out of your library` : `${s.name} is in your library`)
      reload()
    })
  }

  const group = (heading: string, help: string, rows: React.ReactNode, memory: string) => (
    <div className="settings-group">
      <h3 className="settings-heading display">{heading}</h3>
      <p className="settings-help">{help}</p>
      <div className="setting-list" data-focus-memory={memory}>
        {rows}
      </div>
    </div>
  )

  return (
    <div className="music-sources">
      {reading && <p className="settings-help music-sources-reading">{reading}</p>}
      {group(
        'On this TV',
        'Songs copied to this TV stay when the drive they came from is unplugged. Anything put in ~/Music (in Desktop Mode, or over the network) shows up too.',
        <>
          {here && <ActionRow label="Music on this TV" detail={counts(here)} onSelect={() => setCopying(true)} />}
          <ActionRow label="Send from your phone" detail="Scan a code, then pick songs on your phone" onSelect={() => setPhone(true)} />
          <ActionRow label="Copy songs or albums to this TV" detail="From a USB drive, SD card or folder: a song, or a whole folder" onSelect={() => setCopying(true)} />
        </>,
        'music-sources-here'
      )}
      {group(
        'Drives',
        drives.length ? 'Played from the drive while it’s plugged in. Leave out a drive that only has games: its sound effects aren’t music.' : 'Plug in a USB drive or SD card with music on it: it shows up here, and in your library.',
        drives.map((d) => <ToggleRow key={d.path} label={d.name} detail={d.included ? counts(d) : 'Left out'} on={d.included} onToggle={() => include(d)} />),
        'music-sources-drives'
      )}
      {group(
        'Network shares',
        'Music on another computer or a NAS, played over your network.',
        <>
          {shares.map((s) => (
            <ToggleRow key={s.path} label={s.name} detail={s.included ? counts(s) : 'Left out'} on={s.included} onToggle={() => include(s)} />
          ))}
          <ActionRow label="Add a network share" detail="Sign in to a computer or NAS on your network" onSelect={() => setAdding(true)} />
          {signedIn.map((s) => (
            <ActionRow
              key={s.name}
              label={`Remove ${s.share} on ${s.host}`}
              detail={removing === s.name ? 'Press again to remove' : s.mounted ? 'Signed in from vaporTV' : "Signed in from vaporTV · can't reach it now"}
              onSelect={() => {
                if (removing !== s.name) return setRemoving(s.name)
                setRemoving(null)
                void window.steamtv.music.shares.remove(s.name).then(() => {
                  toast(`Removed ${s.share} on ${s.host}`)
                  reloadShares()
                  reload()
                })
              }}
            />
          ))}
        </>,
        'music-sources-shares'
      )}
      {group(
        'Your media server',
        servers.length
          ? 'Music from Emby or Jellyfin, signed in to for the Video tab: played from the server, with your own.'
          : 'Sign in to Emby or Jellyfin in Settings → General (Connect your media library): its music shows up here, and in your library, once the server has a music library.',
        servers.map((s) =>
          s.libraries === 0 ? (
            <ActionRow key={s.path} label={s.name} detail="No music library on this server yet" onSelect={() => toast(`Add a music library on ${s.name}, then look for new music here`)} />
          ) : (
            <ToggleRow key={s.path} label={s.name} detail={s.included ? counts(s) : 'Left out'} on={s.included} onToggle={() => include(s)} />
          )
        ),
        'music-sources-servers'
      )}
      {group(
        'Library',
        'vaporTV looks for new music when the Music tab opens, and every so often.',
        <ActionRow label="Look for new music now" detail={reading || 'Reads every source again'} onSelect={() => void window.steamtv.music.rescan()} />,
        'music-sources-rescan'
      )}
      {adding && (
        <AddShare
          onClose={(added) => {
            setAdding(false)
            if (added) {
              reloadShares()
              reload()
            }
          }}
        />
      )}
      {phone && (
        <PhoneUpload
          onClose={() => {
            setPhone(false)
            reload()
          }}
        />
      )}
      {copying && (
        <OverStage>
          <FilePicker
            title="Copy music to this TV"
            kind="audio"
            folders
            add={async (entry) => {
              await window.steamtv.music.copyMusic(entry.path)
              toast(`Copied ${entry.name.replace(/\.[^.]+$/, '')} to this TV: it'll be in your library in a moment`)
              setCopying(false)
              reload()
            }}
            onClose={() => setCopying(false)}
          />
        </OverStage>
      )}
    </div>
  )
}

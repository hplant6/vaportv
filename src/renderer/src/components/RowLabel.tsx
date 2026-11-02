/**
 * A row's name, with an optional second line under it (a track's artist and licence), as Settings → Music's
 * Now playing shows a song. Without one, just the name, as every other row.
 */
export function RowLabel({ label, subtitle }: { label: string; subtitle?: string }) {
  if (!subtitle) return <span className="setting-name display">{label}</span>
  return (
    <span className="setting-text">
      <span className="setting-name display">{label}</span>
      <span className="setting-sub">{subtitle}</span>
    </span>
  )
}

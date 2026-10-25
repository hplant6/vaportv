import logo from '../assets/vaportv-logo.svg'

// The vaporTV logo with chromatic aberration: the (white) logo is rebuilt from three layers, one
// red, one green, one blue, each the logo's shape as a mask, screened together so they add back up
// to white where they overlap. Each layer drifts on its own slow path (app.css), leaving soft
// colour fringes that shift as the layers part and meet.

const CHANNELS = ['red', 'green', 'blue'] as const

export function AberrationLogo({ className }: { className?: string }) {
  return (
    <div className={`aberration-logo ${className ?? ''}`} style={{ '--aberration-logo': `url("${logo}")` } as React.CSSProperties} role="img" aria-label="vaporTV">
      {CHANNELS.map((c) => (
        <div key={c} className={`aberration-drift aberration-${c}`} aria-hidden="true">
          <span className="aberration-channel" />
        </div>
      ))}
    </div>
  )
}

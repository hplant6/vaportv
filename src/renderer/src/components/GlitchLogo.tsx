import logo from '../assets/vaportv-logo.svg'

// The vaporTV logo with a glitch, after leon9208's glitch pen (codepen.io/leon9208/pen/dWOvxw).
// The logo stays put; two copies, nudged 2px either way with a green or purple edge (the SVG as
// a mask, for the pen's text-shadow), show only through bands that slide up and down it.

function Copy({ className }: { className: string }) {
  return (
    <div className={`glitch-layer ${className}`} aria-hidden="true">
      <span className="glitch-ghost" />
      <img className="glitch-face" src={logo} alt="" />
    </div>
  )
}

export function GlitchLogo({ className }: { className?: string }) {
  return (
    <div className={`glitch-logo ${className ?? ''}`} style={{ '--glitch-logo': `url("${logo}")` } as React.CSSProperties} role="img" aria-label="vaporTV">
      <img className="glitch-face" src={logo} alt="" />
      <Copy className="glitch-before" />
      <Copy className="glitch-after" />
    </div>
  )
}

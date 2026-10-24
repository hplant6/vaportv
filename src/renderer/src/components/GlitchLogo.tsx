import logo from '../assets/vaportv-logo.svg'

// The vaporTV logo with a glitch, after Christine Banlawi's "Glitch Text" pen
// (codepen.io/cbanlawi/pen/xxRBeMY). The pen's text-shadows become copies of the logo
// filled cyan, magenta and yellow (the SVG as a mask) behind the white one, and its two
// sliced copies are the same stack clipped to the top and bottom thirds, each on its own beat.

function Stack() {
  return (
    <>
      <span className="glitch-ghost glitch-cyan" />
      <span className="glitch-ghost glitch-magenta" />
      <span className="glitch-ghost glitch-yellow" />
      <img className="glitch-face" src={logo} alt="" />
    </>
  )
}

export function GlitchLogo({ className }: { className?: string }) {
  return (
    <div className={`glitch-logo ${className ?? ''}`} style={{ '--glitch-logo': `url("${logo}")` } as React.CSSProperties} role="img" aria-label="vaporTV">
      <div className="glitch-layer glitch-main">
        <Stack />
      </div>
      <div className="glitch-layer glitch-top" aria-hidden="true">
        <Stack />
      </div>
      <div className="glitch-layer glitch-bottom" aria-hidden="true">
        <Stack />
      </div>
    </div>
  )
}

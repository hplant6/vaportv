import logo from '../assets/vaportv-logo.svg'

// The vaporTV logo with chromatic aberration: an SVG filter splits it into its red, green and blue
// channels, slides red and blue apart from green, and screens them back together, so the logo
// keeps its colours in the middle and shows red and blue fringes at its edges. The split drifts
// slowly and now and then jolts wider.

const FILTER_ID = 'vaportv-aberration'

// Offsets in px, one per keyframe: mostly a 1–3px drift, with two short jolts.
const RED_DX = '-1.5;-2.5;-1;-6;-1.5;-2;-1.5;-5;-1.5'
const BLUE_DX = '1.5;2.5;1;6;1.5;2;1.5;5;1.5'
const RED_DY = '0;0;0.5;-1;0;0;0;1;0'
const BLUE_DY = '0;0;-0.5;1;0;0;0;-1;0'
const KEY_TIMES = '0;0.2;0.4;0.42;0.44;0.7;0.86;0.875;1'

function Channel({ matrix, result }: { matrix: string; result: string }) {
  return <feColorMatrix in="SourceGraphic" type="matrix" values={matrix} result={result} />
}

function Shift({ input, dx, dy, result }: { input: string; dx: string; dy: string; result: string }) {
  return (
    <feOffset in={input} result={result}>
      <animate attributeName="dx" values={dx} keyTimes={KEY_TIMES} dur="6s" repeatCount="indefinite" />
      <animate attributeName="dy" values={dy} keyTimes={KEY_TIMES} dur="6s" repeatCount="indefinite" />
    </feOffset>
  )
}

export function AberrationLogo({ className }: { className?: string }) {
  return (
    <div className={`aberration-logo ${className ?? ''}`} role="img" aria-label="vaporTV">
      <svg className="aberration-defs" aria-hidden="true">
        <filter id={FILTER_ID} x="-5%" y="-10%" width="110%" height="120%" colorInterpolationFilters="sRGB">
          <Channel matrix="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <Channel matrix="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
          <Channel matrix="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
          <Shift input="red" dx={RED_DX} dy={RED_DY} result="red-shifted" />
          <Shift input="blue" dx={BLUE_DX} dy={BLUE_DY} result="blue-shifted" />
          <feBlend in="red-shifted" in2="green" mode="screen" result="red-green" />
          <feBlend in="blue-shifted" in2="red-green" mode="screen" />
        </filter>
      </svg>
      <img src={logo} alt="" style={{ filter: `url(#${FILTER_ID})` }} />
    </div>
  )
}

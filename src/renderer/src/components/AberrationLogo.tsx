import logo from '../assets/vaportv-logo.svg'

// The vaporTV logo with chromatic aberration: an SVG filter splits it into its red, green and blue
// channels, slides red and blue apart from green, and screens them back together, so the logo
// keeps its colours in the middle and shows red and blue fringes at its edges. Red and blue sway
// smoothly on opposite sides; their x and y run on different periods, so the path never quite repeats.

const FILTER_ID = 'vaportv-aberration'

// Each axis eases back and forth between two offsets (px). Blue mirrors red.
const SWAY_X = { red: '-0.5;-3.5;-0.5', blue: '0.5;3.5;0.5', dur: '7s' }
const SWAY_Y = { red: '-1.2;1.2;-1.2', blue: '1.2;-1.2;1.2', dur: '5s' }
const EASE = '0.45 0 0.55 1;0.45 0 0.55 1'

function Channel({ matrix, result }: { matrix: string; result: string }) {
  return <feColorMatrix in="SourceGraphic" type="matrix" values={matrix} result={result} />
}

function Sway({ attribute, values, dur }: { attribute: 'dx' | 'dy'; values: string; dur: string }) {
  return <animate attributeName={attribute} values={values} keyTimes="0;0.5;1" calcMode="spline" keySplines={EASE} dur={dur} repeatCount="indefinite" />
}

function Shift({ channel, result }: { channel: 'red' | 'blue'; result: string }) {
  return (
    <feOffset in={channel} result={result}>
      <Sway attribute="dx" values={SWAY_X[channel]} dur={SWAY_X.dur} />
      <Sway attribute="dy" values={SWAY_Y[channel]} dur={SWAY_Y.dur} />
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
          <Shift channel="red" result="red-shifted" />
          <Shift channel="blue" result="blue-shifted" />
          <feBlend in="red-shifted" in2="green" mode="screen" result="red-green" />
          <feBlend in="blue-shifted" in2="red-green" mode="screen" />
        </filter>
      </svg>
      <img src={logo} alt="" style={{ filter: `url(#${FILTER_ID})` }} />
    </div>
  )
}

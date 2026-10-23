import { useBattery } from '../power'
import charging from '../assets/battery/charg.svg'
import full from '../assets/battery/full.svg'
import high from '../assets/battery/high.svg'
import medium from '../assets/battery/med.svg'
import empty from '../assets/battery/low.svg'

// The battery beside the clock, on a device that runs on one (a Steam Deck in your hands).
// Nothing at all on a box on mains power. Icons by Henry, from his alpha-es-de theme.

/** At or below this it turns red. */
const LOW = 15

export function BatteryIndicator() {
  const battery = useBattery()
  if (!battery) return null
  const low = battery.percent <= LOW && !battery.charging
  const icon = battery.charging ? charging : battery.percent >= 80 ? full : battery.percent >= 55 ? high : battery.percent >= 25 ? medium : empty
  return (
    <span className={`battery${low ? ' low' : ''}`} aria-label={`Battery ${battery.percent}%${battery.charging ? ', charging' : ''}`}>
      {/* A mask, not an image: it takes the text colour, so it can turn red. */}
      <span className="battery-icon" style={{ maskImage: `url("${icon}")` }} aria-hidden="true" />
      <span className="battery-percent">{battery.percent}%</span>
    </span>
  )
}

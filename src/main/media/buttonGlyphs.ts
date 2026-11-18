import type { ButtonIconName } from '../../shared/buttonIcons'
import { assDrawing, assStrokes, parseSvg, type SvgShape } from './svgToAss'

// The page's controller button pictures (renderer/src/assets/buttons, the alpha-es-de theme's help
// icons, CC0), bundled into the main process as text and turned into ASS drawings for the mpv
// player's shortcuts: the same pictures, drawn by mpv.

const SOURCES = import.meta.glob<string>('../../renderer/src/assets/buttons/*.svg', { eager: true, query: '?raw', import: 'default' })
const shapes = new Map<ButtonIconName, SvgShape | null>()

function shapeOf(name: ButtonIconName): SvgShape | null {
  if (!shapes.has(name)) {
    const svg = SOURCES[`../../renderer/src/assets/buttons/${name}.svg`]
    shapes.set(name, svg ? parseSvg(svg) : null)
  }
  return shapes.get(name)!
}

/**
 * The picture, `size` px square with its top left at (x, y): what's filled as one ASS drawing,
 * and each stroke as a drawing to outline. Null if there's no such picture.
 */
export function glyphDrawing(name: ButtonIconName, x: number, y: number, size: number): { fill: string; strokes: { path: string; width: number }[] } | null {
  const shape = shapeOf(name)
  return shape ? { fill: assDrawing(shape, x, y, size), strokes: assStrokes(shape, x, y, size) } : null
}

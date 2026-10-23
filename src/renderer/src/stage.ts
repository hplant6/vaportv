// The stage everything is laid out on: 1920 wide and, on a TV, 1080 tall. A taller screen
// gets a taller stage (the Steam Deck's 16:10 is 1920×1200), so its extra height shows
// more rather than bars; a wider one keeps 1080, with bars at the sides.

export const STAGE_W = 1920
const MIN_H = 1080

export function stageHeight(width = window.innerWidth, height = window.innerHeight): number {
  return Math.max(MIN_H, Math.round((STAGE_W * height) / width))
}

import type { ControllerFamily } from './controllers'

// Which picture (assets/buttons/<name>.svg) shows a controller button, as the controller in hand
// marks it: Xbox letters by default, PlayStation shapes or a Switch's layout when one of those is
// connected. Shared by the page (ButtonIcon) and the mpv player's shortcuts (playerOsd).

export type ButtonIconName =
  | 'a_XBOX' | 'b_XBOX' | 'x_XBOX' | 'y_XBOX'
  | 'a_PS' | 'b_PS' | 'x_PS' | 'y_PS'
  | 'back_XBOX' | 'start_XBOX' | 'back_PS123' | 'start_PS123' | 'back_PS4' | 'start_PS4' | 'back_PS5' | 'start_PS5' | 'back_switch' | 'start_switch'
  | 'l' | 'r' | 'lt' | 'rt'
  | 'thumbstick_click'
  | 'dpad_all' | 'dpad_leftright'

/** The face buttons by standard-mapping position: bottom, right, left, top. */
const FACE: Record<ControllerFamily, ButtonIconName[]> = {
  xbox: ['a_XBOX', 'b_XBOX', 'x_XBOX', 'y_XBOX'],
  ps3: ['a_PS', 'b_PS', 'x_PS', 'y_PS'],
  ps4: ['a_PS', 'b_PS', 'x_PS', 'y_PS'],
  ps5: ['a_PS', 'b_PS', 'x_PS', 'y_PS'],
  // Nintendo's letters sit the other way round: B at the bottom, A on the right, Y left, X top.
  switch: ['b_XBOX', 'a_XBOX', 'y_XBOX', 'x_XBOX']
}

/** Select and Start: View and Menu on Xbox, Share/Create and Options on PlayStation, − and + on Switch. */
const SELECT_START: Record<ControllerFamily, [ButtonIconName, ButtonIconName]> = {
  xbox: ['back_XBOX', 'start_XBOX'],
  ps3: ['back_PS123', 'start_PS123'],
  ps4: ['back_PS4', 'start_PS4'],
  ps5: ['back_PS5', 'start_PS5'],
  switch: ['back_switch', 'start_switch']
}

/**
 * A button's picture (by standard-mapping index), or null for one without (the D-pad's own,
 * Home). `wide`: the bumpers, drawn across the middle of a square, shown cropped wider. `mark`:
 * which stick a stick click is.
 */
export function buttonIcon(button: number, family: ControllerFamily): { name: ButtonIconName; mark?: string; wide?: boolean } | null {
  if (button <= 3) return { name: FACE[family][button] }
  if (button === 4) return { name: 'l', wide: true }
  if (button === 5) return { name: 'r', wide: true }
  if (button === 6) return { name: 'lt' }
  if (button === 7) return { name: 'rt' }
  if (button === 8) return { name: SELECT_START[family][0] }
  if (button === 9) return { name: SELECT_START[family][1] }
  // The stick clicks share one picture: marked with which stick.
  if (button === 10) return { name: 'thumbstick_click', mark: 'L' }
  if (button === 11) return { name: 'thumbstick_click', mark: 'R' }
  return null
}

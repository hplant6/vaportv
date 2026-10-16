// What each controller button does in vaporTV. The D-pad and sticks always move;
// everything else can be moved to another button in Settings → Controller.

export type ControlAction = 'select' | 'back' | 'options' | 'favorite' | 'previousTab' | 'nextTab' | 'volumeDown' | 'volumeUp'

/** Action → standard-mapping button index. */
export type Controls = Record<ControlAction, number>

export const CONTROL_ACTIONS: { id: ControlAction; name: string; detail: string }[] = [
  { id: 'select', name: 'Select', detail: 'Open what’s highlighted' },
  { id: 'back', name: 'Back', detail: 'Close, or go back' },
  { id: 'favorite', name: 'Favorite', detail: 'Add or remove a favorite' },
  { id: 'options', name: 'Artwork', detail: 'Fix a console game’s art' },
  { id: 'previousTab', name: 'Previous tab', detail: '' },
  { id: 'nextTab', name: 'Next tab', detail: '' },
  { id: 'volumeDown', name: 'Volume down', detail: 'Hold to keep going' },
  { id: 'volumeUp', name: 'Volume up', detail: 'Hold to keep going' }
]

export const DEFAULT_CONTROLS: Controls = {
  select: 0,
  back: 1,
  options: 2,
  favorite: 3,
  previousTab: 4,
  nextTab: 5,
  volumeDown: 6,
  volumeUp: 7
}

/** Buttons an action can be given: face, shoulders, triggers, Select/Start, stick clicks. Not the D-pad or Home (Steam's). */
export const ASSIGNABLE_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3']

export function buttonName(index: number): string {
  return BUTTON_NAMES[index] ?? `Button ${index}`
}

/** Saved choices over the defaults, ignoring anything unusable. */
export function resolveControls(saved: Partial<Controls> | undefined): Controls {
  const controls = { ...DEFAULT_CONTROLS }
  for (const { id } of CONTROL_ACTIONS) {
    const button = saved?.[id]
    if (typeof button === 'number' && ASSIGNABLE_BUTTONS.includes(button)) controls[id] = button
  }
  return controls
}

/**
 * Gives `action` the `button`. An action that had that button takes `action`'s old
 * one, so no two actions share a button and every action keeps one.
 */
export function assignButton(controls: Controls, action: ControlAction, button: number): Controls {
  const next = { ...controls }
  const holder = CONTROL_ACTIONS.find((a) => a.id !== action && controls[a.id] === button)
  if (holder) next[holder.id] = controls[action]
  next[action] = button
  return next
}

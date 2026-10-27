// What each controller button does in vaporTV. The D-pad and sticks always move;
// everything else can be moved to another button in Settings → Controller.

import type { ControllerFamily } from './controllers'

export type ControlAction = 'select' | 'back' | 'options' | 'favorite' | 'controlsGuide' | 'gameMenu' | 'previousTab' | 'nextTab' | 'volumeDown' | 'volumeUp' | 'voiceSearch'

/** Action → standard-mapping button index. */
export type Controls = Record<ControlAction, number>

export const CONTROL_ACTIONS: { id: ControlAction; name: string; detail: string }[] = [
  { id: 'select', name: 'Select', detail: 'Open what’s highlighted' },
  { id: 'back', name: 'Back', detail: 'Close, or go back' },
  { id: 'favorite', name: 'Favorite', detail: 'Add or remove a favorite' },
  { id: 'options', name: 'Artwork', detail: 'Fix a console game’s art' },
  { id: 'gameMenu', name: 'Game options', detail: 'Rename, emulator, art or delete' },
  { id: 'previousTab', name: 'Previous tab', detail: '' },
  { id: 'nextTab', name: 'Next tab', detail: '' },
  { id: 'volumeDown', name: 'Volume down', detail: 'Hold to keep going' },
  { id: 'volumeUp', name: 'Volume up', detail: 'Hold to keep going' },
  { id: 'voiceSearch', name: 'Voice search', detail: 'Say a game or app' },
  { id: 'controlsGuide', name: 'Show the buttons', detail: 'What each button does, along the bottom' }
]

export const DEFAULT_CONTROLS: Controls = {
  select: 0,
  back: 1,
  options: 2,
  favorite: 3,
  controlsGuide: 8,
  gameMenu: 9,
  previousTab: 4,
  nextTab: 5,
  volumeDown: 6,
  volumeUp: 7,
  voiceSearch: 11
}

/** Buttons an action can be given: face, shoulders, triggers, Select/Start, stick clicks. Not the D-pad or Home (Steam's). */
export const ASSIGNABLE_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3']
/** Other makers' names for the same buttons, where they differ. */
const FAMILY_NAMES: Partial<Record<ControllerFamily, string[]>> = {
  ps3: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3'],
  ps4: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3'],
  ps5: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'],
  // Nintendo's letters sit the other way round.
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L stick', 'R stick']
}

/** A button's name as `family`'s controllers mark it (Xbox-style by default). */
export function buttonName(index: number, family: ControllerFamily = 'xbox'): string {
  return (FAMILY_NAMES[family] ?? BUTTON_NAMES)[index] ?? `Button ${index}`
}

/** Saved choices over the defaults, ignoring anything unusable. */
export function resolveControls(saved: Partial<Controls> | undefined): Controls {
  const controls = { ...DEFAULT_CONTROLS }
  const unsaved: ControlAction[] = []
  for (const { id } of CONTROL_ACTIONS) {
    const button = saved?.[id]
    if (typeof button === 'number' && ASSIGNABLE_BUTTONS.includes(button)) controls[id] = button
    else unsaved.push(id)
  }
  // An action added since the buttons were saved: its default, unless a saved one took it.
  for (const id of unsaved) {
    const taken = (button: number): boolean => CONTROL_ACTIONS.some((a) => a.id !== id && controls[a.id] === button)
    if (taken(controls[id])) controls[id] = ASSIGNABLE_BUTTONS.find((button) => !taken(button)) ?? controls[id]
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

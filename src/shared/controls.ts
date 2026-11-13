// What each controller button does in vaporTV. The D-pad and sticks always move;
// everything else can be moved to another button in Settings → Controller, one action to a
// button. (Volume was on the triggers until they became the left bar and the button guide;
// a remote's or keyboard's volume keys still work.)

import type { ControllerFamily } from './controllers'

export type ControlAction =
  | 'select'
  | 'back'
  | 'playlist'
  | 'favorite'
  | 'sideBar'
  | 'controlsGuide'
  | 'settings'
  | 'gameMenu'
  | 'previousTab'
  | 'nextTab'
  | 'voiceSearch'
  | 'nextSong'

/** Action → standard-mapping button index. */
export type Controls = Record<ControlAction, number>

export const CONTROL_ACTIONS: { id: ControlAction; name: string; detail: string }[] = [
  { id: 'select', name: 'Select', detail: 'Open what’s highlighted' },
  { id: 'back', name: 'Back', detail: 'Close, or go back' },
  { id: 'favorite', name: 'Favorite', detail: 'Add or remove a favorite' },
  { id: 'playlist', name: 'Playlist', detail: 'Add a game to a playlist, or take it out' },
  { id: 'gameMenu', name: 'Game options', detail: 'Rename, emulator, art or delete' },
  { id: 'previousTab', name: 'Previous tab', detail: '' },
  { id: 'nextTab', name: 'Next tab', detail: '' },
  { id: 'voiceSearch', name: 'Voice search', detail: 'Say a game or app' },
  { id: 'nextSong', name: 'Next song', detail: 'Skip to the next music track' },
  { id: 'sideBar', name: 'Left bar', detail: 'Show or hide a tab’s list' },
  { id: 'controlsGuide', name: 'Show the buttons', detail: 'What each button does, along the bottom' },
  { id: 'settings', name: 'Settings', detail: '' }
]

export const DEFAULT_CONTROLS: Controls = {
  select: 0,
  back: 1,
  playlist: 2,
  favorite: 3,
  sideBar: 6,
  controlsGuide: 7,
  settings: 8,
  gameMenu: 9,
  previousTab: 4,
  nextTab: 5,
  voiceSearch: 11,
  nextSong: 10
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

/** Actions since renamed or replaced: a button saved for the old one goes to the new. */
const RENAMED: Record<string, ControlAction> = {
  // X opened the Artwork window until it became the Playlist button (Artwork is in Game options).
  options: 'playlist'
}

/** The other action on `button`, if there is one. */
export function holderOf(controls: Controls, action: ControlAction, button: number): ControlAction | undefined {
  return CONTROL_ACTIONS.find((a) => a.id !== action && controls[a.id] === button)?.id
}

/** Saved choices over the defaults, ignoring anything unusable. */
export function resolveControls(saved: Partial<Controls> | undefined): Controls {
  const controls = { ...DEFAULT_CONTROLS }
  const unsaved: ControlAction[] = []
  const stored = (saved ?? {}) as Record<string, unknown>
  const savedButton = (id: ControlAction): unknown => {
    if (stored[id] !== undefined) return stored[id]
    const old = Object.keys(RENAMED).find((name) => RENAMED[name] === id)
    return old === undefined ? undefined : stored[old]
  }
  for (const { id } of CONTROL_ACTIONS) {
    const button = savedButton(id)
    if (typeof button === 'number' && ASSIGNABLE_BUTTONS.includes(button)) controls[id] = button
    else unsaved.push(id)
  }
  // An action added since the buttons were saved: its default, unless a saved one took it.
  for (const id of unsaved) {
    const taken = (button: number): boolean => holderOf(controls, id, button) !== undefined
    if (taken(controls[id])) controls[id] = ASSIGNABLE_BUTTONS.find((button) => !taken(button)) ?? controls[id]
  }
  return controls
}

/**
 * Gives `action` the `button`. The action that had that button takes `action`'s old one, so
 * no two share a button and every action keeps one.
 */
export function assignButton(controls: Controls, action: ControlAction, button: number): Controls {
  const next = { ...controls }
  const holder = holderOf(controls, action, button)
  if (holder) next[holder] = controls[action]
  next[action] = button
  return next
}

// The screen showing (a tab, or Settings), for what's opened over it without being told,
// like the game menu making a playlist for the tab it was opened on. App keeps it current.

let current = 'home'

export const currentScreen = (): string => current

export function setCurrentScreen(screen: string): void {
  current = screen
}

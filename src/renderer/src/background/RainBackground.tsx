import { Component, lazy, Suspense, type ReactNode } from 'react'

// Loaded on demand: the scene and its libraries are large, and only this backdrop needs them.
const RainScene = lazy(() => import('./rain/RainScene'))

/** Reports a scene that fails to load or render, instead of blanking the page. */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(err: unknown): void {
    console.error('steamtv: rain backdrop unavailable:', err)
    this.props.onError()
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/** A rainy puddle, close up. Calls onUnavailable if it can't run. */
export function RainBackground({ onUnavailable }: { onUnavailable: () => void }) {
  return (
    <div className="stage-canvas">
      <Guard onError={onUnavailable}>
        <Suspense fallback={null}>
          <RainScene />
        </Suspense>
      </Guard>
    </div>
  )
}

import { Component, type ReactNode } from "react"

/**
 * Phase 5: graceful degradation. A crashed panel becomes a bordered note with
 * a reload action — never a blank studio. One boundary per major region so a
 * Stage failure leaves the Conversation (and the cut) intact.
 */

interface Props {
  region: string
  children: ReactNode
}

interface State {
  failed: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, message: "" }

  static getDerivedStateFromError(err: unknown): State {
    return { failed: true, message: err instanceof Error ? err.message : String(err) }
  }

  componentDidCatch(err: unknown) {
    console.error(JSON.stringify({ msg: "ui-boundary", region: this.props.region, err: String(err) }))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="panel px-4 py-3" role="alert">
        <p className="eyebrow mb-1 text-bad">{this.props.region} crashed</p>
        <p className="mb-2 font-mono text-[11px] leading-relaxed text-muted">{this.state.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false, message: "" })}
          className="rounded border border-line px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-tungsten hover:text-tungsten"
        >
          retry
        </button>
      </div>
    )
  }
}

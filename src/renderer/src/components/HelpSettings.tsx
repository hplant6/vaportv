import { OPEN_BUG_REPORT_EVENT } from './BugReportDialog'
import { OPEN_WELCOME_EVENT } from './Welcome'

/** Settings → Help: the welcome tour and reporting a problem (guides to setting things up to come). */
export function HelpSettings() {
  return (
    <div className="settings-group">
      <h3 className="settings-heading display">Get help</h3>
      <div className="setting-list" data-focus-memory="settings-help">
        <button
          className="setting-row"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={() => window.dispatchEvent(new Event(OPEN_WELCOME_EVENT))}
        >
          <span className="setting-name display">Show the welcome tour</span>
          <span className="setting-detail">The buttons, and setting up apps</span>
        </button>
        <button
          className="setting-row"
          tabIndex={-1}
          data-focusable=""
          data-select-sound="move"
          onClick={(e) => window.dispatchEvent(new CustomEvent(OPEN_BUG_REPORT_EVENT, { detail: e.currentTarget }))}
        >
          <span className="setting-name display">Report a problem</span>
          <span className="setting-detail">A QR code to send it from your phone</span>
        </button>
      </div>
    </div>
  )
}

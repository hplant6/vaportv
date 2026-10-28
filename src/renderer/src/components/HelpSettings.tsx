import { GUIDES } from '../guides'
import { OPEN_BUG_REPORT_EVENT } from './BugReportDialog'
import { OPEN_GUIDE_EVENT } from './GuideReader'
import { OPEN_WELCOME_EVENT } from './Welcome'

/** Settings → Help: the welcome tour, reporting a problem, and the guides (docs/guides). */
export function HelpSettings() {
  return (
    <>
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
      {GUIDES.length > 0 && (
        <div className="settings-group">
          <h3 className="settings-heading display">Guides</h3>
          <div className="setting-list" data-focus-memory="settings-guides">
            {GUIDES.map((guide) => (
              <button
                key={guide.file}
                className="setting-row"
                tabIndex={-1}
                data-focusable=""
                data-select-sound="move"
                onClick={(e) => window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { file: guide.file, from: e.currentTarget } }))}
              >
                <span className="setting-name display">{guide.title}</span>
                <span className="setting-detail">{guide.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

import type { MediaItem } from "../../../shared/types";
import { MEDIA_PLAY_EVENT } from "./ContinueWatching";
import { toast } from "./Toast";

/** A show opens its seasons (MediaShow listens: detail is { source, id, title }). */
export const MEDIA_SHOW_EVENT = "steamtv:media-show";

/** 52m, 1h 52m. */
function runtime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
}

/** Rotten Tomatoes' marks: a tomato for fresh (60% and up), a splat for rotten. Drawn here, not theirs. */
function Tomato({ fresh }: { fresh: boolean }) {
  return fresh ? (
    <svg className="poster-bar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="9.3" r="5.9" fill="#fa320a" />
      <path
        d="M8 3.6c-.6-1.2-1.7-1.8-2.9-1.7.9.5 1.4 1.1 1.6 1.9-1.1-.4-2.2-.2-3 .5 1.2 0 2.2.4 2.8 1.1C7.4 5.6 8.5 5.4 9.3 4.7c.6.7 1.6 1 2.7.8-.6-.7-1.5-1.2-2.5-1.3.6-.5 1-1.2 1-2-1 .4-1.9 1-2.5 1.4Z"
        fill="#00912d"
      />
    </svg>
  ) : (
    <svg className="poster-bar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5 9.2 5l3.4-1.6-1.4 3.5 3.6.9-3.2 1.9 2.3 2.9-3.7-.4.3 3.7L8 13.3l-2.5 2.6.3-3.7-3.7.4 2.3-2.9L1.2 7.8l3.6-.9-1.4-3.5L6.8 5 8 1.5Z"
        fill="#0ac855"
      />
    </svg>
  );
}

/**
 * A film or show as a poster, as the console tabs' game cards: the poster (or a still over a
 * blur of itself, or the title on the dark fade), a tick once watched, a show's unwatched
 * count, a gold line when part-watched, and its name and year in the footer. A plays a film or
 * episode from where it was left; a show opens its seasons.
 *
 * `barOnHold` (the Video tab's grid): only the poster, as Steam's grid shows only the art; its
 * bar (name, length or year, and the critics' score) slides up over it once the cursor has
 * rested on it a moment. The part-watched line stays in sight, over the bar.
 */
export function MediaPoster({
  item,
  index,
  isDefault,
  onFocus,
  barOnHold = false,
}: {
  item: MediaItem;
  index?: number;
  isDefault?: boolean;
  onFocus?: () => void;
  barOnHold?: boolean;
}) {
  const open = (): void => {
    if (item.kind === "series") {
      if (
        !window.dispatchEvent(
          new CustomEvent(MEDIA_SHOW_EVENT, {
            detail: { source: item.source, id: item.id, title: item.title },
            cancelable: true,
          }),
        )
      )
        return;
      // Nothing took it: not on the Media tab.
      toast(`Open ${item.title} from the Video tab`);
      return;
    }
    window.dispatchEvent(
      new CustomEvent(MEDIA_PLAY_EVENT, {
        detail: { source: item.source, id: item.id },
      }),
    );
  };
  return (
    <button
      className={`recent-card media-poster${barOnHold ? " bar-on-hold" : ""}`}
      tabIndex={-1}
      data-focusable=""
      data-select-sound="move"
      data-item-id={item.id}
      data-media-source={item.source}
      data-index={index}
      {...(isDefault ? { "data-focus-default": "" } : {})}
      aria-label={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ""}${item.watched ? ", watched" : ""}`}
      onClick={open}
      onFocus={onFocus}
    >
      <div className="recent-art">
        {item.favorite && (
          <span className="favorite-star media-star" aria-label="Favourite">
            ★
          </span>
        )}
        {item.cover ? (
          // Lazy: a library's grid can run to thousands; the server's pictures come as they near the screen.
          <img src={item.cover} alt="" loading="lazy" />
        ) : item.wide ? (
          <>
            <img className="recent-art-backdrop" src={item.wide} alt="" />
            <img className="recent-art-centred" src={item.wide} alt="" />
          </>
        ) : (
          <span className="recent-no-art display">
            <span className="no-art-band">{item.title}</span>
          </span>
        )}
        {item.watched && (
          <span className="media-badge media-watched" aria-hidden="true">
            ✓
          </span>
        )}
        {!item.watched &&
          item.unwatched !== undefined &&
          item.unwatched > 0 && (
            <span className="media-badge media-unwatched" aria-hidden="true">
              {item.unwatched}
            </span>
          )}
        {item.progress > 0 && !item.watched && (
          <span className="watch-progress">
            <span
              className="watch-progress-fill"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </span>
        )}
        {barOnHold && <PosterBar item={item} />}
      </div>
      {!barOnHold && (
        <div className="recent-footer">
          <div className="recent-text">
            <div className="recent-title">{item.title}</div>
            <div className="recent-date">{item.subtitle}</div>
          </div>
        </div>
      )}
    </button>
  );
}

/**
 * The bar that slides up over a poster in the Video tab's grid: its name, then its length (a
 * show's year, as it has no one length) and the critics' score, else the community rating.
 */
function PosterBar({ item }: { item: MediaItem }) {
  const length =
    item.kind !== "series" && item.runtimeMinutes
      ? runtime(item.runtimeMinutes)
      : item.subtitle;
  return (
    <div className="recent-footer poster-bar">
      <div className="recent-text">
        <div className="recent-title">{item.title}</div>
        <div className="recent-date">
          {length}
          {item.criticRating !== undefined ? (
            <span
              className="poster-bar-score"
              aria-label={`Rotten Tomatoes ${item.criticRating}%`}
            >
              <Tomato fresh={item.criticRating >= 60} />
              {Math.round(item.criticRating)}%
            </span>
          ) : item.rating ? (
            <span
              className="poster-bar-score"
              aria-label={`Rated ${item.rating.toFixed(1)} out of 10`}
            >
              ★ {item.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

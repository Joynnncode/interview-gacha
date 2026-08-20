/**
 * The eye-contact numbers, shown after the rating.
 *
 * After, not during — the dot is the live feedback, and a percentage ticking
 * over while you speak would just give you something new to stare at.
 *
 * Tone rules, same as everywhere else in this app: no red, no scolding, no
 * "you failed". Rule 7 means none of this touches points, so the copy must not
 * imply it does either. A low percentage gets a neutral observation and a
 * concrete thing to try, never a telling-off.
 */

import type { GazeDirection, GazeSummary } from '../types';
import { isSummaryWorthShowing, onCameraRatio } from '../vision/gazeTracker';
import { formatDuration } from './ui';

/** Where the "well done" line stops and the "here's the thing to try" line starts. */
const CONTACT_BANDS = [
  { min: 0.9, note: 'Locked on. That is what an interviewer remembers.' },
  { min: 0.75, note: 'Steady, with a few natural drifts. This is a good place to be.' },
  { min: 0.55, note: 'You held the lens about two thirds of the time.' },
  { min: 0, note: 'The eyes wandered a fair bit this time. The dot is there to pull them back.' },
] as const;

const DIRECTION_NOTE: Record<GazeDirection, string> = {
  down: 'Most drifts went downwards — usually notes, or a second screen below the lens.',
  up: 'Most drifts went upwards — often what thinking-out-loud looks like.',
  left: 'Most drifts went to your left. Worth checking what is on that side of the desk.',
  right: 'Most drifts went to your right. Worth checking what is on that side of the desk.',
};

function dominantDirection(summary: GazeSummary): GazeDirection | null {
  if (summary.glances.length < 3) return null;

  const tally = new Map<GazeDirection, number>();
  for (const glance of summary.glances) {
    tally.set(glance.direction, (tally.get(glance.direction) ?? 0) + 1);
  }

  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [direction, count] = ranked[0];
  // Only call it a pattern if it is actually one, rather than a 2–2 split.
  return count / summary.glances.length >= 0.5 ? direction : null;
}

export interface GazeReportProps {
  summary: GazeSummary | undefined;
  /** Length of the recording, used to place glances on the timeline. */
  durationSec: number | undefined;
}

export function GazeReport({ summary, durationSec }: GazeReportProps) {
  if (!isSummaryWorthShowing(summary)) return null;

  const ratio = onCameraRatio(summary);
  const percent = Math.round(ratio * 100);
  const band = CONTACT_BANDS.find((entry) => ratio >= entry.min) ?? CONTACT_BANDS[CONTACT_BANDS.length - 1];
  const direction = dominantDirection(summary);
  const span = Math.max(durationSec ?? summary.trackedSec, 1);

  return (
    <div className="rounded-toy-lg bg-cream-deep p-5">
      <h3 className="text-sm font-bold text-ink">Where your eyes were</h3>

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-4xl font-bold tabular-nums text-ink">{percent}%</p>
          <p className="text-xs text-ink-soft">on the lens</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-ink">{summary.glanceCount}</p>
          <p className="text-xs text-ink-soft">
            {summary.glanceCount === 1 ? 'glance away' : 'glances away'}
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-ink">
            {formatDuration(summary.longestHoldSec)}
          </p>
          <p className="text-xs text-ink-soft">longest unbroken hold</p>
        </div>
      </div>

      {/* Timeline. The track is the recording; each mark is one glance. */}
      <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-card">
        <div className="absolute inset-0 bg-tech/40" />
        {summary.glances.map((glance, index) => (
          <div
            key={`${glance.atSec}-${index}`}
            className="absolute top-0 h-full rounded-full bg-peach"
            style={{
              left: `${Math.min((glance.atSec / span) * 100, 100)}%`,
              // Floor the width so a half-second glance is still visible.
              width: `${Math.max((glance.durationSec / span) * 100, 1.2)}%`,
            }}
            title={`${formatDuration(glance.atSec)} · looked ${glance.direction} for ${glance.durationSec.toFixed(1)}s`}
          />
        ))}
      </div>

      <p className="mt-4 text-sm text-ink-soft">{band.note}</p>
      {direction ? <p className="mt-1 text-sm text-ink-soft">{DIRECTION_NOTE[direction]}</p> : null}

      {summary.untrackedSec > summary.trackedSec * 0.2 ? (
        <p className="mt-3 rounded-toy bg-card p-3 text-xs text-ink-soft">
          Your face was out of frame for {formatDuration(summary.untrackedSec)} of this one, so these
          numbers cover less than the whole answer. Sitting a little further back usually fixes it.
        </p>
      ) : null}

      <p className="mt-3 text-xs text-ink-faint">
        No video was recorded or stored — only these numbers. Eye contact never affects points.
      </p>
    </div>
  );
}

/** One-line version for a history row, where there is no space for the full card. */
export function GazeLine({ summary }: { summary: GazeSummary | undefined }) {
  if (!isSummaryWorthShowing(summary)) return null;

  return (
    <span className="text-xs text-ink-soft">
      👁 {Math.round(onCameraRatio(summary) * 100)}% on the lens · {summary.glanceCount}{' '}
      {summary.glanceCount === 1 ? 'glance' : 'glances'}
    </span>
  );
}

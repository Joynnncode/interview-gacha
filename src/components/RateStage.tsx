/**
 * Stage three: self-rating, BEFORE the reference answer is shown.
 *
 * This ordering is the point. Rating after reading the model answer would only
 * measure how good the model answer is. Rating first measures the attempt.
 *
 * None of the three options is a failure, and none of them changes the points.
 */

import { RATING_COPY, STAGE_COPY } from '../game/flow';
import type { SelfRating } from '../types';
import { formatDuration } from './ui';

const ORDER: SelfRating[] = ['shaky', 'ok', 'solid'];

const RATING_ICON: Record<SelfRating, string> = {
  shaky: '🌱',
  ok: '🙂',
  solid: '🌟',
};

/** Each option gets its own soft tint. Nothing here is red or scolding. */
const RATING_STYLE: Record<SelfRating, string> = {
  shaky: 'bg-rarity-r/40 hover:bg-rarity-r/60',
  ok: 'bg-behavioural/30 hover:bg-behavioural/50',
  solid: 'bg-tech/40 hover:bg-tech/60',
};

export interface RateStageProps {
  durationSec: number | undefined;
  /** Object URL for the recording, so the attempt can be played back first. */
  recordingUrl: string | undefined;
  onRate: (rating: SelfRating) => void;
  submitting: boolean;
}

export function RateStage({ durationSec, recordingUrl, onRate, submitting }: RateStageProps) {
  const copy = STAGE_COPY.rating;

  return (
    <div className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
      <h2 className="text-lg font-bold text-ink">{copy.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{copy.hint}</p>

      {recordingUrl ? (
        <div className="mt-5 rounded-toy bg-cream-deep/70 p-4">
          <p className="mb-2 text-sm font-semibold text-ink">
            Your answer · {formatDuration(durationSec)}
          </p>
          {/* Listening back before rating is optional but usually more honest. */}
          <audio controls src={recordingUrl} className="w-full">
            Your browser cannot play this recording.
          </audio>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {ORDER.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            disabled={submitting}
            className={`toy-press rounded-toy p-5 text-left shadow-soft disabled:opacity-60 ${RATING_STYLE[rating]}`}
          >
            <span className="text-2xl" aria-hidden="true">
              {RATING_ICON[rating]}
            </span>
            <span className="mt-2 block font-bold text-ink">{RATING_COPY[rating].label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              {RATING_COPY[rating].hint}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Whichever you pick, you keep the same points. The rating only decides how soon this question
        comes round again.
      </p>
    </div>
  );
}

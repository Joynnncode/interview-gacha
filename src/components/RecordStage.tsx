/**
 * Stages one and two: read the question, then record.
 *
 * The recorder's own state is separate from the flow stage in the database.
 * This component owns the microphone; the caller owns the flow.
 */

import { motion } from 'framer-motion';
import { POINTS_CONFIG } from '../game/config';
import { STAGE_COPY } from '../game/flow';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { UseRecorder } from '../hooks/useRecorder';
import { Button, formatDuration } from './ui';

export interface RecordStageProps {
  recorder: UseRecorder;
  /** The question's spoken time target, shown as a soft guide. */
  timeTargetSec: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  /** Set while the recording is being written to the database. */
  saving: boolean;
  /** Set when the last attempt was too short to count. */
  tooShort: boolean;
}

export function RecordStage({
  recorder,
  timeTargetSec,
  onStart,
  onStop,
  onCancel,
  saving,
  tooShort,
}: RecordStageProps) {
  const reducedMotion = useReducedMotion();
  const isRecording = recorder.state === 'recording';
  const copy = STAGE_COPY[isRecording ? 'recording' : 'drawn'];

  // Progress towards the time target, capped at 1. Purely informational — going
  // over is fine and nothing turns red.
  const progress = Math.min(recorder.elapsedSec / Math.max(timeTargetSec, 1), 1);

  return (
    <div className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
      <h2 className="text-lg font-bold text-ink">{copy.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{copy.hint}</p>

      {isRecording ? (
        <div className="mt-6">
          <div className="flex items-center gap-4">
            {/* Pulsing dot in peach — never red. */}
            <motion.span
              aria-hidden="true"
              className="h-4 w-4 rounded-full bg-peach"
              animate={reducedMotion ? undefined : { scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-3xl font-bold tabular-nums text-ink">
              {formatDuration(recorder.elapsedSec)}
            </span>
            <span className="text-sm text-ink-soft">of about {formatDuration(timeTargetSec)}</span>
          </div>

          {/* Soft progress track. Fills past the target without changing colour. */}
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-cream-deep">
            <motion.div
              className="h-full rounded-full bg-tech"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.2, ease: 'linear' }}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button tone="primary" size="lg" onClick={onStop} disabled={saving}>
              {saving ? 'Saving…' : 'Done speaking'}
            </Button>
            <Button tone="quiet" onClick={onCancel} disabled={saving}>
              Discard and start again
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <Button
            tone="primary"
            size="lg"
            onClick={onStart}
            disabled={recorder.state === 'requesting' || saving}
          >
            {recorder.state === 'requesting' ? 'Waiting for the mic…' : '🎙️ Start recording'}
          </Button>

          {tooShort ? (
            <p className="mt-4 rounded-toy bg-cream-deep p-4 text-sm text-ink-soft">
              That one came in under {POINTS_CONFIG.minValidRecordingSec} seconds, so it has not been
              saved. Have another go whenever you are ready — the question is still here.
            </p>
          ) : null}

          {recorder.message ? (
            <div className="mt-4 rounded-toy bg-cream-deep p-4 text-sm text-ink-soft">
              <p className="font-semibold text-ink">Microphone unavailable</p>
              <p className="mt-1">{recorder.message}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

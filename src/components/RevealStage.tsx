/**
 * Stage four: the reveal.
 *
 * Guarded by isAnswerUnlocked(). If that returns false this renders nothing at
 * all — no partial hints, no "almost there" teaser. There is exactly one way in
 * and it runs through a recording and a self-rating.
 */

import { motion } from 'framer-motion';
import { useState } from 'react';
import { isAnswerUnlocked } from '../game/flow';
import { RATING_COPY } from '../game/flow';
import type { PointsBreakdown } from '../game/rewards';
import type { Badge, Question, Session } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AnswerText } from './AnswerText';
import { GazeReport } from './GazeReport';
import { Button, formatDuration } from './ui';

export interface RevealStageProps {
  question: Question;
  session: Session;
  points: PointsBreakdown | null;
  newBadges: Badge[];
  recordingUrl: string | undefined;
  onSaveNote: (note: string) => void;
  onDrawAgain: () => void;
}

export function RevealStage({
  question,
  session,
  points,
  newBadges,
  recordingUrl,
  onSaveNote,
  onDrawAgain,
}: RevealStageProps) {
  const reducedMotion = useReducedMotion();
  const [note, setNote] = useState(session.note ?? '');
  const [noteSaved, setNoteSaved] = useState(false);

  // The gate. Nothing below this line renders unless it passes.
  if (!isAnswerUnlocked(session)) return null;

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* What you earned. Never conditional on how well it went. */}
      {points ? (
        <div className="rounded-toy-lg bg-gold/25 p-6 shadow-soft">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold text-ink">+{points.total}</span>
            <span className="font-semibold text-ink">points banked</span>
            <span className="text-sm text-ink-soft">
              for recording {formatDuration(session.durationSec)}
            </span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
            <li>Recording it: {points.base}</li>
            {points.rarityBonus > 0 ? <li>{question.rarity} bonus: {points.rarityBonus}</li> : null}
            {points.onTargetBonus > 0 ? <li>Near the time target: {points.onTargetBonus}</li> : null}
            {points.dailyFirstBonus > 0 ? <li>First today: {points.dailyFirstBonus}</li> : null}
            {points.streakBonus > 0 ? <li>Streak: {points.streakBonus}</li> : null}
          </ul>
          {session.selfRating ? (
            <p className="mt-3 text-sm text-ink-soft">
              You called it <strong className="text-ink">{RATING_COPY[session.selfRating].label}</strong>.{' '}
              {RATING_COPY[session.selfRating].hint}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        Eye contact, if the camera was on. Sits after the points on purpose: the
        reward lands first, and this is information rather than a verdict.
      */}
      <GazeReport summary={session.gaze} durationSec={session.durationSec} />

      {newBadges.length > 0 ? (
        <div className="rounded-toy-lg bg-tech/25 p-6 shadow-soft">
          <h3 className="font-bold text-ink">
            {newBadges.length === 1 ? 'New badge' : `${newBadges.length} new badges`}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-3">
            {newBadges.map((badge) => (
              <li
                key={badge.id}
                className="flex items-center gap-2 rounded-toy bg-card px-4 py-2 shadow-soft"
              >
                <span className="text-xl" aria-hidden="true">
                  {badge.icon}
                </span>
                <span>
                  <span className="block text-sm font-bold text-ink">{badge.name}</span>
                  <span className="block text-xs text-ink-soft">{badge.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The beats: the actual thing to memorise. */}
      <section className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
        <h3 className="text-lg font-bold text-ink">The beats</h3>
        <p className="mt-1 text-sm text-ink-soft">
          This is the structure to keep. Compare it against what you just said.
        </p>
        <ol className="mt-4 space-y-3">
          {question.beats.map((beat, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-behavioural/60 text-xs font-bold text-ink">
                {index + 1}
              </span>
              <span className="text-base leading-relaxed text-ink">{beat}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
        <h3 className="text-lg font-bold text-ink">Reference answer</h3>
        <p className="mt-1 mb-4 text-sm text-ink-soft">
          Compare the structure, not the wording. Yours should sound like you.
        </p>
        <AnswerText source={question.modelAnswer} />
      </section>

      <section className="rounded-toy-lg bg-cream-deep/80 p-6">
        <h3 className="text-lg font-bold text-ink">What this question is really testing</h3>
        <p className="mt-3 text-base leading-relaxed text-ink">{question.coach}</p>
      </section>

      {recordingUrl ? (
        <section className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
          <h3 className="text-lg font-bold text-ink">Listen back</h3>
          <p className="mt-1 mb-3 text-sm text-ink-soft">
            Now that you know the beats, it is worth hearing which ones you actually hit.
          </p>
          <audio controls src={recordingUrl} className="w-full">
            Your browser cannot play this recording.
          </audio>
        </section>
      ) : null}

      <section className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
        <label htmlFor="session-note" className="text-lg font-bold text-ink">
          Note to yourself
        </label>
        <p className="mt-1 text-sm text-ink-soft">
          Optional. One line about what to change next time is usually enough.
        </p>
        <textarea
          id="session-note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteSaved(false);
          }}
          rows={3}
          className="mt-3 w-full rounded-toy bg-cream-deep/60 p-4 text-base text-ink placeholder:text-ink-faint"
          placeholder="Missed the third beat entirely — start with the number next time."
        />
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => {
              onSaveNote(note);
              setNoteSaved(true);
            }}
          >
            Save note
          </Button>
          {noteSaved ? <span className="text-sm text-ink-soft">Saved.</span> : null}
        </div>
      </section>

      <div className="flex justify-center pb-4">
        <Button tone="primary" size="lg" onClick={onDrawAgain}>
          Draw another
        </Button>
      </div>
    </motion.div>
  );
}

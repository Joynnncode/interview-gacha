/**
 * The pet.
 *
 * It droops when it has not seen you for a while, and that is the whole extent
 * of it. It never dies, never disappears, never asks for anything and never
 * implies you have let it down. Read PET_MOOD_COPY before adding any copy here.
 */

import { motion } from 'framer-motion';
import { PET_MOOD_COPY, PET_STAGE_COPY, progressToNextStage } from '../game/rewards';
import type { PetState } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PET_FACE } from './petFace';

export function PetPanel({ pet }: { pet: PetState }) {
  const reducedMotion = useReducedMotion();
  const next = progressToNextStage(pet.totalPoints);
  const sleepy = pet.mood === 'sleepy';

  return (
    <section className="rounded-toy-lg bg-card p-6 shadow-soft ring-1 ring-ink/5">
      <div className="flex items-start gap-5">
        {/* The pet itself, in a soft nest. */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-behavioural/30">
          <motion.span
            className="text-5xl"
            aria-hidden="true"
            animate={
              reducedMotion
                ? undefined
                : sleepy
                  ? { y: [0, 2, 0], rotate: [-3, -3, -3] }
                  : { y: [0, -6, 0] }
            }
            transition={{
              duration: sleepy ? 4 : 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={sleepy ? { filter: 'saturate(0.75)' } : undefined}
          >
            {PET_FACE[pet.stage]}
          </motion.span>
          {sleepy ? (
            <span className="absolute -right-1 top-0 text-lg" aria-hidden="true">
              💤
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-xl font-bold text-ink">{pet.name}</h2>
            <span className="rounded-full bg-tech/50 px-3 py-0.5 text-xs font-bold text-ink">
              {PET_STAGE_COPY[pet.stage]}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{PET_MOOD_COPY[pet.mood]}</p>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-soft">Points</dt>
              <dd className="font-bold text-ink">{pet.totalPoints}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-soft">Streak</dt>
              <dd className="font-bold text-ink">
                {pet.streakDays} {pet.streakDays === 1 ? 'day' : 'days'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-soft">Best</dt>
              <dd className="font-bold text-ink">
                {pet.bestStreakDays} {pet.bestStreakDays === 1 ? 'day' : 'days'}
              </dd>
            </div>
          </dl>

          {next ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-ink-soft">
                <span>Next: {PET_STAGE_COPY[next.next]}</span>
                <span>{next.remaining} points to go</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-cream-deep">
                <motion.div
                  className="h-full rounded-full bg-peach"
                  initial={{ width: 0 }}
                  animate={{ width: `${stageProgressPercent(pet.totalPoints, next.remaining)}%` }}
                  transition={{ duration: reducedMotion ? 0 : 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm font-semibold text-ink">
              Fully grown. It just keeps you company now.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** How far through the current stage band the points are. */
function stageProgressPercent(totalPoints: number, remaining: number): number {
  const target = totalPoints + remaining;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((totalPoints / target) * 100));
}

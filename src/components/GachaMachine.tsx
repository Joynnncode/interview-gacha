/**
 * The gacha machine.
 *
 * A capsule drops, wobbles, then cracks open. All of it is decorative: the draw
 * itself has already happened in the data layer by the time this plays, so a
 * skipped or reduced-motion animation never changes the outcome.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { Rarity } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Button } from './ui';

/** Animation timings, in seconds. */
const ANIM = {
  capsuleDrop: 0.7,
  wobble: 0.9,
  crack: 0.5,
  /** How long the whole sequence takes before the question is shown. */
  totalMs: 2100,
  reducedTotalMs: 250,
} as const;

/** Capsule shell colour per rarity. SSR uses the rainbow class instead. */
const CAPSULE_FILL: Record<Rarity, string> = {
  N: 'bg-rarity-n',
  R: 'bg-rarity-r',
  SR: 'bg-rarity-sr',
  SSR: 'ssr-rainbow',
};

export type MachinePhase = 'idle' | 'drawing' | 'opened';

export interface GachaMachineProps {
  phase: MachinePhase;
  /** Rarity of the capsule currently in flight. Unknown while idle. */
  rarity?: Rarity;
  onPull: () => void;
  disabled?: boolean;
  /** Copy under the lever, e.g. how many questions are in the pool. */
  caption?: string;
}

export function machineDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? ANIM.reducedTotalMs : ANIM.totalMs;
}

export function GachaMachine({ phase, rarity, onPull, disabled, caption }: GachaMachineProps) {
  const reducedMotion = useReducedMotion();
  const isDrawing = phase === 'drawing';

  return (
    <div className="flex flex-col items-center gap-6">
      {/* The machine body */}
      <div className="relative">
        <motion.div
          animate={
            isDrawing && !reducedMotion
              ? { rotate: [0, -1.5, 1.5, -1, 0], y: [0, -2, 0] }
              : { rotate: 0, y: 0 }
          }
          transition={{ duration: ANIM.wobble, ease: 'easeInOut' }}
          className="w-72"
        >
          {/* Glass dome full of capsules */}
          <div className="relative h-52 overflow-hidden rounded-t-[9rem] bg-gradient-to-b from-white/90 to-cream-deep shadow-soft ring-1 ring-ink/5">
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap-reverse items-end justify-center gap-1.5 p-4">
              {DECORATIVE_CAPSULES.map((capsule, index) => (
                <motion.span
                  key={index}
                  aria-hidden="true"
                  className={`h-8 w-8 rounded-full ${capsule} shadow-inset-toy`}
                  animate={
                    isDrawing && !reducedMotion ? { y: [0, -6, 0], rotate: [0, 12, 0] } : undefined
                  }
                  transition={{
                    duration: 0.5,
                    delay: index * 0.04,
                    repeat: isDrawing ? 2 : 0,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            {/* Highlight on the glass */}
            <div className="pointer-events-none absolute left-8 top-8 h-20 w-10 rotate-12 rounded-full bg-white/70 blur-md" />
          </div>

          {/* Base with the dial */}
          <div className="rounded-b-toy-lg bg-behavioural/80 px-6 pb-6 pt-5 shadow-soft">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream shadow-inset-toy">
              <motion.div
                animate={isDrawing && !reducedMotion ? { rotate: 180 } : { rotate: 0 }}
                transition={{ duration: ANIM.capsuleDrop, ease: 'easeInOut' }}
                className="h-8 w-2 rounded-full bg-peach"
              />
            </div>
            {/* Delivery slot */}
            <div className="mx-auto mt-4 h-6 w-24 rounded-toy bg-ink/10 shadow-inset-toy" />
          </div>
        </motion.div>

        {/* The capsule in flight */}
        <AnimatePresence>
          {isDrawing && rarity ? (
            <motion.div
              key="capsule"
              initial={{ opacity: 0, y: -30, scale: 0.6 }}
              animate={
                reducedMotion
                  ? { opacity: 1, y: 96, scale: 1 }
                  : { opacity: 1, y: [-30, 60, 96, 90, 96], scale: [0.6, 1, 1, 1.05, 1] }
              }
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: reducedMotion ? 0.1 : ANIM.capsuleDrop + ANIM.crack }}
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2"
            >
              <div
                className={`h-16 w-16 rounded-full ${CAPSULE_FILL[rarity]} shadow-lift ring-2 ring-white/70`}
              >
                <div className="mt-8 h-px w-full bg-white/60" />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="text-center">
        <Button tone="primary" size="lg" onClick={onPull} disabled={disabled || isDrawing}>
          {isDrawing ? 'Opening…' : "Today's question"}
        </Button>
        {caption ? <p className="mt-3 text-sm text-ink-soft">{caption}</p> : null}
      </div>
    </div>
  );
}

/** Purely decorative capsules sitting in the dome. */
const DECORATIVE_CAPSULES = [
  'bg-behavioural',
  'bg-tech',
  'bg-gold',
  'bg-rarity-sr',
  'bg-peach',
  'bg-rarity-r',
  'bg-tech',
  'bg-behavioural',
  'bg-rarity-n',
  'bg-gold',
  'bg-peach',
  'bg-tech',
];

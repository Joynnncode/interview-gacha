/**
 * Loading state: the pet spins.
 *
 * There is no generic spinner anywhere in this app. Waiting is a moment the pet
 * gets to fill, which keeps even the dead time warm.
 *
 * Under reduced motion it holds still and just breathes very slightly, so the
 * state still reads as "working" without any rotation.
 */

import { motion } from 'framer-motion';
import { DEFAULT_PET_FACE } from './petFace';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface PetSpinnerProps {
  /** What is being waited for. Kept short and warm. */
  label?: string;
  face?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_STYLE = {
  sm: { box: 'h-10 w-10', glyph: 'text-2xl', text: 'text-xs' },
  md: { box: 'h-16 w-16', glyph: 'text-4xl', text: 'text-sm' },
  lg: { box: 'h-24 w-24', glyph: 'text-5xl', text: 'text-base' },
} as const;

export function PetSpinner({ label, face = DEFAULT_PET_FACE, size = 'md' }: PetSpinnerProps) {
  const reducedMotion = useReducedMotion();
  const style = SIZE_STYLE[size];

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className={`relative flex items-center justify-center ${style.box}`}>
        {/* A soft ring the pet tumbles inside. */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-behavioural/25"
          animate={reducedMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.7, 0.4, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden="true"
          className={`relative ${style.glyph}`}
          animate={
            reducedMotion
              ? { scale: [1, 1.05, 1] }
              : { rotate: [0, 14, -14, 0], y: [0, -5, 0, 0] }
          }
          transition={{
            duration: reducedMotion ? 2.4 : 1.6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {face}
        </motion.span>
      </div>
      {label ? <p className={`${style.text} text-ink-soft`}>{label}</p> : null}
    </div>
  );
}

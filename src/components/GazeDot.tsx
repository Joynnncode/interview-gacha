/**
 * The "look here" dot.
 *
 * It is pinned to the top centre of the window because that is where a MacBook's
 * lens is, and that is the whole trick: the thing you are meant to look at is
 * put where you are meant to look. Following it *is* the training.
 *
 * Deliberately not a counter. A number ticking up during an answer teaches you
 * to watch the number, which is the opposite of the point. Numbers come after
 * the rating, in GazeReport.
 *
 * Nothing here is red and nothing here scolds. Drifting makes the dot go quiet
 * and pale; coming back makes it warm again. That is the entire vocabulary.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface GazeDotProps {
  /** Hidden entirely when false, so a normal recording has no camera furniture. */
  visible: boolean;
  /** Debounced eye contact. */
  onCamera: boolean;
  /** False when no face is in frame — a different problem from looking away. */
  faceVisible: boolean;
}

export function GazeDot({ visible, onCamera, faceVisible }: GazeDotProps) {
  const reducedMotion = useReducedMotion();

  const status = !faceVisible ? 'lost' : onCamera ? 'held' : 'drifted';
  const caption =
    status === 'lost' ? 'Move back into frame' : status === 'held' ? 'Holding' : 'Eyes back up here';

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="gaze-dot"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.05 : 0.3 }}
          className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-1"
          // Announced politely rather than assertively: this updates while the
          // user is mid-sentence and must not interrupt a screen reader.
          aria-live="polite"
        >
          <div className="relative flex h-7 w-7 items-center justify-center">
            {/* Halo. Present only when contact is held, so it reads as a reward. */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-tech"
              animate={
                status === 'held'
                  ? reducedMotion
                    ? { opacity: 0.45, scale: 1.35 }
                    : { opacity: [0.25, 0.5, 0.25], scale: [1.2, 1.5, 1.2] }
                  : { opacity: 0, scale: 1 }
              }
              transition={
                reducedMotion
                  ? { duration: 0.2 }
                  : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
              }
            />
            <motion.span
              aria-hidden="true"
              className="relative h-3.5 w-3.5 rounded-full"
              animate={{
                backgroundColor:
                  status === 'held'
                    ? 'var(--color-tech-deep)'
                    : status === 'drifted'
                      ? 'var(--color-peach)'
                      : 'var(--color-ink-faint)',
                opacity: status === 'held' ? 1 : 0.55,
              }}
              transition={{ duration: reducedMotion ? 0.1 : 0.45, ease: 'easeOut' }}
            />
          </div>
          <span className="rounded-full bg-card/80 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-soft shadow-soft">
            {caption}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

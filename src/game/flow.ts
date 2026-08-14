/**
 * The four-stage answering flow, as a state machine.
 *
 *   drawn ──record──▶ recording ──stop──▶ rating ──rate──▶ revealed
 *     │                   │
 *     └───────────────────┘  (cancel: back to drawn, recording discarded)
 *
 * Two rules are load-bearing and must not be relaxed:
 *
 *   1. `beats`, `modelAnswer` and `coach` are only readable at 'revealed'.
 *      isAnswerUnlocked() below is the ONLY gate — no component should invent
 *      its own condition for showing those fields.
 *   2. Self-rating comes before the reveal. Rating after seeing the reference
 *      answer would just measure how well the answer reads, not how the attempt
 *      went. Do not reorder these to make the flow feel smoother.
 */

import type { FlowStage, Question, SelfRating, Session } from '../types';

/** Legal transitions. Anything not listed here is a bug, not an edge case. */
const ALLOWED_TRANSITIONS: Record<FlowStage, FlowStage[]> = {
  drawn: ['recording'],
  // 'drawn' is reachable again from 'recording' when a recording is cancelled
  // or came out too short to count.
  recording: ['rating', 'drawn'],
  rating: ['revealed'],
  revealed: [],
};

export function canTransition(from: FlowStage, to: FlowStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: FlowStage, to: FlowStage) {
    super(`Invalid flow transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Throwing version, for use at the boundary where state is actually written. */
export function assertTransition(from: FlowStage, to: FlowStage): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

// ---------------------------------------------------------------------------
// The spoiler gate
// ---------------------------------------------------------------------------

/**
 * Whether the reference material may be rendered.
 *
 * This is the reason the app exists: reading the model answer before speaking
 * teaches recognition, not recall. Every component that touches `beats`,
 * `modelAnswer` or `coach` must call this first.
 *
 * Deliberately strict — it requires a recording AND a rating AND the stage,
 * so no single piece of bad state can leak the answer.
 */
export function isAnswerUnlocked(session: Session | undefined | null): boolean {
  if (!session) return false;
  if (session.stage !== 'revealed') return false;
  if (!session.selfRating) return false;
  if (typeof session.durationSec !== 'number' || session.durationSec <= 0) return false;
  return true;
}

/**
 * A Question with the spoiler fields removed, for passing into any component
 * that renders before the reveal. Using this type makes leaking the answer a
 * compile error rather than a code-review question.
 */
export type SafeQuestion = Omit<Question, 'beats' | 'modelAnswer' | 'coach'>;

export function stripAnswer(question: Question): SafeQuestion {
  const { beats: _beats, modelAnswer: _modelAnswer, coach: _coach, ...safe } = question;
  return safe;
}

// ---------------------------------------------------------------------------
// Stage copy
// ---------------------------------------------------------------------------

/**
 * What each stage asks the user to do. Kept here so the wording stays
 * consistent, and stays free of anything that could read as pressure.
 */
export const STAGE_COPY: Record<FlowStage, { title: string; hint: string }> = {
  drawn: {
    title: 'Read it, then answer out loud',
    hint: 'Stand up if that helps. Press record when you are ready to speak.',
  },
  recording: {
    title: 'Recording',
    hint: 'Say it the way you would say it in the room. Stop whenever you are done.',
  },
  rating: {
    title: 'How did that feel?',
    hint: 'Your own read, before you see the reference answer. There is no wrong answer here.',
  },
  revealed: {
    title: 'Reference answer',
    hint: 'Compare the structure, not the wording. The beats are the thing to keep.',
  },
};

/** Labels for the three self-ratings. None of them are failures. */
export const RATING_COPY: Record<SelfRating, { label: string; hint: string }> = {
  shaky: {
    label: 'Shaky',
    hint: 'Worth another go soon — this one will come round again sooner.',
  },
  ok: {
    label: 'Got there',
    hint: 'The shape was right, the delivery can tighten.',
  },
  solid: {
    label: 'Solid',
    hint: 'That one is landing. It will come up less often now.',
  },
};

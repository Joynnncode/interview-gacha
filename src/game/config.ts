/**
 * Every tunable number in the game lives here.
 *
 * If you want to change how the game feels, change it in this file. Nothing
 * below this file should contain a bare number that affects balance.
 */

import type { Likelihood, PetStage, Rarity, SelfRating } from '../types';

// ---------------------------------------------------------------------------
// Draw weights
// ---------------------------------------------------------------------------

export const DRAW_CONFIG = {
  /**
   * Base weight by how likely the question is in a real interview. A "high"
   * question comes up roughly four times as often as a "low" one.
   */
  likelihoodWeight: {
    high: 4,
    medium: 2,
    low: 1,
  } satisfies Record<Likelihood, number>,

  /**
   * Multiplier by rarity. Deliberately mild — this is a study tool wearing a
   * gacha costume, so rarity should not make the important questions rare.
   * SSR questions are the highest-leverage material, so they are NOT suppressed.
   */
  rarityWeight: {
    N: 1,
    R: 1,
    SR: 1,
    SSR: 1.2,
  } satisfies Record<Rarity, number>,

  /** Multiplier for a question that has never been drawn. Favours new material. */
  undiscoveredMultiplier: 2.5,

  /**
   * Multiplier by the most recent self-rating. A shaky answer comes back sooner.
   * This is the only place a self-rating has any mechanical effect, and it never
   * costs points.
   */
  ratingMultiplier: {
    shaky: 2.5,
    ok: 1.4,
    solid: 0.6,
  } satisfies Record<SelfRating, number>,

  /**
   * Questions answered within this many days are down-weighted, so the same
   * question does not come up twice in a row.
   */
  recencyWindowDays: 3,
  recencyMultiplier: 0.15,

  /**
   * Pity counter: after this many consecutive draws without an SSR, the next
   * draw is forced to be SSR if any SSR question is eligible.
   */
  ssrPityThreshold: 8,
} as const;

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/**
 * Points are awarded for COMPLETING a recording, never for answering well.
 * There is no code path anywhere in this app that subtracts points, and adding
 * one would break the whole premise.
 */
export const POINTS_CONFIG = {
  /** Awarded for every completed session, whatever the self-rating. */
  base: 10,

  /** Multiplier by rarity. SSR doubles, as promised in the bank's own schema. */
  rarityMultiplier: {
    N: 1,
    R: 1.25,
    SR: 1.5,
    SSR: 2,
  } satisfies Record<Rarity, number>,

  /**
   * Small bonus for a recording that lands near the question's time target.
   * "Near" means within this fraction of the target, either side.
   */
  onTargetTolerance: 0.35,
  onTargetBonus: 5,

  /** Bonus for the first completed session of the day. */
  dailyFirstBonus: 15,

  /** Added per consecutive day, capped so a broken streak is never punishing. */
  streakBonusPerDay: 2,
  streakBonusCap: 20,

  /** A recording shorter than this does not count as an attempt at all. */
  minValidRecordingSec: 5,
} as const;

// ---------------------------------------------------------------------------
// Pet growth
// ---------------------------------------------------------------------------

/**
 * Total points needed to reach each stage. The pet only ever moves forward
 * through these — it droops (mood), it never regresses and it never dies.
 */
export const PET_CONFIG = {
  stageThresholds: [
    { stage: 'egg', points: 0 },
    { stage: 'hatchling', points: 50 },
    { stage: 'fledgling', points: 200 },
    { stage: 'companion', points: 600 },
    { stage: 'sage', points: 1500 },
  ] as ReadonlyArray<{ stage: PetStage; points: number }>,

  /** Default name, editable in settings. */
  defaultName: 'Pip',

  /**
   * Days since the last session, mapped to mood. Drooping is the worst it gets:
   * there is no "hungry", no "it misses you", no crying face, ever.
   */
  moodByDaysIdle: {
    delightedWithinDays: 0, // answered today
    brightWithinDays: 1,
    contentWithinDays: 3,
    // anything beyond contentWithinDays is 'sleepy'
  },
} as const;

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/**
 * Badge definitions. Every one of these is earned by showing up and recording,
 * never by rating yourself highly.
 */
export const BADGE_DEFINITIONS = [
  {
    id: 'first-draw',
    name: 'First Pull',
    description: 'Drew your first question.',
    icon: '🎰',
  },
  {
    id: 'first-recording',
    name: 'Said It Out Loud',
    description: 'Recorded your first spoken answer.',
    icon: '🎙️',
  },
  {
    id: 'five-sessions',
    name: 'Warming Up',
    description: 'Completed five practice sessions.',
    icon: '🌱',
  },
  {
    id: 'twenty-sessions',
    name: 'In The Habit',
    description: 'Completed twenty practice sessions.',
    icon: '🌿',
  },
  {
    id: 'streak-three',
    name: 'Three In A Row',
    description: 'Practised three days running.',
    icon: '🔥',
  },
  {
    id: 'streak-seven',
    name: 'A Full Week',
    description: 'Practised seven days running.',
    icon: '🏵️',
  },
  {
    id: 'first-ssr',
    name: 'Gold Capsule',
    description: 'Drew and answered an SSR question.',
    icon: '✨',
  },
  {
    id: 'all-ssr',
    name: 'Full Gold Set',
    description: 'Answered every SSR question at least once.',
    icon: '👑',
  },
  {
    id: 'behavioural-sweep',
    name: 'Story Keeper',
    description: 'Answered every behavioural question at least once.',
    icon: '💬',
  },
  {
    id: 'tech-sweep',
    name: 'Whiteboard Ready',
    description: 'Answered every tech question at least once.',
    icon: '🧠',
  },
  {
    id: 'revisit-shaky',
    name: 'Second Pass',
    description: 'Came back to a question you rated shaky and rated it solid.',
    icon: '🔁',
  },
] as const;

export type BadgeId = (typeof BADGE_DEFINITIONS)[number]['id'];

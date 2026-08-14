/**
 * Points, pet growth and badges.
 *
 * The one rule that governs this whole file: rewards are tied to COMPLETING a
 * recording, never to answering well. There is no subtraction anywhere in here.
 * A 'shaky' self-rating earns exactly the same points as a 'solid' one — it only
 * affects how soon the question comes back around.
 */

import { BADGE_DEFINITIONS, PET_CONFIG, POINTS_CONFIG } from './config';
import type { Badge, PetMood, PetStage, PetState, Question, SelfRating, Session } from '../types';

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export interface PointsBreakdown {
  base: number;
  rarityBonus: number;
  onTargetBonus: number;
  dailyFirstBonus: number;
  streakBonus: number;
  total: number;
}

export interface PointsInput {
  question: Pick<Question, 'rarity' | 'timeTargetSec'>;
  durationSec: number;
  /** true when this is the first completed session today. */
  isFirstToday: boolean;
  /** Streak length including today. */
  streakDays: number;
}

/**
 * Note what is absent: no argument for the self-rating. That is deliberate, and
 * adding one would break the promise the app makes.
 */
export function computePoints(input: PointsInput): PointsBreakdown {
  const { question, durationSec, isFirstToday, streakDays } = input;

  const base = POINTS_CONFIG.base;
  const multiplier = POINTS_CONFIG.rarityMultiplier[question.rarity] ?? 1;
  const rarityBonus = Math.round(base * multiplier) - base;

  const target = question.timeTargetSec || 60;
  const drift = Math.abs(durationSec - target) / target;
  const onTargetBonus = drift <= POINTS_CONFIG.onTargetTolerance ? POINTS_CONFIG.onTargetBonus : 0;

  const dailyFirstBonus = isFirstToday ? POINTS_CONFIG.dailyFirstBonus : 0;

  const streakBonus = Math.min(
    Math.max(streakDays - 1, 0) * POINTS_CONFIG.streakBonusPerDay,
    POINTS_CONFIG.streakBonusCap,
  );

  const total = base + rarityBonus + onTargetBonus + dailyFirstBonus + streakBonus;
  return { base, rarityBonus, onTargetBonus, dailyFirstBonus, streakBonus, total };
}

/** A recording too short to be a real attempt does not open the reveal. */
export function isRecordingLongEnough(durationSec: number): boolean {
  return durationSec >= POINTS_CONFIG.minValidRecordingSec;
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

/** Local calendar date as YYYY-MM-DD. Local, not UTC, because a day means my day. */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetweenDateKeys(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Streak after completing a session today.
 * A gap resets the current streak but bestStreakDays keeps the record, so a
 * missed day never erases what already happened.
 */
export function nextStreak(pet: PetState, todayKey: string): Pick<PetState, 'streakDays' | 'bestStreakDays' | 'lastActiveDate'> {
  if (!pet.lastActiveDate) {
    return { streakDays: 1, bestStreakDays: Math.max(pet.bestStreakDays, 1), lastActiveDate: todayKey };
  }

  const gap = daysBetweenDateKeys(pet.lastActiveDate, todayKey);

  // Same day: streak unchanged.
  if (gap === 0) return { streakDays: pet.streakDays, bestStreakDays: pet.bestStreakDays, lastActiveDate: todayKey };

  const streakDays = gap === 1 ? pet.streakDays + 1 : 1;
  return {
    streakDays,
    bestStreakDays: Math.max(pet.bestStreakDays, streakDays),
    lastActiveDate: todayKey,
  };
}

// ---------------------------------------------------------------------------
// Pet
// ---------------------------------------------------------------------------

export const INITIAL_PET: PetState = {
  id: 1,
  name: PET_CONFIG.defaultName,
  stage: 'egg',
  mood: 'content',
  totalPoints: 0,
  streakDays: 0,
  bestStreakDays: 0,
};

/** Stage for a given point total. Monotonic: more points never means an earlier stage. */
export function stageForPoints(totalPoints: number): PetStage {
  let stage: PetStage = 'egg';
  for (const threshold of PET_CONFIG.stageThresholds) {
    if (totalPoints >= threshold.points) stage = threshold.stage;
  }
  return stage;
}

/** Points still needed for the next stage, or null once fully grown. */
export function progressToNextStage(totalPoints: number): { next: PetStage; remaining: number } | null {
  const upcoming = PET_CONFIG.stageThresholds.find((t) => totalPoints < t.points);
  if (!upcoming) return null;
  return { next: upcoming.stage, remaining: upcoming.points - totalPoints };
}

/**
 * Mood from how long it has been. The floor is 'sleepy' — the pet droops and
 * that is all. It is never hungry, never sad, never leaving.
 */
export function moodForDaysIdle(daysIdle: number): PetMood {
  const { moodByDaysIdle } = PET_CONFIG;
  if (daysIdle <= moodByDaysIdle.delightedWithinDays) return 'delighted';
  if (daysIdle <= moodByDaysIdle.brightWithinDays) return 'bright';
  if (daysIdle <= moodByDaysIdle.contentWithinDays) return 'content';
  return 'sleepy';
}

export function daysIdle(pet: PetState, today: Date): number {
  if (!pet.lastActiveDate) return 0;
  return Math.max(0, daysBetweenDateKeys(pet.lastActiveDate, toLocalDateKey(today)));
}

/** Warm, factual status line. No guilt, in any mood. */
export const PET_MOOD_COPY: Record<PetMood, string> = {
  delighted: 'Bouncing about. You practised today.',
  bright: 'Wide awake and pottering around.',
  content: 'Dozing happily. Here whenever you are.',
  sleepy: 'Curled up having a long nap. It will perk up when you next record.',
};

export const PET_STAGE_COPY: Record<PetStage, string> = {
  egg: 'Egg',
  hatchling: 'Hatchling',
  fledgling: 'Fledgling',
  companion: 'Companion',
  sage: 'Sage',
};

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/** Badge rows for a fresh database — all defined, none earned. */
export function initialBadges(): Badge[] {
  return BADGE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    icon: definition.icon,
  }));
}

export interface BadgeEvaluationInput {
  questions: Question[];
  /** Completed sessions only. */
  completedSessions: Session[];
  pet: PetState;
  /** Badges as currently stored, so already-earned ones are left alone. */
  badges: Badge[];
}

/**
 * Which badge ids are newly earned. Pure, so the caller decides when to write.
 * Every condition here is about turning up and recording.
 */
export function newlyEarnedBadges(input: BadgeEvaluationInput): string[] {
  const { questions, completedSessions, pet, badges } = input;

  const alreadyEarned = new Set(badges.filter((b) => b.earnedAt).map((b) => b.id));
  const earned: string[] = [];
  const award = (id: string, condition: boolean) => {
    if (condition && !alreadyEarned.has(id)) earned.push(id);
  };

  const answeredIds = new Set(completedSessions.map((s) => s.questionId));
  const answeredQuestions = questions.filter((q) => answeredIds.has(q.id));
  const anyDiscovered = questions.some((q) => q.discovered);

  const ssrQuestions = questions.filter((q) => q.rarity === 'SSR');
  const behaviouralQuestions = questions.filter((q) => q.category === 'behavioral');
  const techQuestions = questions.filter((q) => q.category === 'tech');

  const coversAll = (subset: Question[]) =>
    subset.length > 0 && subset.every((q) => answeredIds.has(q.id));

  award('first-draw', anyDiscovered);
  award('first-recording', completedSessions.length >= 1);
  award('five-sessions', completedSessions.length >= 5);
  award('twenty-sessions', completedSessions.length >= 20);
  award('streak-three', pet.streakDays >= 3);
  award('streak-seven', pet.streakDays >= 7);
  award('first-ssr', answeredQuestions.some((q) => q.rarity === 'SSR'));
  award('all-ssr', coversAll(ssrQuestions));
  award('behavioural-sweep', coversAll(behaviouralQuestions));
  award('tech-sweep', coversAll(techQuestions));
  award('revisit-shaky', hasShakyThenSolid(completedSessions));

  return earned;
}

/** True when some question was rated shaky and, on a later attempt, solid. */
function hasShakyThenSolid(completedSessions: Session[]): boolean {
  const byQuestion = new Map<string, SelfRating[]>();
  const ordered = [...completedSessions].sort((a, b) =>
    (a.completedAt ?? a.startedAt).localeCompare(b.completedAt ?? b.startedAt),
  );

  for (const session of ordered) {
    if (!session.selfRating) continue;
    const ratings = byQuestion.get(session.questionId) ?? [];
    ratings.push(session.selfRating);
    byQuestion.set(session.questionId, ratings);
  }

  for (const ratings of byQuestion.values()) {
    const firstShaky = ratings.indexOf('shaky');
    if (firstShaky === -1) continue;
    if (ratings.slice(firstShaky + 1).includes('solid')) return true;
  }
  return false;
}

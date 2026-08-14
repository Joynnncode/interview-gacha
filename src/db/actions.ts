/**
 * Every write that advances the game.
 *
 * Components call these; they never write to Dexie directly. Each function that
 * changes the flow stage goes through assertTransition first, so an illegal
 * stage change throws here rather than quietly leaking the answer somewhere.
 */

import { db, SINGLETON_ID } from './db';
import { assertTransition } from '../game/flow';
import {
  INITIAL_PET,
  computePoints,
  daysIdle,
  initialBadges,
  isRecordingLongEnough,
  moodForDaysIdle,
  newlyEarnedBadges,
  nextStreak,
  stageForPoints,
  toLocalDateKey,
} from '../game/rewards';
import type { PointsBreakdown } from '../game/rewards';
import type { Badge, PetState, SelfRating, Session, Settings } from '../types';

/** Ensure the singleton rows exist. Safe to call on every boot. */
export async function ensureBaseRecords(): Promise<void> {
  const [pet, badgeCount] = await Promise.all([db.pet.get(SINGLETON_ID), db.badges.count()]);

  if (!pet) await db.pet.put(INITIAL_PET);

  if (badgeCount === 0) {
    await db.badges.bulkPut(initialBadges());
  } else {
    // New badges added to the config since last run should appear unearned,
    // without disturbing anything already earned.
    const existing = new Set((await db.badges.toArray()).map((b) => b.id));
    const missing = initialBadges().filter((b) => !existing.has(b.id));
    if (missing.length > 0) await db.badges.bulkPut(missing);
  }
}

async function requireSession(sessionId: number): Promise<Session> {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  return session;
}

/** drawn → recording. Called when the microphone actually starts. */
export async function beginRecording(sessionId: number): Promise<void> {
  const session = await requireSession(sessionId);
  assertTransition(session.stage, 'recording');
  await db.sessions.update(sessionId, { stage: 'recording' });
}

/**
 * recording → drawn. Used when a recording is cancelled or came out too short
 * to count. Any stored audio for the session is discarded so the reveal cannot
 * be reached on the back of a discarded attempt.
 */
export async function discardRecording(sessionId: number): Promise<void> {
  const session = await requireSession(sessionId);
  assertTransition(session.stage, 'drawn');
  await db.transaction('rw', db.sessions, db.recordings, async () => {
    await db.recordings.where('sessionId').equals(sessionId).delete();
    await db.sessions.update(sessionId, { stage: 'drawn', durationSec: undefined });
  });
}

export interface SaveRecordingInput {
  sessionId: number;
  questionId: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/**
 * recording → rating. Stores the audio as a Blob and moves to self-rating.
 *
 * Returns false when the recording was too short to count, in which case the
 * session goes back to 'drawn' and nothing is stored.
 */
export async function saveRecording(input: SaveRecordingInput): Promise<boolean> {
  const session = await requireSession(input.sessionId);

  if (!isRecordingLongEnough(input.durationSec)) {
    await discardRecording(input.sessionId);
    return false;
  }

  assertTransition(session.stage, 'rating');

  await db.transaction('rw', db.sessions, db.recordings, async () => {
    // Replace rather than append, so a re-record does not leave orphans.
    await db.recordings.where('sessionId').equals(input.sessionId).delete();
    await db.recordings.add({
      sessionId: input.sessionId,
      questionId: input.questionId,
      blob: input.blob,
      mimeType: input.mimeType,
      durationSec: input.durationSec,
      createdAt: new Date().toISOString(),
    });
    await db.sessions.update(input.sessionId, {
      stage: 'rating',
      durationSec: input.durationSec,
    });
  });

  return true;
}

export interface CompleteSessionResult {
  points: PointsBreakdown;
  pet: PetState;
  /** Badges earned by this session, for the celebration. */
  newBadges: Badge[];
  petStageChanged: boolean;
}

/**
 * rating → revealed. This is the moment the answer unlocks and points are paid.
 *
 * The self-rating is recorded here and passed nowhere near computePoints. A
 * 'shaky' rating pays exactly what a 'solid' one does.
 */
export async function submitRatingAndReveal(
  sessionId: number,
  rating: SelfRating,
  now: Date = new Date(),
): Promise<CompleteSessionResult> {
  const session = await requireSession(sessionId);
  assertTransition(session.stage, 'revealed');

  const question = await db.questions.get(session.questionId);
  if (!question) throw new Error(`Question ${session.questionId} not found`);

  const pet = (await db.pet.get(SINGLETON_ID)) ?? INITIAL_PET;
  const todayKey = toLocalDateKey(now);

  const completedToday = await db.sessions
    .where('stage')
    .equals('revealed')
    .filter((s) => Boolean(s.completedAt) && toLocalDateKey(new Date(s.completedAt!)) === todayKey)
    .count();

  const streak = nextStreak(pet, todayKey);

  const points = computePoints({
    question,
    durationSec: session.durationSec ?? 0,
    isFirstToday: completedToday === 0,
    streakDays: streak.streakDays,
  });

  const totalPoints = pet.totalPoints + points.total;
  const previousStage = pet.stage;
  const updatedPet: PetState = {
    ...pet,
    ...streak,
    totalPoints,
    stage: stageForPoints(totalPoints),
    mood: 'delighted', // practised today
  };

  await db.transaction('rw', db.sessions, db.questions, db.pet, async () => {
    await db.sessions.update(sessionId, {
      stage: 'revealed',
      selfRating: rating,
      completedAt: now.toISOString(),
      pointsAwarded: points.total,
    });
    await db.questions.update(question.id, {
      discovered: true,
      timesAnswered: (question.timesAnswered ?? 0) + 1,
      lastAnsweredAt: now.toISOString(),
    });
    await db.pet.put(updatedPet);
  });

  const newBadges = await awardBadges(updatedPet, now);

  return {
    points,
    pet: updatedPet,
    newBadges,
    petStageChanged: updatedPet.stage !== previousStage,
  };
}

/** Evaluate the badge conditions and stamp any that are newly met. */
async function awardBadges(pet: PetState, now: Date): Promise<Badge[]> {
  const [questions, badges, completedSessions] = await Promise.all([
    db.questions.toArray(),
    db.badges.toArray(),
    db.sessions.where('stage').equals('revealed').toArray(),
  ]);

  const earnedIds = newlyEarnedBadges({ questions, completedSessions, pet, badges });
  if (earnedIds.length === 0) return [];

  const stamped = badges
    .filter((b) => earnedIds.includes(b.id))
    .map((b) => ({ ...b, earnedAt: now.toISOString() }));

  await db.badges.bulkPut(stamped);
  return stamped;
}

/**
 * Note on a session. Optional, never required to finish, and editable forever —
 * a note written straight after answering is often worth rewriting later, once
 * you know what actually mattered.
 *
 * A blank note clears the field rather than storing an empty string, so
 * `session.note` stays a reliable "is there a note" check everywhere.
 */
export async function saveNote(sessionId: number, note: string): Promise<void> {
  const trimmed = note.trim();
  await db.sessions.update(sessionId, { note: trimmed === '' ? undefined : trimmed });
}

/**
 * Delete the audio for one session, keeping the session itself.
 *
 * Deliberately narrow. It removes the recording row and nothing else:
 *
 * - Points are NOT retracted. They were earned by recording the answer, and
 *   that happened. Nothing in this app subtracts points (rule 7).
 * - The reference answer stays unlocked. isAnswerUnlocked() reads durationSec
 *   off the SESSION, not off the recording, so freeing up disk space cannot
 *   re-lock something already earned.
 * - The self-rating, note, and every statistic ("time spoken" included) survive,
 *   because the practice happened whether or not the file is still here.
 *
 * The caller is responsible for confirming with the user first: audio is the one
 * thing in this app that cannot be regenerated.
 */
export async function deleteRecordingForSession(sessionId: number): Promise<number> {
  return db.recordings.where('sessionId').equals(sessionId).delete();
}

/**
 * Refresh the pet's mood on boot, so an app opened after a few days away shows
 * a drooping pet rather than a stale delighted one. Stage and points are never
 * touched here — the pet does not regress.
 */
export async function refreshPetMood(now: Date = new Date()): Promise<void> {
  const pet = await db.pet.get(SINGLETON_ID);
  if (!pet) return;
  const mood = moodForDaysIdle(daysIdle(pet, now));
  if (mood !== pet.mood) await db.pet.update(SINGLETON_ID, { mood });
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await db.settings.get(SINGLETON_ID);
  await db.settings.put({ ...(current ?? { id: SINGLETON_ID }), ...patch, id: SINGLETON_ID } as Settings);
}

export async function renamePet(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.pet.update(SINGLETON_ID, { name: trimmed });
}

/**
 * Abandon an open session. Called when a draw is left without recording, so the
 * history does not fill up with dangling attempts. The draw still counted
 * towards discovery and the pity counter, which is intentional.
 */
export async function abandonSession(sessionId: number): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session || session.stage === 'revealed') return;
  await db.transaction('rw', db.sessions, db.recordings, async () => {
    await db.recordings.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

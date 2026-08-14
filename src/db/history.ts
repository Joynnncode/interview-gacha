/**
 * Reading past sessions back out, with their recordings.
 *
 * Kept as plain async functions rather than hooks so the join can be tested
 * without a browser. `useHistoryEntries` in src/hooks/useAppData.ts is a thin
 * useLiveQuery wrapper over loadHistoryEntries.
 *
 * Note what this deliberately does NOT do: it never loads audio Blobs to build
 * the list. Presence of a recording comes from the sessionId index alone, and
 * the Blob is only fetched when something actually asks to play it. Listing
 * every recording would mean holding every recording in memory.
 */

import { db } from './db';
import type { Question, Session } from '../types';

export interface HistoryEntry {
  session: Session;
  /** Absent if the question was removed from the bank after the session happened. */
  question: Question | undefined;
  /** True when a recording exists for this session and can be played back. */
  hasRecording: boolean;
}

/**
 * Every completed session, newest first, joined to its question and to whether
 * a recording exists for it.
 */
export async function loadHistoryEntries(limit?: number): Promise<HistoryEntry[]> {
  const sessions = await db.sessions.where('stage').equals('revealed').toArray();
  sessions.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const limited = typeof limit === 'number' ? sessions.slice(0, limit) : sessions;

  const sessionIds = limited
    .map((session) => session.id)
    .filter((id): id is number => typeof id === 'number');

  // .keys() reads the sessionId index without loading the records, so no audio
  // is pulled into memory just to find out that it exists.
  const recordedSessionIds = new Set(
    (await db.recordings.where('sessionId').anyOf(sessionIds).keys()) as number[],
  );

  const questions = await db.questions.toArray();
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return limited.map((session) => ({
    session,
    question: questionById.get(session.questionId),
    hasRecording: typeof session.id === 'number' && recordedSessionIds.has(session.id),
  }));
}

export interface StoredRecording {
  id: number;
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/**
 * The audio for one session. Called on demand, when something is about to play
 * it — never as part of building a list.
 */
export async function loadRecordingForSession(
  sessionId: number,
): Promise<StoredRecording | undefined> {
  const recording = await db.recordings.where('sessionId').equals(sessionId).first();
  if (!recording || typeof recording.id !== 'number') return undefined;

  return {
    id: recording.id,
    blob: recording.blob,
    mimeType: recording.mimeType,
    durationSec: recording.durationSec,
  };
}

/** Every past attempt at one question, oldest first. */
export async function loadAttemptsForQuestion(questionId: string): Promise<Session[]> {
  const sessions = await db.sessions
    .where('questionId')
    .equals(questionId)
    .filter((session) => session.stage === 'revealed')
    .toArray();

  sessions.sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
  return sessions;
}

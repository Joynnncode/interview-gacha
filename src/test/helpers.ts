/**
 * Shared test helpers.
 *
 * The important one is `reloadPage`. Closing and reopening the database drops
 * every bit of in-memory state — Dexie's caches, any object URL, any React state
 * — and forces the next read to come from IndexedDB, which is what a browser
 * refresh does. Without it a test cannot tell a persistence bug from a
 * read-path bug, which is exactly the distinction that mattered when the
 * "cannot play back an earlier recording" bug was found.
 */

import { expect } from 'vitest';
import { db } from '../db/db';
import { beginRecording, ensureBaseRecords, saveRecording, submitRatingAndReveal } from '../db/actions';
import type { Question, SelfRating } from '../types';

/** Matches the byte size seen in the real database when the playback bug was reported. */
export const RECORDING_BYTES = 68882;

/** Audio with non-zero content, so a truncated or re-encoded Blob cannot slip through. */
export function audioBlob(bytes = RECORDING_BYTES): Blob {
  const data = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1) data[i] = i % 251;
  return new Blob([data], { type: 'audio/webm' });
}

export function testQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'T01',
    category: 'tech',
    topic: 'LLM & RAG',
    question: 'Walk me through how you would design a RAG pipeline from scratch.',
    likelihood: 'high',
    rarity: 'SSR',
    timeTargetSec: 120,
    beats: ['Offline half', 'Online half'],
    modelAnswer: 'Reference answer that must stay locked until the reveal.',
    coach: 'What the question is really testing.',
    companySpecific: false,
    needsInput: false,
    tags: ['RAG'],
    discovered: false,
    timesAnswered: 0,
    ...overrides,
  };
}

/** A clean database with one question in the bank. */
export async function resetDatabase(): Promise<void> {
  await db.open();
  await Promise.all([
    db.questions.clear(),
    db.sessions.clear(),
    db.recordings.clear(),
    db.pet.clear(),
    db.badges.clear(),
  ]);
  await ensureBaseRecords();
  await db.questions.put(testQuestion());
}

/** Answer a question the whole way through, exactly as the UI does. */
export async function completeSession(
  questionId: string,
  durationSec: number,
  blob: Blob,
  rating: SelfRating = 'shaky',
): Promise<number> {
  const sessionId = (await db.sessions.add({
    questionId,
    startedAt: new Date().toISOString(),
    stage: 'drawn',
  })) as number;

  await beginRecording(sessionId);
  const accepted = await saveRecording({
    sessionId,
    questionId,
    blob,
    mimeType: 'audio/webm',
    durationSec,
  });
  expect(accepted).toBe(true);

  await submitRatingAndReveal(sessionId, rating);
  return sessionId;
}

/** Simulate a page reload. See the note at the top of this file. */
export async function reloadPage(): Promise<void> {
  db.close();
  await db.open();
}

/** Nudge the clock so two sessions completed in a row get distinct timestamps. */
export function tick(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

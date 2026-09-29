/**
 * "Say it again" from History.
 *
 * A retry is a brand-new attempt. The things that must hold: the reference
 * answer is locked for it until it is recorded and rated (rules 1 and 2), the
 * old take is left exactly as it was, and an unrated recording elsewhere is
 * never thrown away to make room for it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, SINGLETON_ID } from './db';
import { beginRecording, saveRecording, startRetry, submitRatingAndReveal } from './actions';
import { loadHistoryEntries } from './history';
import { countDrawsSinceSSR } from '../game/draw';
import { isAnswerUnlocked } from '../game/flow';
import { audioBlob, completeSession, reloadPage, resetDatabase, tick } from '../test/helpers';

beforeEach(resetDatabase);
afterEach(() => db.close());

describe('Starting another go at a practised question', () => {
  it('opens a new locked session and leaves the original untouched', async () => {
    const original = await completeSession('T01', 118, audioBlob(1024));
    const before = await db.sessions.get(original);

    const result = await startRetry(original);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await reloadPage();

    const retry = await db.sessions.get(result.sessionId);
    expect(retry?.stage).toBe('drawn');
    expect(retry?.questionId).toBe('T01');
    expect(retry?.retryOf).toBe(original);
    // Rule 1: the answer is not unlocked for the new attempt just because the
    // old one earned it.
    expect(isAnswerUnlocked(retry)).toBe(false);

    expect(await db.sessions.get(original)).toEqual(before);
    expect((await loadHistoryEntries())[0].hasRecording).toBe(true);
  });

  it('goes through record → rate → reveal and pays points like any attempt', async () => {
    const original = await completeSession('T01', 118, audioBlob(1024), 'shaky');
    const pointsBefore = (await db.pet.get(SINGLETON_ID))!.totalPoints;
    await tick();

    const result = await startRetry(original);
    if (!result.ok) throw new Error('retry refused');
    const id = result.sessionId;

    // Skipping the rating is still illegal.
    await expect(submitRatingAndReveal(id, 'solid')).rejects.toThrow();

    await beginRecording(id);
    await saveRecording({ sessionId: id, questionId: 'T01', blob: audioBlob(2048), mimeType: 'audio/webm', durationSec: 110 });
    expect(isAnswerUnlocked(await db.sessions.get(id))).toBe(false);
    await submitRatingAndReveal(id, 'solid');

    expect(isAnswerUnlocked(await db.sessions.get(id))).toBe(true);
    expect((await db.pet.get(SINGLETON_ID))!.totalPoints).toBeGreaterThan(pointsBefore);
    expect((await db.questions.get('T01'))?.timesAnswered).toBe(2);
    // Both takes are in history, each with its own audio.
    const entries = await loadHistoryEntries();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.hasRecording)).toBe(true);
  });

  it('replaces an untouched draw, but never discards a recording waiting to be rated', async () => {
    const original = await completeSession('T01', 118, audioBlob());

    const dangling = (await db.sessions.add({ questionId: 'T01', startedAt: new Date().toISOString(), stage: 'drawn' })) as number;
    const first = await startRetry(original);
    expect(first.ok).toBe(true);
    expect(await db.sessions.get(dangling)).toBeUndefined();

    if (!first.ok) return;
    await beginRecording(first.sessionId);
    await saveRecording({ sessionId: first.sessionId, questionId: 'T01', blob: audioBlob(512), mimeType: 'audio/webm', durationSec: 90 });

    // Now an attempt sits at 'rating' with audio. Another retry must refuse.
    expect(await startRetry(original)).toEqual({ ok: false, reason: 'unfinished' });
    expect((await db.sessions.get(first.sessionId))?.stage).toBe('rating');
    expect(await db.recordings.where('sessionId').equals(first.sessionId).count()).toBe(1);
  });

  it('refuses when the question has left the bank', async () => {
    const original = await completeSession('T01', 118, audioBlob());
    await db.questions.delete('T01');
    expect(await startRetry(original)).toEqual({ ok: false, reason: 'missing-question' });
  });
});

describe('Retries and the pity counter', () => {
  it('neither advance nor reset it, because they never went through the machine', () => {
    const rarity = new Map([
      ['S1', 'SSR'],
      ['N1', 'N'],
    ]);
    const base = { startedAt: '', stage: 'revealed' as const };
    const sessions = [
      { ...base, questionId: 'S1' },
      { ...base, questionId: 'N1' },
      { ...base, questionId: 'N1', retryOf: 2 },
      { ...base, questionId: 'S1', retryOf: 1 },
      { ...base, questionId: 'N1' },
    ];
    expect(countDrawsSinceSSR(sessions, rarity)).toBe(2);
  });
});

